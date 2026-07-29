import { useMemo, useRef } from "react"

type TokenType = "text" | "comment" | "key" | "string" | "number" | "boolean" | "punct" | "dash"
type Token = { type: TokenType; text: string }

const TOKEN_RE = new RegExp([
  "(#[^\\n]*)",                                                       // comment
  "(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^']|'')*')(?=\\s*:)",               // quoted key (JSON / quoted YAML key)
  "(\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^']|'')*')",                        // string
  "(?<=^[ \\t]*(?:-[ \\t]+)*)([A-Za-z0-9_.-]+)(?=\\s*:(?:\\s|$))",    // bare YAML key
  "\\b(true|false|null|~|True|False|Null|TRUE|FALSE|NULL)\\b",       // boolean / null
  "(-?\\d+\\.?\\d*(?:[eE][+-]?\\d+)?)\\b",                            // number
  "(^[ \\t]*-(?=\\s|$))",                                             // list dash
  "([{}[\\],:])",                                                     // punctuation
].join("|"), "gm")

const TYPES: TokenType[] = ["comment", "key", "string", "key", "boolean", "number", "dash", "punct"]

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let lastIndex = 0
  for (const match of source.matchAll(TOKEN_RE)) {
    if (match.index! > lastIndex) tokens.push({ type: "text", text: source.slice(lastIndex, match.index) })
    const typeIndex = TYPES.findIndex((_, index) => match[index + 1] !== undefined)
    tokens.push({ type: typeIndex === -1 ? "text" : TYPES[typeIndex], text: match[0] })
    lastIndex = match.index! + match[0].length
  }
  if (lastIndex < source.length) tokens.push({ type: "text", text: source.slice(lastIndex) })
  return tokens
}

/** Lightweight JSON/YAML token highlighter (no dependency: screen-spec documents are only ever JSON or YAML). */
export function CodeHighlight({ source }: { source: string }) {
  const tokens = useMemo(() => tokenize(source), [source])
  return <>{tokens.map((token, index) => token.type === "text" ? token.text : <span className={`tok-${token.type}`} key={index}>{token.text}</span>)}</>
}

/** Editable textarea with a highlighted overlay kept in sync on input and scroll. */
export function CodeEditor({ value, onChange, className, ariaLabel }: { value: string; onChange: (value: string) => void; className?: string; ariaLabel: string }) {
  const preRef = useRef<HTMLPreElement>(null)
  const syncScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    if (!preRef.current) return
    preRef.current.scrollTop = event.currentTarget.scrollTop
    preRef.current.scrollLeft = event.currentTarget.scrollLeft
  }
  return <div className={`code-editor ${className ?? ""}`}>
    <pre className="code-editor-highlight" aria-hidden="true" ref={preRef}><code><CodeHighlight source={`${value}\n`}/></code></pre>
    <textarea className="code-editor-input" aria-label={ariaLabel} value={value} spellCheck={false} onChange={(event) => onChange(event.target.value)} onScroll={syncScroll}/>
  </div>
}
