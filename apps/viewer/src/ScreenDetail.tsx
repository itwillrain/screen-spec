import { useState } from 'react'
import { StateDiagram } from './StateDiagram'
import type { ScreenView } from './screen-view'

interface Props {
  screen: ScreenView
  /** 読み込み済みの画面 id（遷移先がジャンプ可能か判定） */
  screenIds: string[]
  onNavigate: (screenId: string) => void
}

export function ScreenDetail({ screen, screenIds, onNavigate }: Props) {
  const tabs = [
    { id: 'fields', label: '項目', show: true },
    { id: 'layout', label: 'レイアウト', show: !!screen.layout },
    { id: 'params', label: 'パラメータ', show: !!screen.params },
    { id: 'states', label: '状態遷移', show: !!screen.stateMachine },
    { id: 'api', label: 'API 連携', show: screen.apiBindings.length > 0 },
    { id: 'transitions', label: '画面遷移', show: screen.transitions.length > 0 },
    { id: 'design', label: 'デザイン', show: !!screen.design },
    { id: 'raw', label: 'Raw YAML', show: true },
  ].filter((t) => t.show)

  const [tab, setTab] = useState('fields')
  const active = tabs.some((t) => t.id === tab) ? tab : 'fields'

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
        <ul className="warnings">
          {screen.warnings.map((w, i) => (
            <li key={i}>⚠ {w}</li>
          ))}
        </ul>
      ) : null}

      <nav className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={active === t.id ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {active === 'fields' ? <FieldsTab screen={screen} /> : null}
      {active === 'layout' && screen.layout ? <LayoutTab screen={screen} /> : null}
      {active === 'params' && screen.params ? <ParamsTab screen={screen} /> : null}
      {active === 'states' && screen.stateMachine ? (
        <section>
          <p className="muted">states / events から生成した状態遷移図です。</p>
          <StateDiagram sm={screen.stateMachine} />
        </section>
      ) : null}
      {active === 'api' ? <ApiTab screen={screen} /> : null}
      {active === 'transitions' ? (
        <TransitionsTab screen={screen} screenIds={screenIds} onNavigate={onNavigate} />
      ) : null}
      {active === 'design' && screen.design ? <DesignTab screen={screen} /> : null}
      {active === 'raw' ? (
        <section>
          <pre className="raw">{screen.rawText}</pre>
        </section>
      ) : null}
    </>
  )
}

function FieldsTab({ screen }: { screen: ScreenView }) {
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()
  const fields = q
    ? screen.fields.filter((f) => f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q))
    : screen.fields
  return (
    <section>
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
              <td>{field.visibleWhen ? <code>{field.visibleWhen}</code> : <span className="muted">—</span>}</td>
              <td>
                {field.origin ? (
                  <span className="badge badge-ref" title={field.origin}>$ref</span>
                ) : (
                  <span className="muted">inline</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function LayoutTab({ screen }: { screen: ScreenView }) {
  const fieldByKey = new Map(screen.fields.map((f) => [f.key, f]))
  return (
    <section>
      <p className="muted">言語レベルの構造（セクション・列・幅ヒント）。</p>
      {screen.layout!.sections.map((sec, i) => (
        <div key={sec.id ?? i} className="layout-section">
          <h3>
            {sec.title ?? sec.id ?? `section ${i + 1}`}
            {sec.region ? <span className="badge badge-region">{sec.region}</span> : null}
          </h3>
          <div className="layout-grid" style={{ gridTemplateColumns: `repeat(${sec.columns}, 1fr)` }}>
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
                      <a className="cell-design" href={designUrl} target="_blank" rel="noreferrer">🎨</a>
                    ) : null}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </section>
  )
}

function ParamsTab({ screen }: { screen: ScreenView }) {
  return (
    <section>
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
  )
}

function ApiTab({ screen }: { screen: ScreenView }) {
  return (
    <section>
      {screen.apiBindings.map((b) => {
        const op = b.operation
        const reqFields = new Set(op?.requestFields ?? [])
        const resFields = new Set(op?.responseFields ?? [])
        const queryParams = new Set(op?.parameters.filter((p) => p.in === 'query').map((p) => p.name))
        const pathParams = new Set(op?.parameters.filter((p) => p.in === 'path').map((p) => p.name))
        const requestKnown = (scope: string, key: string): boolean => {
          if (!op) return true
          if (scope === 'body') return reqFields.has(key)
          if (scope === 'query') return queryParams.has(key)
          if (scope === 'path') return pathParams.has(key)
          return true
        }
        return (
          <div key={b.key} className="binding">
            <h3>
              <code>{b.key}</code>
              {op ? (
                <span className="op">
                  <span className={`method method-${op.method.toLowerCase()}`}>{op.method}</span>
                  <code>{op.path}</code>
                </span>
              ) : (
                <span className="badge badge-ng" title={`${b.specRef} に ${b.operationId} が見つかりません`}>
                  未解決
                </span>
              )}
            </h3>
            <p className="muted">
              <code>{b.operationId}</code> @ <code>{b.specRef}</code>
              {op?.summary ? ` — ${op.summary}` : ''}
            </p>

            {b.specUrl ? (
              <p className="op-links">
                <a
                  href={`https://redocly.github.io/redoc/?url=${encodeURIComponent(b.specUrl)}#operation/${b.operationId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Redoc で開く ↗
                </a>
                <a
                  href={`https://petstore.swagger.io/?url=${encodeURIComponent(b.specUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Swagger UI で開く ↗
                </a>
                <a href={b.specUrl} target="_blank" rel="noreferrer">
                  OpenAPI (raw) ↗
                </a>
              </p>
            ) : null}

            {op && op.parameters.length > 0 ? (
              <p className="muted">
                params:{' '}
                {op.parameters.map((p) => (
                  <code key={`${p.in}:${p.name}`} className="op-param">
                    {p.in}:{p.name}
                    {p.required ? '*' : ''}
                  </code>
                ))}
              </p>
            ) : null}

            <div className="binding-cols">
              <div>
                <h4>request</h4>
                {b.requestMappings.length === 0 ? (
                  <span className="muted">—</span>
                ) : (
                  <ul className="rules">
                    {b.requestMappings.map((m, i) => {
                      const known = requestKnown(m.scope, m.key)
                      return (
                        <li key={i}>
                          <code>{m.scope}.{m.key}</code>
                          {!known ? <span className="badge badge-ng mini" title="OpenAPI に無い項目">?</span> : null}
                          {' '}← <code>{m.expr}</code>
                        </li>
                      )
                    })}
                  </ul>
                )}
                {op ? (
                  <p className="muted small">OpenAPI body: {op.requestFields.join(', ') || '—'}</p>
                ) : null}
              </div>
              <div>
                <h4>response</h4>
                {b.responseMappings.length === 0 ? (
                  <span className="muted">—</span>
                ) : (
                  <ul className="rules">
                    {b.responseMappings.map((m, i) => {
                      const top = m.expr.split('.')[0]
                      const known = resFields.has(m.field) || resFields.has(top)
                      return (
                        <li key={i}>
                          <code>{m.field}</code> ← <code>{m.expr}</code>
                          {op && !known ? <span className="badge badge-ng mini" title="OpenAPI レスポンスに無い項目">?</span> : null}
                        </li>
                      )
                    })}
                  </ul>
                )}
                {op ? (
                  <p className="muted small">OpenAPI response: {op.responseFields.join(', ') || '—'}</p>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </section>
  )
}

function TransitionsTab({
  screen,
  screenIds,
  onNavigate,
}: {
  screen: ScreenView
  screenIds: string[]
  onNavigate: (id: string) => void
}) {
  const known = new Set(screenIds)
  return (
    <section>
      <p className="muted">遷移先が読み込み済みならクリックでその仕様書へ移動します。</p>
      <ul className="rules">
        {screen.transitions.map((t) => (
          <li key={t.key}>
            <code>{t.key}</code> →{' '}
            {known.has(t.to) ? (
              <button className="link" onClick={() => onNavigate(t.to)}>
                <code>{t.to}</code> ↗
              </button>
            ) : (
              <code title="未読み込みの画面">{t.to}</code>
            )}
            {t.trigger ? <span className="muted"> （{t.trigger}）</span> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function DesignTab({ screen }: { screen: ScreenView }) {
  const design = screen.design!
  return (
    <section>
      {design.figma ? (
        <p>
          <a href={design.figma} target="_blank" rel="noreferrer">Figma を開く ↗</a>
        </p>
      ) : null}
      {design.images.length > 0 ? (
        <div className="mockups">
          {design.images.map((img, i) => (
            <figure key={i} className="mockup">
              <img src={img.url} alt={img.caption ?? `mockup ${i + 1}`} loading="lazy" />
              {img.caption ? <figcaption className="muted">{img.caption}</figcaption> : null}
            </figure>
          ))}
        </div>
      ) : null}
      {design.links.length > 0 ? (
        <ul className="rules">
          {design.links.map((l, i) => (
            <li key={i}>
              <a href={l.url} target="_blank" rel="noreferrer">{l.label ?? l.url} ↗</a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
