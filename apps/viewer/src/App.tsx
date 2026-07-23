import { useEffect, useState } from 'react'
import { buildScreenView, fetchLoader, type ScreenView } from './screen-view'
import { StateDiagram } from './StateDiagram'

// 既定で読み込む spec（public/specs 配下・base 相対）
const DEFAULT_SPEC = 'specs/user-edit.screen.yaml'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; screen: ScreenView }

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const base = import.meta.env.BASE_URL // 例: "/" や "/screen-spec/viewer/"
    const entryUri = new URL(`${base}${DEFAULT_SPEC}`, window.location.origin).href
    let cancelled = false
    buildScreenView(entryUri, fetchLoader)
      .then((screen) => {
        if (!cancelled) setState({ status: 'ready', screen })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') {
    return (
      <main className="page">
        <p className="muted">spec を読み込み中…</p>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="page">
        <h1>読み込みエラー</h1>
        <p className="badge badge-ng">{state.message}</p>
      </main>
    )
  }

  const screen = state.screen
  return (
    <main className="page">
      <header className="page-head">
        <p className="eyebrow">screen-spec viewer</p>
        <h1>{screen.name}</h1>
        {screen.description ? <p className="muted">{screen.description}</p> : null}
        <dl className="meta">
          <div>
            <dt>id</dt>
            <dd><code>{screen.id}</code></dd>
          </div>
          {screen.route ? (
            <div>
              <dt>route</dt>
              <dd><code>{screen.route}</code></dd>
            </div>
          ) : null}
          <div>
            <dt>検証</dt>
            <dd>
              {screen.valid ? (
                <span className="badge badge-ok">valid</span>
              ) : (
                <span className="badge badge-ng">{screen.issueCount} issue(s)</span>
              )}
            </dd>
          </div>
        </dl>
      </header>

      {screen.warnings.length > 0 ? (
        <section>
          <h2>警告</h2>
          <ul className="warnings">
            {screen.warnings.map((w, i) => (
              <li key={i}>⚠ {w}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2>フィールド一覧</h2>
        <p className="muted">
          記述順＝表示順。ブラウザで <code>$ref</code> を解決して表示しています。
        </p>
        <table className="fields">
          <thead>
            <tr>
              <th>キー</th>
              <th>ラベル</th>
              <th>型</th>
              <th>必須</th>
              <th>バリデーション</th>
              <th>由来</th>
            </tr>
          </thead>
          <tbody>
            {screen.fields.map((field) => (
              <tr key={field.key}>
                <td><code>{field.key}</code></td>
                <td>{field.label}</td>
                <td><code>{field.type}</code></td>
                <td>{field.required ? '✔' : ''}</td>
                <td>
                  {field.validations.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    <ul className="rules">
                      {field.validations.map((v, i) => (
                        <li key={i}>
                          <code>{v.rule}</code>
                          {v.message ? <span className="muted"> — {v.message}</span> : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>
                  {field.origin ? (
                    <span className="badge badge-ref" title={field.origin}>
                      $ref
                    </span>
                  ) : (
                    <span className="muted">inline</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {screen.stateMachine ? (
        <section>
          <h2>状態遷移</h2>
          <p className="muted">states / events から生成した状態遷移図です。</p>
          <StateDiagram sm={screen.stateMachine} />
        </section>
      ) : null}

      {screen.apiBindings.length > 0 ? (
        <section>
          <h2>API 連携</h2>
          <table className="fields">
            <thead>
              <tr>
                <th>キー</th>
                <th>operationId</th>
                <th>specRef</th>
                <th>request</th>
                <th>response</th>
              </tr>
            </thead>
            <tbody>
              {screen.apiBindings.map((b) => (
                <tr key={b.key}>
                  <td><code>{b.key}</code></td>
                  <td><code>{b.operationId}</code></td>
                  <td><code>{b.specRef}</code></td>
                  <td>
                    {b.requestMappings.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <ul className="rules">
                        {b.requestMappings.map((m, i) => (
                          <li key={i}>
                            <code>{m.scope}.{m.key}</code> ← <code>{m.expr}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>
                    {b.responseMappings.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <ul className="rules">
                        {b.responseMappings.map((m, i) => (
                          <li key={i}>
                            <code>{m.field}</code> ← <code>{m.expr}</code>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </main>
  )
}
