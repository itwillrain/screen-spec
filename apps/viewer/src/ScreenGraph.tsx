import { useEffect, useId, useState } from 'react'
import { getMermaid } from './mermaid-loader'
import type { ScreenView } from './screen-view'

function safeId(id: string): string {
  return id.replace(/[^\w]/g, '_')
}

function toMermaid(screens: ScreenView[]): string {
  const known = new Map(screens.map((s) => [s.id, s.name || s.id]))
  const lines: string[] = ['flowchart LR']
  // ノード（読み込まれた画面）
  for (const s of screens) {
    lines.push(`  ${safeId(s.id)}["${s.name || s.id}"]`)
  }
  // 参照先だが未読み込みの画面もノード化（点線スタイル）
  const unknownTargets = new Set<string>()
  for (const s of screens) {
    for (const t of s.transitions) {
      if (t.to && !known.has(t.to)) unknownTargets.add(t.to)
    }
  }
  for (const id of unknownTargets) {
    lines.push(`  ${safeId(id)}["${id}"]:::unknown`)
  }
  // エッジ
  for (const s of screens) {
    for (const t of s.transitions) {
      if (!t.to) continue
      const label = t.trigger ? `|${t.trigger}|` : ''
      lines.push(`  ${safeId(s.id)} -->${label} ${safeId(t.to)}`)
    }
  }
  lines.push('  classDef unknown stroke-dasharray: 4 4,fill:#f9fafb,color:#9ca3af;')
  return lines.join('\n')
}

export function ScreenGraph({ screens }: { screens: ScreenView[] }) {
  const id = useId().replace(/:/g, '_')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getMermaid()
      .then((mermaid) => mermaid.render(`graph_${id}`, toMermaid(screens)))
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [screens, id])

  return (
    <>
      {error ? <p className="badge badge-ng">画面遷移図の描画に失敗しました: {error}</p> : null}
      {!error && !svg ? <p className="muted" role="status">画面遷移図を読み込み中…</p> : null}
      {svg ? <div className="diagram" role="img" aria-label="画面間遷移図" dangerouslySetInnerHTML={{ __html: svg }} /> : null}
      <details className="diagram-alternative">
        <summary>画面遷移をリストで表示</summary>
        <ul>{screens.flatMap((screen) => screen.transitions.filter((transition) => transition.to).map((transition, index) => (
          <li key={`${screen.id}:${transition.to}:${index}`}><code>{screen.id}</code> → <code>{transition.to}</code>{transition.trigger ? `（${transition.trigger}）` : ""}</li>
        )))}</ul>
      </details>
    </>
  )
}
