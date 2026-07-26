import { Fragment, useState } from 'react'
import { testItemsToCsv, testItemsToMarkdown } from '@screen-spec/core'
import { StateDiagram } from './StateDiagram'
import type { AccessControlView, EventOutcomeView, ExpectationView, ScreenView } from './screen-view'

interface Props {
  screen: ScreenView
  /** 読み込み済みの画面 id（遷移先がジャンプ可能か判定） */
  screenIds: string[]
  onNavigate: (screenId: string) => void
}

export function ScreenDetail({ screen, screenIds, onNavigate }: Props) {
  const tabs = [
    { id: 'fields', label: '項目', show: true },
    { id: 'params', label: 'パラメータ', show: !!screen.params },
    { id: 'access', label: '権限', show: !!screen.accessControl },
    { id: 'states', label: '状態遷移', show: !!screen.stateMachine },
    { id: 'api', label: 'API 連携', show: screen.apiBindings.length > 0 },
    { id: 'transitions', label: '画面遷移', show: screen.transitions.length > 0 },
    { id: 'tests', label: `テスト項目 (${screen.testItems.length})`, show: screen.testItems.length > 0 },
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

      <nav className="tabs" role="tablist" aria-label="画面仕様の詳細">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={active === t.id ? 'tab active' : 'tab'}
            role="tab"
            aria-selected={active === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {active === 'fields' ? <FieldsTab screen={screen} /> : null}
      {active === 'params' && screen.params ? <ParamsTab screen={screen} /> : null}
      {active === 'access' && screen.accessControl ? (
        <AccessTab screen={screen} accessControl={screen.accessControl} />
      ) : null}
      {active === 'states' && screen.stateMachine ? (
        <StatesTab screen={screen} />
      ) : null}
      {active === 'api' ? <ApiTab screen={screen} /> : null}
      {active === 'transitions' ? (
        <TransitionsTab screen={screen} screenIds={screenIds} onNavigate={onNavigate} />
      ) : null}
      {active === 'tests' ? <TestItemsTab screen={screen} /> : null}
      {active === 'design' && screen.design ? <DesignTab screen={screen} /> : null}
      {active === 'raw' ? (
        <section>
          <pre className="raw">{screen.rawText}</pre>
        </section>
      ) : null}
    </>
  )
}

function TestItemsTab({ screen }: { screen: ScreenView }) {
  const [category, setCategory] = useState('all')
  const categories = Array.from(new Set(screen.testItems.map((item) => item.category)))
  const items = category === 'all'
    ? screen.testItems
    : screen.testItems.filter((item) => item.category === category)
  const download = (format: 'markdown' | 'csv') => {
    const content = format === 'csv' ? testItemsToCsv(screen.testItems) : testItemsToMarkdown(screen.testItems)
    const mime = format === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8'
    const extension = format === 'csv' ? 'csv' : 'md'
    const url = URL.createObjectURL(new Blob([content], { type: mime }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${screen.id}-test-items.${extension}`
    anchor.click()
    URL.revokeObjectURL(url)
  }
  return (
    <section>
      <p className="muted">形式化された仕様から機械的に導出したテスト候補です。</p>
      <div className="test-export">
        <button className="test-export-button" onClick={() => download('markdown')}>Markdownをダウンロード</button>
        <button className="test-export-button" onClick={() => download('csv')}>CSVをダウンロード</button>
      </div>
      <div className="test-filters" role="group" aria-label="テストカテゴリ">
        {['all', ...categories].map((value) => (
          <button
            key={value}
            className={category === value ? 'test-filter active' : 'test-filter'}
            onClick={() => setCategory(value)}
          >
            {value === 'all' ? `すべて (${screen.testItems.length})` : value}
          </button>
        ))}
      </div>
      <table className="fields test-items">
        <thead>
          <tr><th>ID</th><th>カテゴリ</th><th>対象</th><th>テスト条件</th><th>前提・入力</th><th>期待結果</th></tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td><code>{item.id}</code></td>
              <td><span className="badge badge-region">{item.category}</span></td>
              <td><code>{item.target}</code></td>
              <td>{item.title}</td>
              <td>
                {item.params || item.given ? (
                  <dl className="test-context">
                    {item.params ? <><dt>params</dt><dd><code>{JSON.stringify(item.params)}</code></dd></> : null}
                    {item.given ? <><dt>given</dt><dd><code>{JSON.stringify(item.given)}</code></dd></> : null}
                  </dl>
                ) : <span className="muted">—</span>}
              </td>
              <td>{item.expected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function StatesTab({ screen }: { screen: ScreenView }) {
  return (
    <section>
      <p className="muted">states / events から生成した状態遷移図と、分岐ごとの期待結果です。</p>
      <StateDiagram sm={screen.stateMachine!} />
      {screen.events.length > 0 ? (
        <div className="events">
          <h2>イベント詳細</h2>
          {screen.events.map((event) => (
            <article key={event.key} className="event-card">
              <header>
                <h3><code>{event.key}</code></h3>
                {event.trigger ? <span className="badge badge-region">{event.trigger}</span> : null}
                {event.target ? <span className="muted">target: <code>{event.target}</code></span> : null}
              </header>
              <p className="event-route">
                <code>{event.from ?? '?'}</code> → <code>{event.to ?? '?'}</code>
                {event.apiCall ? <> · API <code>{event.apiCall}</code></> : null}
              </p>
              <OutcomeBlock label="即時" outcome={{ to: event.to, expects: event.expects }} />
              {event.onSuccess ? <OutcomeBlock label="成功" outcome={event.onSuccess} /> : null}
              {event.onError ? (
                <>
                  <OutcomeBlock label="既定エラー" outcome={event.onError} />
                  {event.onError.cases.map((errorCase, index) => (
                    <OutcomeBlock
                      key={`${errorCase.status ?? '*'}:${errorCase.code ?? '*'}:${index}`}
                      label={`エラー条件 ${[
                        errorCase.status !== undefined ? `HTTP ${errorCase.status}` : null,
                        errorCase.code ? `code=${errorCase.code}` : null,
                      ].filter(Boolean).join(' / ')}`}
                      outcome={errorCase}
                    />
                  ))}
                </>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function OutcomeBlock({ label, outcome }: { label: string; outcome: EventOutcomeView }) {
  if (!outcome.to && !outcome.navigate && !outcome.expects) return null
  return (
    <div className="event-outcome">
      <h4>{label}</h4>
      <p>
        {outcome.to ? <>state → <code>{outcome.to}</code></> : null}
        {outcome.navigate ? <> · navigate → <code>{outcome.navigate}</code></> : null}
      </p>
      {outcome.expects ? <ExpectationDetails expects={outcome.expects} /> : null}
    </div>
  )
}

function ExpectationDetails({ expects }: { expects: ExpectationView }) {
  return (
    <div className="expectation">
      <span className="expectation-label">expects</span>
      <ul className="rules">
        {expects.state ? <li>state: <code>{expects.state}</code></li> : null}
        {expects.navigate ? <li>navigate: <code>{expects.navigate}</code></li> : null}
        {expects.message ? (
          <li>
            message: <span className={`message-kind message-${expects.message.kind}`}>{expects.message.kind}</span>{' '}
            {expects.message.text ? <span>{expects.message.text}</span> : null}
            {expects.message.key ? <code>{expects.message.key}</code> : null}
          </li>
        ) : null}
        {expects.fields.map((field) => (
          <li key={field.field}>
            field <code>{field.field}</code>:{' '}
            {field.expression !== undefined ? <>expression=<code>{field.expression}</code>{' '}</> : null}
            {field.value !== undefined ? <>value=<code>{formatExpectedValue(field.value)}</code>{' '}</> : null}
            {field.visible !== undefined ? <>visible=<code>{String(field.visible)}</code>{' '}</> : null}
            {field.enabled !== undefined ? <>enabled=<code>{String(field.enabled)}</code></> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function formatExpectedValue(value: unknown): string {
  if (typeof value === 'string') return value
  const json = JSON.stringify(value)
  return json === undefined ? String(value) : json
}

function FieldsTab({ screen }: { screen: ScreenView }) {
  const [filter, setFilter] = useState('')
  const q = filter.trim().toLowerCase()
  const fields = q
    ? screen.fields.filter((f) => f.key.toLowerCase().includes(q) || f.label.toLowerCase().includes(q))
    : screen.fields

  const sectionByFieldKey = new Map<string, string>()
  screen.layout?.sections.forEach((sec, i) => {
    const label = sec.title ?? sec.id ?? `section ${i + 1}`
    sec.fieldKeys.forEach((key) => sectionByFieldKey.set(key, label))
  })

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
            <th>既定</th>
            <th>バリデーション</th>
            <th>表示条件</th>
            <th>編集可否</th>
            <th>由来</th>
            {screen.layout ? <th>セクション</th> : null}
            <th>幅</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.key}>
              <td><code>{field.key}</code></td>
              <td>{field.label}</td>
              <td><code>{field.type}</code></td>
              <td>{field.required ? '✔' : ''}</td>
              <td>{field.default !== undefined ? <code>{String(field.default)}</code> : <span className="muted">—</span>}</td>
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
              <td>{field.enabledWhen ? <code>{field.enabledWhen}</code> : <span className="muted">—</span>}</td>
              <td>
                {field.origin ? (
                  <span className="badge badge-ref" title={field.origin}>$ref</span>
                ) : (
                  <span className="muted">inline</span>
                )}
              </td>
              {screen.layout ? (
                <td>{sectionByFieldKey.get(field.key) ?? <span className="muted">—</span>}</td>
              ) : null}
              <td>{field.width ? <code>{field.width}</code> : <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

/** "*" 既定を解決した実効値（個別指定 > "*" > 未定義）。 */
function effectiveAccess(
  map: Record<string, { view?: boolean; edit?: boolean; execute?: boolean }>,
  key: string,
  prop: 'view' | 'edit' | 'execute',
): boolean | undefined {
  const specific = map[key]?.[prop]
  if (typeof specific === 'boolean') return specific
  const wild = map['*']?.[prop]
  return typeof wild === 'boolean' ? wild : undefined
}

function AccessCell({ value }: { value?: boolean }) {
  if (value === true) return <span className="ac-yes">✓</span>
  if (value === false) return <span className="ac-no">✗</span>
  return <span className="muted">—</span>
}

function AccessTab({
  screen,
  accessControl,
}: {
  screen: ScreenView
  accessControl: AccessControlView
}) {
  const roles = accessControl.roles
  const fieldKeys = screen.fields.map((f) => f.key)
  const eventKeys = screen.events.map((e) => e.key)
  return (
    <section>
      <p className="muted">role × リソース × 操作。<code>*</code> 既定を解決した実効値です。</p>

      <h3>画面（view）</h3>
      <table className="fields">
        <thead>
          <tr>
            <th>role</th>
            <th>view</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((r) => (
            <tr key={r.role}>
              <td><code>{r.role}</code></td>
              <td><AccessCell value={r.screenView} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>フィールド（view / edit）</h3>
      <table className="fields matrix">
        <thead>
          <tr>
            <th rowSpan={2}>field</th>
            {roles.map((r) => (
              <th key={r.role} colSpan={2}>{r.role}</th>
            ))}
          </tr>
          <tr>
            {roles.map((r) => (
              <Fragment key={r.role}>
                <th>view</th>
                <th>edit</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {fieldKeys.map((fk) => (
            <tr key={fk}>
              <td><code>{fk}</code></td>
              {roles.map((r) => (
                <Fragment key={r.role}>
                  <td><AccessCell value={effectiveAccess(r.fields, fk, 'view')} /></td>
                  <td><AccessCell value={effectiveAccess(r.fields, fk, 'edit')} /></td>
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {eventKeys.length > 0 ? (
        <>
          <h3>イベント（execute）</h3>
          <table className="fields matrix">
            <thead>
              <tr>
                <th>event</th>
                {roles.map((r) => (
                  <th key={r.role}>{r.role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {eventKeys.map((ek) => (
                <tr key={ek}>
                  <td><code>{ek}</code></td>
                  {roles.map((r) => (
                    <td key={r.role}><AccessCell value={effectiveAccess(r.events, ek, 'execute')} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
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
