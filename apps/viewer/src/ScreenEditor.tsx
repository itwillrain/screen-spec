import { useEffect, useMemo, useState } from "react"
import { parseYaml, stringifyYaml, validateSpec, type DocumentLoader, type ValidateResult } from "@screen-spec/core"
import { fetchLoader, type ScreenView } from "./screen-view"
import { CodeEditor, CodeHighlight } from "./CodeHighlight"

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type EditorMode = "form" | "yaml" | "diff"
type EditableDocument = { uri: string; original: string; raw: string; loading?: boolean; error?: string }

const clone = <T,>(value: T): T => structuredClone(value)
const isObject = (value: Json): value is Record<string, Json> => !!value && typeof value === "object" && !Array.isArray(value)
const draftKey = (uri: string) => `screen-spec-editor-draft:${uri}`
const fileName = (uri: string) => { try { return decodeURIComponent(new URL(uri).pathname.split("/").pop() || "screen.yaml") } catch { return uri.split("/").pop() || "screen.yaml" } }

function updateAt(root: Json, path: (string | number)[], next: Json | undefined): Json {
  if (!path.length) return next ?? {}
  const copy = clone(root)
  let parent: any = copy
  for (const part of path.slice(0, -1)) parent = parent[part]
  const key = path.at(-1)!
  if (next === undefined) Array.isArray(parent) ? parent.splice(Number(key), 1) : delete parent[key]
  else parent[key] = next
  return copy
}

function externalRefUris(raw: string, baseUri: string): string[] {
  let document: unknown
  try { document = parseYaml(raw) } catch { return [] }
  const found = new Set<string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== "object") return
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string") {
        const file = child.split("#", 1)[0]
        if (file && !/^[a-z][a-z0-9+.-]*:/i.test(file) && !file.startsWith("/")) found.add(new URL(file, baseUri).href)
      } else visit(child)
    }
  }
  visit(document)
  return [...found]
}

function ValueEditor({ value, path, onChange }: { value: Json; path: (string | number)[]; onChange: (path: (string | number)[], value?: Json) => void }) {
  if (Array.isArray(value)) return <fieldset className="editor-group"><legend>{path.at(-1) ?? "document"} <span>{value.length}件</span></legend>{value.map((item, index) => <div className="editor-row" key={index}><ValueEditor value={item} path={[...path, index]} onChange={onChange}/><div className="editor-row-actions"><button type="button" disabled={index === 0} aria-label={`${index + 1}番目を上へ`} onClick={() => { const next = [...value]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(path, next) }}>↑</button><button type="button" disabled={index === value.length - 1} aria-label={`${index + 1}番目を下へ`} onClick={() => { const next = [...value]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(path, next) }}>↓</button><button type="button" onClick={() => onChange([...path, index], undefined)}>削除</button></div></div>)}<button type="button" onClick={() => onChange(path, [...value, ""])}>項目を追加</button></fieldset>
  if (isObject(value)) return <fieldset className="editor-group"><legend>{path.at(-1) ?? "document"}</legend>{Object.entries(value).map(([key, item]) => <div className="editor-property" key={key}><div className="editor-property-value"><span className="editor-property-name">{key}</span><ValueEditor value={item} path={[...path, key]} onChange={onChange}/></div><button type="button" onClick={() => onChange([...path, key], undefined)}>削除</button></div>)}<button type="button" onClick={() => { const key = window.prompt("追加するキー"); if (key && !(key in value)) onChange(path, { ...value, [key]: "" }) }}>プロパティを追加</button></fieldset>
  if (typeof value === "boolean") return <select value={String(value)} onChange={(event) => onChange(path, event.target.value === "true")}><option value="true">true</option><option value="false">false</option></select>
  if (typeof value === "number") return <input type="number" value={value} onChange={(event) => onChange(path, Number(event.target.value))}/>
  if (value === null) return <input value="null" onChange={(event) => onChange(path, event.target.value)}/>
  return <textarea rows={Math.min(8, Math.max(1, String(value).split("\n").length))} value={value} onChange={(event) => onChange(path, event.target.value)}/>
}

export function ScreenEditor({ screen, onClose }: { screen: ScreenView; onClose: () => void }) {
  const entryDocument = useMemo<EditableDocument>(() => ({ uri: screen.sourceUri, original: screen.rawText, raw: localStorage.getItem(draftKey(screen.sourceUri)) ?? screen.rawText }), [screen.sourceUri, screen.rawText])
  const [documents, setDocuments] = useState<Record<string, EditableDocument>>({ [entryDocument.uri]: entryDocument })
  const [activeUri, setActiveUri] = useState(entryDocument.uri)
  const [mode, setMode] = useState<EditorMode>("form")
  const [section, setSection] = useState<string>()
  const [validation, setValidation] = useState<ValidateResult>()

  useEffect(() => { setDocuments({ [entryDocument.uri]: entryDocument }); setActiveUri(entryDocument.uri); setSection(undefined) }, [entryDocument])
  useEffect(() => {
    let cancelled = false
    const discover = async () => {
      const visited = new Set<string>()
      const queue = externalRefUris(entryDocument.raw, entryDocument.uri)
      while (queue.length) {
        const uri = queue.shift()!
        if (visited.has(uri) || uri === entryDocument.uri) continue
        visited.add(uri)
        setDocuments((current) => ({ ...current, [uri]: current[uri] ?? { uri, original: "", raw: "", loading: true } }))
        try {
          const original = await fetchLoader(uri)
          if (cancelled) return
          const raw = localStorage.getItem(draftKey(uri)) ?? original
          setDocuments((current) => ({ ...current, [uri]: { uri, original, raw } }))
          queue.push(...externalRefUris(raw, uri))
        } catch (error) {
          if (!cancelled) setDocuments((current) => ({ ...current, [uri]: { uri, original: "", raw: "", error: error instanceof Error ? error.message : "読み込めませんでした" } }))
        }
      }
    }
    void discover()
    return () => { cancelled = true }
  }, [entryDocument])

  const activeDocument = documents[activeUri] ?? entryDocument
  const raw = activeDocument.raw
  const parsed = useMemo(() => { try { return parseYaml(raw) as Json } catch { return undefined } }, [raw])
  const sections = isObject(parsed as Json) ? Object.keys(parsed as Record<string, Json>) : []
  const activeSection = section && sections.includes(section) ? section : sections[0]
  const documentList = Object.values(documents)
  const changedDocuments = documentList.filter((document) => document.raw !== document.original)

  useEffect(() => {
    for (const document of Object.values(documents)) {
      if (!document.loading && !document.error) document.raw === document.original ? localStorage.removeItem(draftKey(document.uri)) : localStorage.setItem(draftKey(document.uri), document.raw)
    }
    const loadDraft: DocumentLoader = (uri) => documents[uri]?.raw ?? fetchLoader(uri)
    const timer = window.setTimeout(() => { void validateSpec(documents[entryDocument.uri]?.raw ?? entryDocument.raw, entryDocument.uri, loadDraft).then(setValidation).catch((error) => setValidation({ valid: false, warnings: [], issues: [{ stage: "resolve", path: "/", message: error instanceof Error ? error.message : "検証に失敗しました" }] })) }, 250)
    return () => window.clearTimeout(timer)
  }, [documents, entryDocument])

  const setRaw = (next: string) => setDocuments((current) => ({ ...current, [activeUri]: { ...current[activeUri], raw: next } }))
  const selectDocument = (uri: string) => { setActiveUri(uri); setSection(undefined) }
  const download = () => { const url = URL.createObjectURL(new Blob([raw], { type: "text/yaml;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName(activeDocument.uri); anchor.click(); URL.revokeObjectURL(url) }
  const reset = () => { localStorage.removeItem(draftKey(activeDocument.uri)); setRaw(activeDocument.original) }

  return <section className="screen-editor">
    <header><div><p className="eyebrow">screen-spec editor</p><h1>{screen.name}</h1><p className="muted">{changedDocuments.length ? `${changedDocuments.length}ファイルに未出力の変更があります` : "変更はありません"}</p></div><button type="button" onClick={onClose}>Viewerへ戻る</button></header>
    <nav className="editor-documents" aria-label="編集するファイル">{documentList.map((document) => <button type="button" className={activeUri === document.uri ? "active" : ""} onClick={() => selectDocument(document.uri)} disabled={document.loading || !!document.error} title={document.uri} key={document.uri}>{document.uri === entryDocument.uri ? "画面" : "関連"} · {fileName(document.uri)}{document.raw !== document.original ? " ●" : ""}</button>)}</nav>
    <div className="editor-toolbar"><nav className="editor-tabs" aria-label="編集モード">{(["form", "yaml", "diff"] as const).map((item) => <button type="button" className={mode === item ? "active" : ""} onClick={() => setMode(item)} key={item}>{item === "form" ? "構造編集" : item === "yaml" ? "YAML" : "差分"}</button>)}</nav><span className="editor-current-file">{activeDocument.uri}</span></div>
    <div className="editor-validation" role="status"><strong>{validation?.valid ? "検証OK" : `${validation?.issues.length ?? 0}件のエラー`}</strong>{validation?.issues.slice(0, 5).map((issue) => <span key={issue.stage + issue.path + issue.message}><code>{issue.path}</code> {issue.message}</span>)}{validation?.warnings.slice(0, 3).map((issue) => <span className="warning" key={issue.stage + issue.path + issue.message}><code>{issue.path}</code> {issue.message}</span>)}</div>
    {activeDocument.error ? <p className="warnings">{activeDocument.error}</p> : mode === "form" ? parsed !== undefined && isObject(parsed) ? <><nav className="editor-sections" aria-label="編集する仕様セクション">{sections.map((name) => <button type="button" className={activeSection === name ? "active" : ""} onClick={() => setSection(name)} key={name}>{name}</button>)}</nav>{activeSection ? <ValueEditor value={parsed[activeSection]} path={[activeSection]} onChange={(path, value) => setRaw(stringifyYaml(updateAt(parsed, path, value)))}/> : null}</> : <p className="warnings">YAMLを解析できません。YAMLタブで修正してください。</p> : null}
    {mode === "yaml" ? <CodeEditor className="editor-yaml" ariaLabel="YAMLを編集" value={raw} onChange={setRaw}/> : null}
    {mode === "diff" ? <div className="editor-diff"><section><h2>変更前</h2><pre><code><CodeHighlight source={activeDocument.original}/></code></pre></section><section><h2>変更後</h2><pre><code><CodeHighlight source={raw}/></code></pre></section></div> : null}
    <footer><span>{changedDocuments.length ? "Browser Draft保存済み" : "変更なし"}</span><button type="button" disabled={raw === activeDocument.original} onClick={reset}>このファイルの変更を破棄</button><button type="button" disabled={!validation?.valid || activeDocument.loading} onClick={download}>{fileName(activeDocument.uri)}をダウンロード</button></footer>
  </section>
}
