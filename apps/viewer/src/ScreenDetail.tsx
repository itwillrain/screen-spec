import { useState } from 'react'
import { StateDiagram } from './StateDiagram'
import type { ScreenView } from './screen-view'

export function ScreenDetail({ screen }: { screen: ScreenView }) {
  const [filter, setFilter] = useState('')
  const [showRaw, setShowRaw] = useState(false)
  const q = filter.trim().toLowerCase()
  const fields = q
    ? screen.fields.filter(
        (f) => f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q),
      )
    : screen.fields
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

      {screen.params ? (
        <section>
          <h2>パラメータ</h2>
          {(['path', 'query'] as const).map((kind) =>
            screen.params && screen.params[kind].length > 0 ? (
              <div key={kind}>
                <h3>{kind}</h3>
                <table className="fields">
                  <thead>
                    <tr>
                      <th>名前</th>
                      <th>型</th>
                      <th>必須</th>
                      <th>既定</th>
                      <th>候補</th>
                      <th>説明</th>
                    </tr>
                  </thead>
                  <tbody>
                    {screen.params[kind].map((p) => (
                      <tr key={p.name}>
                        <td><code>{p.name}</code></td>
                        <td>{p.type ? <code>{p.type}</code> : <span className="muted">—</span>}</td>
                        <td>{p.required ? '✔' : ''}</td>
                        <td>{p.default !== undefined ? <code>{String(p.default)}</code> : <span className="muted">—</span>}</td>
                        <td>{p.enum ? <code>{p.enum.map(String).join(', ')}</code> : <span className="muted">—</span>}</td>
                        <td>{p.description ?? <span className="muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null,
          )}
        </section>
      ) : null}

      {screen.design ? (
        <section>
          <h2>デザイン</h2>
          {screen.design.figma ? (
            <p>
              <a href={screen.design.figma} target="_blank" rel="noreferrer">
                Figma を開く ↗
              </a>
            </p>
          ) : null}
          {screen.design.images.length > 0 ? (
            <div className="mockups">
              {screen.design.images.map((img, i) => (
                <figure key={i} className="mockup">
                  <img src={img.url} alt={img.caption ?? `mockup ${i + 1}`} loading="lazy" />
                  {img.caption ? <figcaption className="muted">{img.caption}</figcaption> : null}
                </figure>
              ))}
            </div>
          ) : null}
          {screen.design.links.length > 0 ? (
            <ul className="rules">
              {screen.design.links.map((l, i) => (
                <li key={i}>
                  <a href={l.url} target="_blank" rel="noreferrer">
                    {l.label ?? l.url} ↗
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

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
        <input
          className="filter"
          type="search"
          placeholder="フィールドを絞り込み（キー/ラベル）"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <table className="fields">
          <thead>
            <tr>
              <th>キー</th>
              <th>ラベル</th>
              <th>型</th>
              <th>必須</th>
              <th>バリデーション</th>
              <th>表示条件</th>
              <th>由来</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
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
                  {field.visibleWhen ? (
                    <code>{field.visibleWhen}</code>
                  ) : (
                    <span className="muted">—</span>
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

      {screen.layout ? (
        <section>
          <h2>レイアウト</h2>
          <p className="muted">言語レベルの構造（セクション・列・幅ヒント）。</p>
          {screen.layout.sections.map((sec, i) => {
            const fieldByKey = new Map(screen.fields.map((f) => [f.key, f]))
            return (
              <div key={sec.id ?? i} className="layout-section">
                <h3>
                  {sec.title ?? sec.id ?? `section ${i + 1}`}
                  {sec.region ? <span className="badge badge-region">{sec.region}</span> : null}
                </h3>
                <div
                  className="layout-grid"
                  style={{ gridTemplateColumns: `repeat(${sec.columns}, 1fr)` }}
                >
                  {sec.fieldKeys.map((key) => {
                    const f = fieldByKey.get(key)
                    const span = f?.width === 'full' ? sec.columns : 1
                    const designUrl = f?.design?.figma ?? f?.design?.images[0]?.url
                    return (
                      <div key={key} className="layout-cell" style={{ gridColumn: `span ${span}` }}>
                        <span className="cell-label">{f?.label ?? key}</span>
                        <code className="cell-key">{key}</code>
                        <span className="cell-tags">
                          {f?.width ? <span className="cell-width">{f.width}</span> : null}
                          {f?.visibleWhen ? <span className="cell-cond" title={f.visibleWhen}>条件</span> : null}
                          {designUrl ? (
                            <a className="cell-design" href={designUrl} target="_blank" rel="noreferrer">
                              🎨
                            </a>
                          ) : null}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </section>
      ) : null}

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

      <section>
        <h2>
          Raw YAML{' '}
          <button className="link" onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? '隠す' : '表示'}
          </button>
        </h2>
        {showRaw ? <pre className="raw">{screen.rawText}</pre> : null}
      </section>
    </>
  )
}
