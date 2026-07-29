import { useEffect, useMemo, useState } from "react"
import { parseYaml, stringifyYaml, validateSpec, type ValidateResult } from "@screen-spec/core"
import { fetchLoader, type ScreenView } from "./screen-view"

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
const clone = <T,>(value: T): T => structuredClone(value)
const isObject = (value: Json): value is Record<string, Json> => !!value && typeof value === "object" && !Array.isArray(value)

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

function ValueEditor({ value, path, onChange }: { value: Json; path: (string | number)[]; onChange: (path: (string | number)[], value?: Json) => void }) {
  if (Array.isArray(value)) return <fieldset className="editor-group"><legend>{path.at(-1) ?? "document"} <span>{value.length}件</span></legend>{value.map((item, index) => <div className="editor-row" key={index}><ValueEditor value={item} path={[...path, index]} onChange={onChange}/><div className="editor-row-actions"><button type="button" disabled={index === 0} onClick={() => { const next = [...value]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(path, next) }}>↑</button><button type="button" disabled={index === value.length - 1} onClick={() => { const next = [...value]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; onChange(path, next) }}>↓</button><button type="button" onClick={() => onChange([...path, index], undefined)}>削除</button></div></div>)}<button type="button" onClick={() => onChange(path, [...value, ""])}>項目を追加</button></fieldset>
  if (isObject(value)) return <fieldset className="editor-group"><legend>{path.at(-1) ?? "document"}</legend>{Object.entries(value).map(([key, item]) => <div className="editor-property" key={key}><label><span>{key}</span><ValueEditor value={item} path={[...path, key]} onChange={onChange}/></label><button type="button" onClick={() => onChange([...path, key], undefined)}>削除</button></div>)}<button type="button" onClick={() => { const key = window.prompt("追加するキー"); if (key && !(key in value)) onChange(path, { ...value, [key]: "" }) }}>プロパティを追加</button></fieldset>
  if (typeof value === "boolean") return <select value={String(value)} onChange={(event) => onChange(path, event.target.value === "true")}><option value="true">true</option><option value="false">false</option></select>
  if (typeof value === "number") return <input type="number" value={value} onChange={(event) => onChange(path, Number(event.target.value))}/>
  if (value === null) return <input value="null" onChange={(event) => onChange(path, event.target.value)}/>
  return <textarea rows={Math.min(8, Math.max(1, String(value).split("\n").length))} value={value} onChange={(event) => onChange(path, event.target.value)}/>
}

export function ScreenEditor({ screen, onClose }: { screen: ScreenView; onClose: () => void }) {
  const key = `screen-spec-editor-draft:${screen.sourceUri}`
  const original = screen.rawText
  const [raw, setRaw] = useState(() => localStorage.getItem(key) ?? original)
  const [mode, setMode] = useState<"form" | "yaml" | "diff">("form")
  const [validation, setValidation] = useState<ValidateResult>()
  const parsed = useMemo(() => { try { return parseYaml(raw) as Json } catch { return undefined } }, [raw])
  useEffect(() => { localStorage.setItem(key, raw); const timer = window.setTimeout(() => void validateSpec(raw, screen.sourceUri, fetchLoader).then(setValidation), 250); return () => window.clearTimeout(timer) }, [raw, key, screen.sourceUri])
  const changed = raw !== original
  const download = () => { const url = URL.createObjectURL(new Blob([raw], { type: "text/yaml;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = screen.sourceUri.split("/").pop() ?? `${screen.id}.screen.yaml`; anchor.click(); URL.revokeObjectURL(url) }
  return <section className="screen-editor">
    <header><div><p className="eyebrow">screen-spec editor</p><h1>{screen.name}</h1><p className="muted">{changed ? "未出力の変更があります" : "変更はありません"}</p></div><button type="button" onClick={onClose}>Viewerへ戻る</button></header>
    <nav className="editor-tabs">{(["form", "yaml", "diff"] as const).map((item) => <button type="button" className={mode === item ? "active" : ""} onClick={() => setMode(item)} key={item}>{item === "form" ? "構造編集" : item === "yaml" ? "YAML" : "差分"}</button>)}</nav>
    <div className="editor-validation" role="status"><strong>{validation?.valid ? "検証OK" : `${validation?.issues.length ?? 0}件のエラー`}</strong>{validation?.issues.slice(0, 5).map((issue) => <span key={issue.path + issue.message}><code>{issue.path}</code> {issue.message}</span>)}</div>
    {mode === "form" ? parsed !== undefined ? <ValueEditor value={parsed} path={[]} onChange={(path, value) => setRaw(stringifyYaml(updateAt(parsed, path, value)))}/> : <p className="warnings">YAMLを解析できません。YAMLタブで修正してください。</p> : null}
    {mode === "yaml" ? <textarea className="editor-yaml" aria-label="YAMLを編集" value={raw} onChange={(event) => setRaw(event.target.value)}/> : null}
    {mode === "diff" ? <div className="editor-diff"><section><h2>変更前</h2><pre>{original}</pre></section><section><h2>変更後</h2><pre>{raw}</pre></section></div> : null}
    <footer><span>{changed ? "Draft保存済み" : "変更なし"}</span><button type="button" disabled={!changed} onClick={() => { localStorage.removeItem(key); setRaw(original) }}>変更を破棄</button><button type="button" disabled={!validation?.valid} onClick={download}>YAMLをダウンロード</button></footer>
  </section>
}
