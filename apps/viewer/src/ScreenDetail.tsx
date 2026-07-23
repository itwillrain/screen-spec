import { StateDiagram } from './StateDiagram'
import type { ScreenView } from './screen-view'

export function ScreenDetail({ screen }: { screen: ScreenView }) {
  return (
    <>
      <header className="page-head">
        <p className="eyebrow">screen</p>
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

      {screen.transitions.length > 0 ? (
        <section>
          <h2>画面遷移</h2>
          <ul className="rules">
            {screen.transitions.map((t) => (
              <li key={t.key}>
                <code>{t.key}</code> → <code>{t.to}</code>
                {t.trigger ? <span className="muted"> （{t.trigger}）</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}
