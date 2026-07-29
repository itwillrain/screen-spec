import { useEffect, useId, useRef, useState } from 'react'
import { renderMermaid } from './mermaid-loader'
import type { StateMachineView } from './screen-view'

/** Mermaid のノード/ラベルに使えないよう文字を除去する。 */
function sanitize(text: string): string {
  return text.replace(/[^\w ぀-ヿ一-鿿（）()]/g, '').trim()
}

function toMermaid(sm: StateMachineView): string {
  const lines: string[] = ['stateDiagram-v2']
  const nameByKey = new Map(sm.states.map((s) => [s.key, s.name]))
  for (const s of sm.states) {
    if (s.name) lines.push(`  ${s.key}: ${sanitize(s.name)}`)
    if (s.initial) lines.push(`  [*] --> ${s.key}`)
  }
  for (const e of sm.edges) {
    const label = e.label ? `: ${sanitize(e.label)}` : ''
    lines.push(`  ${e.from} --> ${e.to}${label}`)
    // 参照だけの状態にも表示名を付けておく
    void nameByKey
  }
  return lines.join('\n')
}

export function StateDiagram({ sm }: { sm: StateMachineView }) {
  const id = useId().replace(/:/g, '_')
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    const graph = toMermaid(sm)
    renderMermaid("sm_" + id, graph)
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [sm, id])

  return (
    <>
      {error ? <p className="badge badge-ng">状態遷移図の描画に失敗しました: {error}</p> : null}
      {!error && !svg ? <p className="muted" role="status">状態遷移図を読み込み中…</p> : null}
      {svg ? <div className="diagram" role="img" aria-label="状態遷移図" ref={ref} dangerouslySetInnerHTML={{ __html: svg }} /> : null}
      <details className="diagram-alternative">
        <summary>状態遷移をリストで表示</summary>
        <ul>{sm.edges.map((edge, index) => (
          <li key={`${edge.from}:${edge.to}:${index}`}><code>{edge.from}</code> → <code>{edge.to}</code>{edge.label ? `（${edge.label}）` : ""}</li>
        ))}</ul>
      </details>
    </>
  )
}
