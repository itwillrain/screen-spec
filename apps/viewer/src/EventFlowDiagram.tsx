import { useEffect, useId, useRef, useState } from 'react'
import { renderMermaid } from './mermaid-loader'
import type { EventOutcomeView, EventView } from './screen-view'

const clean = (value: string) => value.replace(/["<>|{}]/g, '').replace(/\s+/g, ' ').trim()

function outcomeText(outcome?: EventOutcomeView, fallback = '完了'): string {
  if (!outcome) return fallback
  const parts: string[] = []
  if (outcome.to) parts.push(`状態: ${outcome.to}`)
  if (outcome.navigate) parts.push(`画面: ${outcome.navigate}`)
  const message = outcome.expects?.message
  if (message) parts.push(`${message.kind}: ${message.text ?? message.key ?? 'メッセージ'}`)
  return clean(parts.join(' / ') || fallback)
}

function toMermaid(event: EventView): string {
  const lines = ['flowchart LR']
  let serial = 0
  const id = (kind: string) => `${kind}_${serial++}`
  const trigger = id('trigger')
  const triggerText = event.target ? `操作: ${event.target}` : event.trigger ? `発生: ${event.trigger}` : 'きっかけ未定義'
  lines.push(`  ${trigger}(["${clean(triggerText)}"]):::trigger`)

  const outcome = (from: string, edge: string, value: EventOutcomeView | undefined, kind: string, fallback: string) => {
    const target = id(kind)
    lines.push(`  ${target}["${outcomeText(value, fallback)}"]:::${kind}`)
    lines.push(`  ${from} -->|${clean(edge)}| ${target}`)
    return target
  }
  const completions = (from: string, result?: EventOutcomeView, success?: EventOutcomeView, error?: EventView['onError']) => {
    let rendered = false
    if (result?.to || result?.navigate || result?.expects) { outcome(from, '実行後', result, 'result', '完了'); rendered = true }
    if (success) { outcome(from, '成功', success, 'success', '成功'); rendered = true }
    if (error) {
      const errorNode = outcome(from, 'エラー', error, 'error', 'エラー')
      rendered = true
      error.cases.forEach((item) => {
        const condition = [item.status ? `HTTP ${item.status}` : '', item.code ? `code=${item.code}` : ''].filter(Boolean).join(' / ') || 'その他'
        outcome(errorNode, condition, item, 'error', condition)
      })
    }
    if (!rendered) outcome(from, '完了', undefined, 'result', '完了')
  }

  if (event.branches.length) {
    const decision = id('decision')
    lines.push(`  ${decision}{"条件分岐"}:::decision`, `  ${trigger} --> ${decision}`)
    event.branches.forEach((branch) => {
      const action = id('action')
      const condition = branch.otherwise ? 'その他' : branch.when ?? branch.id
      const text = branch.apiCall ? `API: ${branch.apiCall}` : outcomeText(branch, branch.id)
      lines.push(`  ${action}["${clean(text)}"]:::action`, `  ${decision} -->|${clean(condition)}| ${action}`)
      if (branch.apiCall) completions(action, branch, branch.onSuccess, branch.onError)
      else if (branch.onSuccess || branch.onError) completions(action, undefined, branch.onSuccess, branch.onError)
    })
  } else if (event.apiCall) {
    const action = id('action')
    lines.push(`  ${action}["API: ${clean(event.apiCall)}"]:::action`, `  ${trigger} --> ${action}`)
    completions(action, { to: event.to, expects: event.expects }, event.onSuccess, event.onError)
  } else {
    completions(trigger, { to: event.to, expects: event.expects }, event.onSuccess, event.onError)
  }
  lines.push(
    '  classDef trigger fill:#eef2ff,stroke:#6366f1,color:#312e81;',
    '  classDef decision fill:#fff7ed,stroke:#f59e0b,color:#7c2d12;',
    '  classDef action fill:#eff6ff,stroke:#3b82f6,color:#1e3a8a;',
    '  classDef result fill:#f8fafc,stroke:#94a3b8,color:#334155;',
    '  classDef success fill:#ecfdf5,stroke:#22c55e,color:#14532d;',
    '  classDef error fill:#fef2f2,stroke:#ef4444,color:#7f1d1d;',
  )
  return lines.join('\n')
}

export function EventFlowDiagram({ event, onOpenApi }: { event: EventView; onOpenApi: (apiKey: string) => void }) {
  const id = useId().replace(/:/g, '_')
  const [svg, setSvg] = useState('')
  const [error, setError] = useState('')
  const container = useRef<HTMLDivElement>(null)
  const apiKeys = [...new Set([event.apiCall, ...event.branches.map((branch) => branch.apiCall)].filter((key): key is string => !!key))]
  useEffect(() => {
    let cancelled = false
    setSvg(''); setError('')
    renderMermaid("event_" + id, toMermaid(event))
      .then((result) => { if (!cancelled) setSvg(result.svg) })
      .catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { cancelled = true }
  }, [event, id])
  useEffect(() => {
    if (!svg || !container.current) return
    const cleanups: Array<() => void> = []
    for (const node of container.current.querySelectorAll<SVGGElement>('.node')) {
      const apiKey = apiKeys.find((key) => node.textContent?.includes(`API: ${key}`))
      if (!apiKey) continue
      const activate = () => onOpenApi(apiKey)
      const onKeyDown = (keyboard: globalThis.KeyboardEvent) => {
        if (keyboard.key !== 'Enter' && keyboard.key !== ' ') return
        keyboard.preventDefault()
        activate()
      }
      node.classList.add('api-node-link')
      node.setAttribute('role', 'button')
      node.setAttribute('tabindex', '0')
      node.setAttribute('aria-label', `API ${apiKey} の詳細を開く`)
      node.addEventListener('click', activate)
      node.addEventListener('keydown', onKeyDown)
      cleanups.push(() => { node.removeEventListener('click', activate); node.removeEventListener('keydown', onKeyDown) })
    }
    return () => cleanups.forEach((cleanup) => cleanup())
  }, [svg, event, onOpenApi])
  if (error) return <p className="badge badge-ng">イベントフロー図の描画に失敗しました: {error}</p>
  if (!svg) return <p className="muted" role="status">イベントフロー図を読み込み中…</p>
  return <div ref={container} className="diagram event-flow-diagram" role="group" aria-label={`${event.key}の処理フロー`} dangerouslySetInnerHTML={{ __html: svg }} />
}
