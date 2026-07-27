import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { DiagnosticView, EventBranchView, EventView, FieldView, ScreenView } from './screen-view'

const PANE_KEY = 'screen-spec-field-review-pane'
const COLLAPSED_KEY = 'screen-spec-field-review-design-collapsed'
const ZOOM_KEY = 'screen-spec-field-review-zoom'
const DRAWER_KEY = 'screen-spec-field-review-drawer-width'

function queryValue(key: string): string | undefined {
  return new URLSearchParams(window.location.search).get(key) ?? undefined
}

function setQuery(values: Record<string, string | undefined>) {
  const url = new URL(window.location.href)
  Object.entries(values).forEach(([key, value]) => value ? url.searchParams.set(key, value) : url.searchParams.delete(key))
  window.history.replaceState(null, '', url)
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value
  const json = JSON.stringify(value)
  return json === undefined ? String(value) : json
}

function fieldDiagnostics(screen: ScreenView, field: FieldView, events: EventView[]): DiagnosticView[] {
  const keys = new Set([field.key, ...events.map((event) => event.key)])
  return screen.diagnostics.filter((diagnostic) => {
    if (diagnostic.path.includes(`/fields/${field.key}`) || diagnostic.path.endsWith(`/${field.key}`)) return true
    return [...keys].some((key) => diagnostic.path.endsWith(`/${key}`) || diagnostic.message.includes(`"${key}"`))
  })
}

function relatedEvents(screen: ScreenView, field: FieldView): EventView[] {
  return screen.events.filter((event) => event.key === field.eventId || event.target === field.key)
}

export function FieldReviewWorkspace({ screen, onOpenTab }: { screen: ScreenView; onOpenTab: (tab: string) => void }) {
  const [filter, setFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [conditionFilter, setConditionFilter] = useState(false)
  const [diagnosticFilter, setDiagnosticFilter] = useState(false)
  const [drawerWidth, setDrawerWidth] = useState(() => {
    const saved = Number(localStorage.getItem(DRAWER_KEY)) || 512
    return Math.min(Math.max(360, window.innerWidth - 64), Math.max(320, saved))
  })
  const initialField = queryValue('field')
  const [selectedKey, setSelectedKey] = useState(() => screen.fields.some((field) => field.key === initialField) ? initialField : undefined)
  const detailHeading = useRef<HTMLHeadingElement>(null)
  const [panePercent, setPanePercent] = useState(() => Number(localStorage.getItem(PANE_KEY)) || 40)
  const [designCollapsed, setDesignCollapsed] = useState(() => {
    const saved = localStorage.getItem(COLLAPSED_KEY)
    return saved === null ? window.matchMedia("(max-width: 760px)").matches : saved === "true"
  })
  const hasDesign = !!screen.design

  const sections = useMemo(() => {
    const result = new Map<string, string>()
    screen.layout?.sections.forEach((section, index) => {
      const label = section.title ?? section.id ?? `section ${index + 1}`
      section.fieldKeys.forEach((key) => result.set(key, label))
    })
    return result
  }, [screen.layout])

  const enriched = useMemo(() => screen.fields.map((field) => {
    const events = relatedEvents(screen, field)
    return { field, events, diagnostics: fieldDiagnostics(screen, field, events) }
  }), [screen])

  const types = [...new Set(screen.fields.map((field) => field.type).filter(Boolean))]
  const q = filter.trim().toLowerCase()
  const rows = enriched.filter(({ field, events, diagnostics }) => {
    if (q && ![field.key, field.label, field.text ?? ''].some((value) => value.toLowerCase().includes(q))) return false
    if (typeFilter !== 'all' && field.type !== typeFilter) return false
    if (eventFilter === 'linked' && events.length === 0) return false
    if (eventFilter === 'unlinked' && events.length > 0) return false
    if (conditionFilter && !field.visibleWhen && !field.enabledWhen) return false
    if (diagnosticFilter && diagnostics.length === 0) return false
    return true
  })

  const selected = enriched.find(({ field }) => field.key === selectedKey)
  const selectField = (key: string) => {
    setSelectedKey(key)
    setQuery({ field: key })
    requestAnimationFrame(() => detailHeading.current?.focus())
  }
  const closeDetail = () => {
    setSelectedKey(undefined)
    setQuery({ field: undefined })
  }
  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, key: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectField(key)
    }
  }
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && selectedKey) closeDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedKey])

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const workspace = event.currentTarget.parentElement
    if (!workspace) return
    const bounds = workspace.getBoundingClientRect()
    const move = (pointer: globalThis.PointerEvent) => {
      const next = Math.min(60, Math.max(25, ((pointer.clientX - bounds.left) / bounds.width) * 100))
      setPanePercent(next)
      localStorage.setItem(PANE_KEY, String(next))
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }
  const adjustPane = (next: number) => {
    const value = Math.min(60, Math.max(25, next))
    setPanePercent(value)
    localStorage.setItem(PANE_KEY, String(value))
  }
  const onResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    adjustPane(panePercent + (event.key === "ArrowRight" ? 5 : -5))
  }
  const adjustDrawer = (next: number) => {
    const value = Math.round(Math.min(Math.max(360, window.innerWidth - 64), Math.max(320, next)))
    setDrawerWidth(value)
    localStorage.setItem(DRAWER_KEY, String(value))
  }
  const startDrawerResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (pointer: globalThis.PointerEvent) => adjustDrawer(window.innerWidth - pointer.clientX)
    const stop = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", stop)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", stop)
  }
  const onDrawerResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
    event.preventDefault()
    adjustDrawer(drawerWidth + (event.key === "ArrowLeft" ? 32 : -32))
  }
  const toggleDesign = () => {
    const next = !designCollapsed
    setDesignCollapsed(next)
    localStorage.setItem(COLLAPSED_KEY, String(next))
  }

  return (
    <section className="field-review">
      {hasDesign ? (
        <button className="design-toggle" type="button" aria-expanded={!designCollapsed} onClick={toggleDesign}>
          {designCollapsed ? 'デザインを表示' : 'デザインを隠す'}
        </button>
      ) : null}
      <div className={`field-review-workspace${designCollapsed || !hasDesign ? ' design-collapsed' : ''}`} style={{ '--design-pane': `${panePercent}%` } as React.CSSProperties}>
        {hasDesign && !designCollapsed ? <DesignReference screen={screen} /> : null}
        {hasDesign && !designCollapsed ? <div className="pane-resizer" role="separator" tabIndex={0} aria-label="デザインペインの幅" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={60} aria-valuenow={Math.round(panePercent)} onPointerDown={startResize} onKeyDown={onResizeKeyDown} /> : null}
        <div className="field-review-main">
          <FieldFilters
            filter={filter} setFilter={setFilter}
            types={types} typeFilter={typeFilter} setTypeFilter={setTypeFilter}
            eventFilter={eventFilter} setEventFilter={setEventFilter}
            conditionFilter={conditionFilter} setConditionFilter={setConditionFilter}
            diagnosticFilter={diagnosticFilter} setDiagnosticFilter={setDiagnosticFilter}
          />
          <div className="table-scroll">
            <table className="fields review-fields">
              <thead><tr><th>Field ID</th><th>ラベル／文言</th><th>型</th><th>必須</th><th>Event ID</th><th>診断</th></tr></thead>
              <tbody>
                {rows.map(({ field, events, diagnostics }) => {
                  const errors = diagnostics.filter((item) => item.severity === 'error').length
                  const warnings = diagnostics.length - errors
                  return (
                    <tr key={field.key} tabIndex={0} aria-selected={selectedKey === field.key} className={selectedKey === field.key ? 'selected' : ''} onClick={() => selectField(field.key)} onKeyDown={(event) => onRowKeyDown(event, field.key)}>
                      <td><code>{field.key}</code></td>
                      <td><strong>{field.label}</strong>{field.text ? <span className="field-copy">{field.text}</span> : null}</td>
                      <td><code>{field.type}</code></td>
                      <td>{field.required ? '必須' : <span className="muted">任意</span>}</td>
                      <td>{events.length ? events.map((event) => <code key={event.key} className="event-id">{event.key}</code>) : <span className="muted">—</span>}</td>
                      <td>{errors ? <span className="badge badge-ng">error {errors}</span> : null}{warnings ? <span className="badge badge-warning">warning {warnings}</span> : null}{!diagnostics.length ? <span className="muted">—</span> : null}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 ? <p className="empty" role="status">条件に一致するFieldはありません。</p> : null}
          {selected ? <FieldDetail item={selected} section={sections.get(selected.field.key)} headingRef={detailHeading} onClose={closeDetail} onOpenTab={onOpenTab} drawerWidth={drawerWidth} onResizeStart={startDrawerResize} onResizeKeyDown={onDrawerResizeKeyDown} /> : null}
        </div>
      </div>
    </section>
  )
}

function FieldFilters(props: {
  filter: string; setFilter: (value: string) => void; types: string[]; typeFilter: string; setTypeFilter: (value: string) => void
  eventFilter: string; setEventFilter: (value: string) => void; conditionFilter: boolean; setConditionFilter: (value: boolean) => void
  diagnosticFilter: boolean; setDiagnosticFilter: (value: boolean) => void
}) {
  return <div className="field-filters" aria-label="Fieldの絞り込み">
    <input className="filter" type="search" aria-label="Field ID、ラベル、文言で検索" placeholder="Field ID・ラベル・文言を検索" value={props.filter} onChange={(event) => props.setFilter(event.target.value)} />
    <select aria-label="型で絞り込み" value={props.typeFilter} onChange={(event) => props.setTypeFilter(event.target.value)}><option value="all">すべての型</option>{props.types.map((type) => <option key={type}>{type}</option>)}</select>
    <select aria-label="Event連携で絞り込み" value={props.eventFilter} onChange={(event) => props.setEventFilter(event.target.value)}><option value="all">Event連携: すべて</option><option value="linked">連携あり</option><option value="unlinked">連携なし</option></select>
    <label><input type="checkbox" checked={props.conditionFilter} onChange={(event) => props.setConditionFilter(event.target.checked)} /> 条件あり</label>
    <label><input type="checkbox" checked={props.diagnosticFilter} onChange={(event) => props.setDiagnosticFilter(event.target.checked)} /> 診断あり</label>
  </div>
}

function DesignReference({ screen }: { screen: ScreenView }) {
  const design = screen.design!
  const initialImage = Math.max(0, Math.min(Number(queryValue('design')) || 0, Math.max(0, design.images.length - 1)))
  const [index, setIndex] = useState(initialImage)
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem(ZOOM_KEY)) || 100)
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number }>()
  const [naturalWidth, setNaturalWidth] = useState(0)
  const image = design.images[index]
  const setImage = (next: number) => { setIndex(next); setQuery({ design: String(next) }) }
  const setZoomValue = (next: number) => { const value = Math.round(Math.min(300, Math.max(10, next))); setZoom(value); localStorage.setItem(ZOOM_KEY, String(value)) }
  const fit = () => {
    if (viewport.current && naturalWidth) setZoomValue((viewport.current.clientWidth / naturalWidth) * 100)
  }
  const reset = () => { setZoomValue(100); viewport.current?.scrollTo({ top: 0, left: 0 }) }
  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!viewport.current) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, left: viewport.current.scrollLeft, top: viewport.current.scrollTop }
  }
  const movePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!viewport.current || !drag.current) return
    viewport.current.scrollLeft = drag.current.left - (event.clientX - drag.current.x)
    viewport.current.scrollTop = drag.current.top - (event.clientY - drag.current.y)
  }
  return <aside className="design-reference" aria-label="デザイン参照">
    <header><h2>デザイン</h2><span className="muted">{image ? `${index + 1} / ${design.images.length}` : '画像なし'}</span></header>
    <div className="design-tools" role="toolbar" aria-label="デザイン画像の表示操作">
      <button type="button" onClick={fit}>幅に合わせる</button>
      <button type="button" onClick={() => setZoomValue(100)}>100%</button>
      <button type="button" aria-label="縮小" onClick={() => setZoomValue(zoom - 25)}>−</button>
      <output aria-live="polite">{zoom}%</output>
      <button type="button" aria-label="拡大" onClick={() => setZoomValue(zoom + 25)}>＋</button>
      <button type="button" onClick={reset}>リセット</button>
      {image ? <a href={image.url} target="_blank" rel="noreferrer">別タブ ↗</a> : null}
    </div>
    {image ? <div className="design-viewport" ref={viewport} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={() => { drag.current = undefined }} onPointerCancel={() => { drag.current = undefined }}><img src={image.url} alt={image.caption ?? `デザイン ${index + 1}`} draggable={false} onLoad={(event) => setNaturalWidth(event.currentTarget.naturalWidth)} style={{ width: naturalWidth ? `${naturalWidth * zoom / 100}px` : "auto" }} /></div> : <p className="empty">デザイン画像はありません。</p>}
    {image?.caption ? <p className="muted design-caption">{image.caption}</p> : null}
    {design.images.length > 1 ? <div className="design-thumbnails" aria-label="デザイン画像を選択">{design.images.map((item, itemIndex) => <button key={`${item.url}:${itemIndex}`} type="button" className={index === itemIndex ? 'active' : ''} aria-pressed={index === itemIndex} onClick={() => setImage(itemIndex)}><img src={item.url} alt={item.caption ?? `デザイン ${itemIndex + 1}`} /></button>)}</div> : null}
    <div className="design-links">{design.figma ? <a href={design.figma} target="_blank" rel="noreferrer">Figmaを開く ↗</a> : null}{design.links.map((link, linkIndex) => <a key={`${link.url}:${linkIndex}`} href={link.url} target="_blank" rel="noreferrer">{link.label ?? link.url} ↗</a>)}</div>
  </aside>
}

function FieldDetail({ item, section, headingRef, onClose, onOpenTab, drawerWidth, onResizeStart, onResizeKeyDown }: {
  item: { field: FieldView; events: EventView[]; diagnostics: DiagnosticView[] }; section?: string
  headingRef: React.RefObject<HTMLHeadingElement | null>; onClose: () => void; onOpenTab: (tab: string) => void
  drawerWidth: number; onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void; onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}) {
  const { field, events, diagnostics } = item
  return <section className="field-detail" role="complementary" aria-labelledby="field-detail-title" style={{ '--field-drawer-width': drawerWidth + 'px' } as React.CSSProperties}>
    <div className="field-detail-resizer" role="separator" tabIndex={0} aria-label="Field詳細の幅" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={Math.max(360, window.innerWidth - 64)} aria-valuenow={drawerWidth} onPointerDown={onResizeStart} onKeyDown={onResizeKeyDown} />
    <header><div><p className="eyebrow">selected field</p><h2 id="field-detail-title" ref={headingRef} tabIndex={-1}><code>{field.key}</code> — {field.label}</h2></div><button type="button" onClick={onClose} aria-label="Field詳細を閉じる">閉じる</button></header>
    <dl className="field-detail-grid">
      <Detail label="文言" value={field.text} /><Detail label="型" value={field.type} code /><Detail label="必須" value={field.required ? '必須' : '任意'} />
      <Detail label="既定値" value={field.default === undefined ? undefined : displayValue(field.default)} code /><Detail label="表示条件" value={field.visibleWhen} code /><Detail label="有効条件" value={field.enabledWhen} code />
      <Detail label="$ref由来" value={field.origin ?? 'inline'} code /><Detail label="セクション" value={section} /><Detail label="幅" value={field.width} code />
    </dl>
    <DetailList title="Validation" empty="定義なし" items={field.validations.map((validation) => <span><code>{validation.rule}</code>{validation.message ? ` — ${validation.message}` : ''}</span>)} />
    <DetailList title="Options" empty="定義なし" items={field.options.map((option) => <span><code>{displayValue(option.value)}</code> — {option.label}</span>)} />
    <section><h3>診断</h3>{diagnostics.length ? <ul className="diagnostic-list">{diagnostics.map((diagnostic, index) => <li key={`${diagnostic.path}:${index}`}><span className={`badge ${diagnostic.severity === 'error' ? 'badge-ng' : 'badge-warning'}`}>{diagnostic.severity}</span> {diagnostic.message}<small><code>{diagnostic.path}</code></small></li>)}</ul> : <p className="muted">このFieldに関連する診断はありません。</p>}</section>
    <section><div className="detail-section-head"><h3>関連Event</h3>{events.length ? <button type="button" className="link" onClick={() => onOpenTab('states')}>状態遷移で開く</button> : null}</div>{events.length ? events.map((event) => <EventDetail key={event.key} event={event} onOpenApi={() => onOpenTab('api')} />) : <p className="muted">直接関連するEventはありません。</p>}</section>
  </section>
}

function Detail({ label, value, code }: { label: string; value?: string; code?: boolean }) { return <div><dt>{label}</dt><dd>{value === undefined || value === '' ? <span className="muted">—</span> : code ? <code>{value}</code> : value}</dd></div> }
function DetailList({ title, items, empty }: { title: string; items: React.ReactNode[]; empty: string }) { return <section><h3>{title}</h3>{items.length ? <ul className="rules">{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className="muted">{empty}</p>}</section> }

function EventDetail({ event, onOpenApi }: { event: EventView; onOpenApi: () => void }) {
  return <article className="related-event"><header><h4><code>{event.key}</code></h4>{event.trigger ? <span className="badge badge-region">{event.trigger}</span> : null}</header><p><code>{event.from ?? '?'}</code> → {event.branches.length ? `${event.branches.length} Branches` : <code>{event.to ?? '?'}</code>}</p>{event.apiCall ? <button type="button" className="link" onClick={onOpenApi}>API <code>{event.apiCall}</code></button> : null}{event.branches.length ? <ol className="branch-list">{event.branches.map((branch) => <BranchDetail key={branch.id} branch={branch} onOpenApi={onOpenApi} />)}</ol> : null}</article>
}
function BranchDetail({ branch, onOpenApi }: { branch: EventBranchView; onOpenApi: () => void }) { return <li><p><code>{branch.id}</code> — {branch.otherwise ? <strong>otherwise</strong> : <code>{branch.when}</code>} → <code>{branch.to}</code></p>{branch.apiCall ? <button type="button" className="link" onClick={onOpenApi}>API <code>{branch.apiCall}</code></button> : null}{branch.expects ? <p className="muted">期待結果あり</p> : null}{branch.onSuccess ? <p className="muted">成功 → <code>{branch.onSuccess.to ?? '—'}</code></p> : null}{branch.onError ? <p className="muted">エラー → <code>{branch.onError.to ?? '—'}</code></p> : null}</li> }
