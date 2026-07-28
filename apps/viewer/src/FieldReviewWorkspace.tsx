import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { stringifyYaml } from "@screen-spec/core"
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

const INPUT_FIELD_TYPES = new Set(['text', 'textarea', 'email', 'number', 'date', 'select', 'checkbox', 'radio'])
const OPTION_FIELD_TYPES = new Set(['select', 'radio'])

function fieldDiagnostics(screen: ScreenView, field: FieldView, events: EventView[]): DiagnosticView[] {
  const keys = new Set([field.key, ...events.map((event) => event.key)])
  return screen.diagnostics.filter((diagnostic) => {
    if (diagnostic.path.includes(`/fields/${field.key}`) || diagnostic.path.endsWith(`/${field.key}`)) return true
    return [...keys].some((key) => diagnostic.path.endsWith(`/${key}`) || diagnostic.message.includes(`"${key}"`))
  })
}

function shortestComponentPath(screen: ScreenView, fieldId: string, targetId: string): string[] {
  const direct = screen.componentGraph.usages.filter((usage) => usage.screenId === screen.id && usage.fieldId === fieldId).map((usage) => usage.componentId)
  const queue = direct.map((id) => [id])
  const visited = new Set<string>()
  while (queue.length) {
    const path = queue.shift()!
    const current = path[path.length - 1]
    if (current === targetId) return path
    if (visited.has(current)) continue
    visited.add(current)
    for (const dependency of screen.componentGraph.usages.filter((usage) => usage.referrerComponentId === current)) queue.push([...path, dependency.componentId])
  }
  return [targetId]
}

function relatedEvents(screen: ScreenView, field: FieldView): EventView[] {
  return screen.events.filter((event) => event.key === field.eventId || event.target === field.key)
}

export function FieldReviewWorkspace({ screen, onOpenTab, onNavigateField }: { screen: ScreenView; onOpenTab: (tab: string) => void; onNavigateField: (screenId: string, fieldId: string) => void }) {
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
  const [selectedInstanceKey, setSelectedInstanceKey] = useState(() => queryValue("instance"))
  const [componentTrail, setComponentTrail] = useState<string[]>(() => {
    const target = queryValue("component")
    return target && initialField ? shortestComponentPath(screen, initialField, target) : target && queryValue("instance") ? [target] : []
  })
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
  const selectedInstance = screen.uiInstances.find((instance) => instance.key === selectedInstanceKey)
  const selectField = (key: string) => {
    setSelectedInstanceKey(undefined)
    setSelectedKey(key)
    setComponentTrail([])
    setQuery({ field: key, instance: undefined, component: undefined })
    requestAnimationFrame(() => detailHeading.current?.focus())
  }
  const selectInstance = (key: string) => {
    setSelectedKey(undefined)
    setSelectedInstanceKey(key)
    setComponentTrail([])
    setQuery({ field: undefined, instance: key, component: undefined })
    requestAnimationFrame(() => detailHeading.current?.focus())
  }
  const closeDetail = () => {
    setSelectedInstanceKey(undefined)
    setSelectedKey(undefined)
    setComponentTrail([])
    setQuery({ field: undefined, instance: undefined, component: undefined })
  }
  const openComponent = (id: string) => {
    setComponentTrail((trail) => trail.length ? [...trail, id] : [id])
    setQuery({ component: id })
    requestAnimationFrame(() => detailHeading.current?.focus())
  }
  const backDetail = () => {
    setComponentTrail((trail) => {
      const next = trail.slice(0, -1)
      setQuery({ component: next.at(-1) })
      return next
    })
    requestAnimationFrame(() => detailHeading.current?.focus())
  }
  const backToComponent = (index: number) => {
    setComponentTrail((trail) => {
      const next = trail.slice(0, index + 1)
      setQuery({ component: next.at(-1) })
      return next
    })
    requestAnimationFrame(() => detailHeading.current?.focus())
  }
  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, key: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectField(key)
    }
  }
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && componentTrail.length) backDetail()
      else if (event.key === 'Escape' && (selectedKey || selectedInstanceKey)) closeDetail()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedKey, selectedInstanceKey, componentTrail])

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
          {screen.layout ? <section className="screen-outline" aria-labelledby="screen-outline-title"><div className="detail-section-head"><h2 id="screen-outline-title">Screen Outline</h2><span className="muted">定義順</span></div><ol>{screen.layout.sections.map((section, sectionIndex) => <li key={section.id ?? sectionIndex}><div className="screen-outline-section"><span className="badge badge-region">{section.region ?? "body"}</span><strong>{section.title ?? section.id ?? `Section ${sectionIndex + 1}`}</strong></div><ol>{section.items.map((item) => <li key={item.kind + item.key}>{item.kind === "field" ? <button type="button" className="screen-outline-item" onClick={() => selectField(item.key)}><span>Field</span><code>{item.key}</code><span>{screen.fields.find((field) => field.key === item.key)?.label}</span></button> : <button type="button" className="screen-outline-item" onClick={() => selectInstance(item.key)}><span>UI Component</span><code>{item.key}</code><span>{componentName(screen.uiInstances.find((instance) => instance.key === item.key)?.componentId ?? item.key)}</span></button>}</li>)}</ol></li>)}</ol></section> : null}
          <FieldFilters
            filter={filter} setFilter={setFilter}
            types={types} typeFilter={typeFilter} setTypeFilter={setTypeFilter}
            eventFilter={eventFilter} setEventFilter={setEventFilter}
            conditionFilter={conditionFilter} setConditionFilter={setConditionFilter}
            diagnosticFilter={diagnosticFilter} setDiagnosticFilter={setDiagnosticFilter}
          />
          <div className="table-scroll">
            <table className="fields review-fields">
              <thead><tr><th>Field ID</th><th>セクション</th><th>ラベル／文言</th><th>型</th><th>必須</th><th>Event ID</th><th>診断</th></tr></thead>
              <tbody>
                {rows.map(({ field, events, diagnostics }, index) => {
                  const errors = diagnostics.filter((item) => item.severity === 'error').length
                  const warnings = diagnostics.length - errors
                  const section = sections.get(field.key)
                  const previousSection = index > 0 ? sections.get(rows[index - 1].field.key) : undefined
                  const showSection = index === 0 || section !== previousSection
                  return (
                    <tr key={field.key} tabIndex={0} aria-selected={selectedKey === field.key} className={selectedKey === field.key ? 'selected' : ''} onClick={() => selectField(field.key)} onKeyDown={(event) => onRowKeyDown(event, field.key)}>
                      <td><code>{field.key}</code></td>
                      <td className="field-section">{showSection ? section ? <span className="section-label">{section}</span> : <span className="badge badge-warning">未配置</span> : null}</td>
                      <td><strong>{field.label}</strong>{field.text ? <span className="field-copy">{field.text}</span> : null}</td>
                      <td><code>{field.type}</code></td>
                      <td>{INPUT_FIELD_TYPES.has(field.type) ? field.required ? '必須' : <span className="muted">任意</span> : <span className="muted">—</span>}</td>
                      <td>{events.length ? events.map((event) => <code key={event.key} className="event-id">{event.key}</code>) : <span className="muted">—</span>}</td>
                      <td>{errors ? <span className="badge badge-ng">error {errors}</span> : null}{warnings ? <span className="badge badge-warning">warning {warnings}</span> : null}{!diagnostics.length ? <span className="muted">—</span> : null}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 ? <p className="empty" role="status">条件に一致するFieldはありません。</p> : null}
          {selected ? componentTrail.length ? <ComponentDetail componentId={componentTrail.at(-1)!} componentTrail={componentTrail} screen={screen} fieldId={selected.field.key} headingRef={detailHeading} onBack={backDetail} onBackTo={backToComponent} onClose={closeDetail} onOpenComponent={openComponent} onNavigateField={(targetScreen, targetField) => targetScreen === screen.id ? selectField(targetField) : onNavigateField(targetScreen, targetField)} drawerWidth={drawerWidth} onResizeStart={startDrawerResize} onResizeKeyDown={onDrawerResizeKeyDown} /> : <FieldDetail item={selected} section={sections.get(selected.field.key)} headingRef={detailHeading} onClose={closeDetail} onOpenTab={onOpenTab} onOpenComponent={openComponent} componentUsages={screen.componentGraph.usages.filter((usage) => usage.screenId === screen.id && usage.fieldId === selected.field.key)} drawerWidth={drawerWidth} onResizeStart={startDrawerResize} onResizeKeyDown={onDrawerResizeKeyDown} /> : selectedInstance ? componentTrail.length ? <ComponentDetail componentId={componentTrail.at(-1)!} componentTrail={componentTrail} screen={screen} fieldId={selectedInstance.key} headingRef={detailHeading} onBack={backDetail} onBackTo={backToComponent} onClose={closeDetail} onOpenComponent={openComponent} onNavigateField={onNavigateField} drawerWidth={drawerWidth} onResizeStart={startDrawerResize} onResizeKeyDown={onDrawerResizeKeyDown} /> : <UIInstanceDetail instance={selectedInstance} screen={screen} headingRef={detailHeading} onClose={closeDetail} onOpenComponent={openComponent} drawerWidth={drawerWidth} onResizeStart={startDrawerResize} onResizeKeyDown={onDrawerResizeKeyDown} /> : null}
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

function UIInstanceDetail({ instance, screen, headingRef, onClose, onOpenComponent, drawerWidth, onResizeStart, onResizeKeyDown }: {
  instance: UIInstanceView; screen: ScreenView; headingRef: React.RefObject<HTMLHeadingElement | null>; onClose: () => void; onOpenComponent: (id: string) => void; drawerWidth: number; onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void; onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}) {
  const component = screen.componentGraph.components.find((item) => item.id === instance.componentId)
  const placement = screen.layout?.sections.find((section) => section.items.some((item) => item.kind === "component" && item.key === instance.key))
  return <section className="field-detail" role="complementary" aria-labelledby="instance-detail-title" style={{ "--field-drawer-width": drawerWidth + "px" } as React.CSSProperties}>
    <div className="field-detail-resizer" role="separator" tabIndex={0} aria-label="Component Instance詳細の幅" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={Math.max(360, window.innerWidth - 64)} aria-valuenow={drawerWidth} onPointerDown={onResizeStart} onKeyDown={onResizeKeyDown} />
    <header><div><p className="eyebrow">component instance</p><h2 id="instance-detail-title" ref={headingRef} tabIndex={-1}><code>{instance.key}</code></h2><p className="component-identity">{component?.name ?? componentName(instance.componentId ?? instance.componentRef ?? "Unknown")}</p></div><button type="button" onClick={onClose}>閉じる</button></header>
    <dl className="field-detail-grid"><Detail label="Section" value={placement?.title ?? placement?.id} /><Detail label="Region" value={placement?.region ?? "body"} /><Detail label="Input Binding" value={String(instance.bindings.length)} /><Detail label="Event Mapping" value={String(instance.events.length)} /></dl>
    {instance.componentId ? <section><h3>UI Component</h3><button type="button" className="component-link" onClick={() => onOpenComponent(instance.componentId!)}><span>Contractを開く</span><code>{component?.name ?? componentName(instance.componentId)}</code></button></section> : null}
    {instance.bindings.length ? <section><h3>Input Bindings</h3><ul className="instance-mappings">{instance.bindings.map((binding) => <li key={binding.input}><code>{binding.input}</code><span aria-hidden="true"> ← </span>{binding.source ? <code>{binding.source}</code> : <code>{displayValue(binding.value)}</code>}</li>)}</ul></section> : null}
    {instance.events.length ? <section><h3>Event Mappings</h3><ul className="instance-mappings">{instance.events.map((event) => <li key={event.contractEvent}><code>{event.contractEvent}</code><span aria-hidden="true"> → </span><code>{event.screenEvent}</code></li>)}</ul></section> : null}
    {instance.visibleWhen ? <section><h3>表示条件</h3><code>{instance.visibleWhen}</code></section> : null}
  </section>
}

function FieldDetail({ item, section, headingRef, onClose, onOpenTab, onOpenComponent, componentUsages, drawerWidth, onResizeStart, onResizeKeyDown }: {
  item: { field: FieldView; events: EventView[]; diagnostics: DiagnosticView[] }; section?: string
  headingRef: React.RefObject<HTMLHeadingElement | null>; onClose: () => void; onOpenTab: (tab: string) => void
  onOpenComponent: (id: string) => void; componentUsages: ScreenView["componentGraph"]["usages"]
  drawerWidth: number; onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void; onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}) {
  const { field, events, diagnostics } = item
  return <section className="field-detail" role="complementary" aria-labelledby="field-detail-title" style={{ '--field-drawer-width': drawerWidth + 'px' } as React.CSSProperties}>
    <div className="field-detail-resizer" role="separator" tabIndex={0} aria-label="Field詳細の幅" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={Math.max(360, window.innerWidth - 64)} aria-valuenow={drawerWidth} onPointerDown={onResizeStart} onKeyDown={onResizeKeyDown} />
    <header><div><p className="eyebrow">selected field</p><h2 id="field-detail-title" ref={headingRef} tabIndex={-1}><code>{field.key}</code> — {field.label}</h2></div><button type="button" onClick={onClose} aria-label="Field詳細を閉じる">閉じる</button></header>
    <dl className="field-detail-grid">
      <Detail label="型" value={field.type} code />
      {field.text !== undefined || field.type === "button" || field.type === "label" ? <Detail label="文言" value={field.text} /> : null}
      {INPUT_FIELD_TYPES.has(field.type) ? <Detail label="必須" value={field.required ? "必須" : "任意"} /> : null}
      {INPUT_FIELD_TYPES.has(field.type) && field.default !== undefined ? <Detail label="既定値" value={displayValue(field.default)} code /> : null}
      {INPUT_FIELD_TYPES.has(field.type) && field.placeholder ? <Detail label="プレースホルダー" value={field.placeholder} /> : null}
      {field.visibleWhen ? <Detail label="表示条件" value={field.visibleWhen} code /> : null}
      {field.enabledWhen ? <Detail label="有効条件" value={field.enabledWhen} code /> : null}
      {section ? <Detail label="セクション" value={section} /> : null}
      {field.width ? <Detail label="幅" value={field.width} code /> : null}
    </dl>
    {componentUsages.some((usage) => usage.location === "field-origin") ? <section><h3>Origin</h3><div className="component-links">{componentUsages.filter((usage) => usage.location === "field-origin").map((usage) => <button key={usage.componentId + usage.sourcePath} type="button" className="component-link" onClick={() => onOpenComponent(usage.componentId)}><span>Field Component</span><code>{componentName(usage.componentId)}</code></button>)}</div></section> : <p className="muted">Origin: Inline</p>}
    {INPUT_FIELD_TYPES.has(field.type) && (field.validations.length || componentUsages.some((usage) => usage.location === "validation")) ? <section><h3>Validation</h3><div className="component-links">{componentUsages.filter((usage) => usage.location === "validation").map((usage) => <button key={usage.componentId + usage.sourcePath} type="button" className="component-link" onClick={() => onOpenComponent(usage.componentId)}><span>Validation Component</span><code>{componentName(usage.componentId)}</code></button>)}</div>{field.validations.length ? <ul className="rules">{field.validations.map((validation, index) => <li key={validation.rule + index}><code>{validation.rule}</code>{validation.message ? " — " + validation.message : ""}</li>)}</ul> : null}</section> : null}
    {OPTION_FIELD_TYPES.has(field.type) && (field.options.length || componentUsages.some((usage) => usage.location === "options")) ? <section><h3>Options</h3><div className="component-links">{componentUsages.filter((usage) => usage.location === "options").map((usage) => <button key={usage.componentId + usage.sourcePath} type="button" className="component-link" onClick={() => onOpenComponent(usage.componentId)}><span>Options Component</span><code>{componentName(usage.componentId)}</code></button>)}</div>{field.options.length ? <ul className="rules">{field.options.map((option, index) => <li key={String(option.value) + index}><code>{displayValue(option.value)}</code> — {option.label}</li>)}</ul> : null}</section> : null}
    {field.binding ? <section><h3>データ入力</h3>{field.binding.options ? <div className="data-route"><p>{field.binding.options.apiBinding ? <><code>api.{field.binding.options.apiBinding}</code><span aria-hidden="true"> → </span></> : null}<code>{field.binding.options.source}</code><span aria-hidden="true"> → </span><code>{field.key}.options</code></p>{field.binding.options.responsePath ? <p className="muted">response <code>{field.binding.options.responsePath}</code>{" "}{field.binding.options.pathStatus === "valid" ? <span className="badge badge-ok">path確認済み</span> : null}{field.binding.options.pathStatus === "invalid" ? <span className="badge badge-ng">path不正</span> : null}{field.binding.options.pathStatus === "unverifiable" ? <span className="badge badge-warning">path未検証</span> : null}</p> : null}<p className="muted">value: <code>{field.binding.options.valuePath}</code> / label: <code>{field.binding.options.labelPath}</code></p></div> : null}{field.binding.loading ? <p>loading: <code>{field.binding.loading.source}</code>（読込中は無効化、既存Optionsを保持）</p> : null}</section> : null}
    {diagnostics.length ? <section><h3>診断</h3><ul className="diagnostic-list">{diagnostics.map((diagnostic, index) => <li key={`${diagnostic.path}:${index}`}><span className={`badge ${diagnostic.severity === 'error' ? 'badge-ng' : 'badge-warning'}`}>{diagnostic.severity}</span> {diagnostic.message}<small><code>{diagnostic.path}</code></small></li>)}</ul></section> : null}
    {events.length ? <section><div className="detail-section-head"><h3>関連Event</h3><button type="button" className="link" onClick={() => onOpenTab('states')}>状態遷移で開く</button></div>{events.map((event) => <EventDetail key={event.key} event={event} onOpenApi={() => onOpenTab('api')} />)}</section> : null}
  </section>
}

function componentName(id: string): string { return decodeURIComponent(id.split("/").pop() ?? id) }

function asRecord(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined }

function ComponentDetail({ componentId, componentTrail, screen, fieldId, headingRef, onBack, onBackTo, onClose, onOpenComponent, onNavigateField, drawerWidth, onResizeStart, onResizeKeyDown }: {
  componentId: string; componentTrail: string[]; screen: ScreenView; fieldId: string; headingRef: React.RefObject<HTMLHeadingElement | null>; onBack: () => void; onBackTo: (index: number) => void; onClose: () => void
  onOpenComponent: (id: string) => void; onNavigateField: (screenId: string, fieldId: string) => void; drawerWidth: number
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void; onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}) {
  const [optionQuery, setOptionQuery] = useState("")
  const component = screen.componentGraph.components.find((item) => item.id === componentId)
  if (!component) return <section className="field-detail" role="complementary" style={{ "--field-drawer-width": drawerWidth + "px" } as React.CSSProperties}><header><div><p className="eyebrow">component</p><h2 ref={headingRef} tabIndex={-1}>Componentが見つかりません</h2></div><button type="button" onClick={onClose}>閉じる</button></header><p><code>{componentId}</code></p></section>
  const usages = screen.componentGraph.usages.filter((usage) => usage.componentId === componentId)
  const dependencies = screen.componentGraph.usages.filter((usage) => usage.referrerComponentId === componentId)
  const dependencyIds = [...new Set(dependencies.map((usage) => usage.componentId))]
  const impacts = screen.componentGraph.impacts.filter((impact) => impact.componentId === componentId)
  const directFields = new Set(usages.filter((usage) => usage.screenId && usage.fieldId).map((usage) => usage.screenId + ":" + usage.fieldId))
  const current = impacts.filter((impact) => impact.screenId === screen.id)
  const otherGroups = new Map<string, typeof impacts>()
  for (const impact of impacts.filter((item) => item.screenId !== screen.id)) otherGroups.set(impact.screenId, [...(otherGroups.get(impact.screenId) ?? []), impact])
  const diagnostics = screen.componentGraph.diagnostics.filter((item) => item.where === component.id || item.where?.includes(component.uri + component.pointer) || item.message.includes(component.id))
  const contract = asRecord(component.contract)
  const validations = Array.isArray(contract?.validations) ? contract.validations : []
  const uiInputs = asRecord(contract?.inputs) ?? {}
  const uiEvents = asRecord(contract?.events) ?? {}
  const uiParts = asRecord(contract?.parts) ?? {}
  const uiDerived = asRecord(contract?.derived) ?? {}
  const uiRules = Array.isArray(contract?.rules) ? contract.rules : []
  const instanceImpacts = screen.componentGraph.instanceImpacts.filter((impact) => impact.componentId === componentId)
  const options = component.kind === "options" && Array.isArray(component.contract) ? component.contract : Array.isArray(contract?.options) ? contract.options : []
  const filteredOptions = options.filter((item) => { const row = asRecord(item); const query = optionQuery.toLowerCase(); return !query || String(row?.value ?? "").toLowerCase().includes(query) || String(row?.label ?? "").toLowerCase().includes(query) })
  const dependencyButton = (id: string, label = "dependency") => <button key={id + label} type="button" className="component-link" onClick={() => onOpenComponent(id)}><span>{label}</span><code>{componentName(id)}</code></button>
  const usageList = (items: typeof impacts) => <ul className="component-usage-list">{items.map((impact) => { const direct = directFields.has(impact.screenId + ":" + impact.fieldId); return <li key={impact.screenId + impact.fieldId}><button className="link" type="button" onClick={() => impact.screenId === screen.id && impact.fieldId === fieldId ? onBack() : onNavigateField(impact.screenId, impact.fieldId)}><code>{impact.fieldId}</code></button><span className={"badge " + (direct ? "badge-ok" : "badge-region")}>{direct ? "直接利用" : "依存経由"}</span></li> })}</ul>
  return <section className="field-detail" role="complementary" aria-labelledby="component-detail-title" style={{ "--field-drawer-width": drawerWidth + "px" } as React.CSSProperties}>
    <div className="field-detail-resizer" role="separator" tabIndex={0} aria-label="Component詳細の幅" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={Math.max(360, window.innerWidth - 64)} aria-valuenow={drawerWidth} onPointerDown={onResizeStart} onKeyDown={onResizeKeyDown} />
    <header><div><nav aria-label="詳細のパンくず"><button type="button" className="link" onClick={() => onBackTo(-1)}><code>{fieldId}</code></button>{componentTrail.map((id, index) => <span key={id + index}><span aria-hidden="true"> / </span>{index === componentTrail.length - 1 ? <span aria-current="page">{componentName(id)}</span> : <button type="button" className="link" onClick={() => onBackTo(index)}>{componentName(id)}</button>}</span>)}</nav><p className="eyebrow">{component.kind} component</p><h2 id="component-detail-title" ref={headingRef} tabIndex={-1}>{component.name}</h2><p className="component-identity"><code>{component.uri.split("/").pop()}</code><span aria-hidden="true"> › </span><code>{component.kind}</code><span aria-hidden="true"> › </span><code>{component.name}</code> <button type="button" className="link" onClick={() => void navigator.clipboard?.writeText(component.id)}>参照をコピー</button></p></div><div className="detail-actions"><button type="button" onClick={onBack}>戻る</button><button type="button" onClick={onClose}>閉じる</button></div></header>
    <dl className="component-metrics"><Detail label="直接参照" value={String(usages.length)} /><Detail label={component.kind === "ui" ? "影響Instance" : "影響Field"} value={String(component.kind === "ui" ? instanceImpacts.length : impacts.length)} /><Detail label="依存Component" value={String(dependencyIds.length)} /></dl>
    <section><h3>Contract</h3>
      {component.kind === "field" && contract ? <><dl className="field-detail-grid">{typeof contract.label === "string" ? <Detail label="ラベル" value={contract.label} /> : null}{typeof contract.type === "string" ? <Detail label="型" value={contract.type} code /> : null}{typeof contract.text === "string" ? <Detail label="文言" value={contract.text} /> : null}{typeof contract.required === "boolean" ? <Detail label="必須" value={contract.required ? "必須" : "任意"} /> : null}{contract.default !== undefined ? <Detail label="既定値" value={displayValue(contract.default)} code /> : null}{typeof contract.placeholder === "string" ? <Detail label="プレースホルダー" value={contract.placeholder} /> : null}</dl>{validations.length ? <section><h4>Validation</h4><div className="component-links">{dependencies.filter((usage) => usage.location === "validation").map((usage) => dependencyButton(usage.componentId, "validation"))}</div>{validations.filter((item) => !asRecord(item)?.$ref).map((item, index) => <pre key={index} className="contract-inline"><code>{stringifyYaml(item)}</code></pre>)}</section> : null}{contract.options !== undefined ? <section><h4>Options</h4><div className="component-links">{dependencies.filter((usage) => usage.location === "options").map((usage) => dependencyButton(usage.componentId, "options"))}</div></section> : null}</> : null}
      {component.kind === "validation" && contract ? <dl className="field-detail-grid"><Detail label="rule" value={typeof contract.rule === "string" ? contract.rule : undefined} code /><Detail label="value" value={contract.value === undefined ? undefined : displayValue(contract.value)} code /><Detail label="message" value={typeof contract.message === "string" ? contract.message : undefined} /></dl> : null}
      {component.kind === "options" ? <><p className="muted">{options.length} options</p>{options.length > 10 ? <details><summary>Optionsを表示 ({options.length})</summary><input type="search" className="filter" aria-label="Optionsを検索" placeholder="value・labelを検索" value={optionQuery} onChange={(event) => setOptionQuery(event.target.value)} /><div className="options-contract-scroll"><table className="fields"><thead><tr><th>value</th><th>label</th></tr></thead><tbody>{filteredOptions.map((item, index) => { const row = asRecord(item); return <tr key={String(row?.value) + index}><td><code>{displayValue(row?.value)}</code></td><td>{String(row?.label ?? "")}</td></tr> })}</tbody></table></div></details> : <table className="fields"><thead><tr><th>value</th><th>label</th></tr></thead><tbody>{filteredOptions.map((item, index) => { const row = asRecord(item); return <tr key={String(row?.value) + index}><td><code>{displayValue(row?.value)}</code></td><td>{String(row?.label ?? "")}</td></tr> })}</tbody></table>}</> : null}
      {component.kind === "ui" && contract ? <><p>{typeof contract.description === "string" ? contract.description : null}</p><section><h4>Inputs</h4><table className="fields"><thead><tr><th>Input</th><th>型</th><th>必須</th><th>既定値</th></tr></thead><tbody>{Object.entries(uiInputs).map(([name, raw]) => { const input = asRecord(raw); return <tr key={name}><td><code>{name}</code></td><td><code>{String(input?.type ?? "unknown")}</code></td><td>{input?.required === true ? "必須" : "任意"}</td><td>{input && "default" in input ? <code>{displayValue(input.default)}</code> : <span className="muted">—</span>}</td></tr> })}</tbody></table></section><section><h4>Events</h4><div className="ui-contract-grid">{Object.entries(uiEvents).map(([name, raw]) => { const event = asRecord(raw); return <article key={name}><strong><code>{name}</code></strong><span className={event?.required === true ? "badge badge-warning" : "badge badge-region"}>{event?.required === true ? "required" : "optional"}</span>{event?.payload ? <pre className="contract-inline"><code>{stringifyYaml(event.payload)}</code></pre> : null}</article> })}</div></section>{Object.keys(uiParts).length ? <section><h4>Semantic Parts</h4><div className="ui-contract-grid">{Object.entries(uiParts).map(([name, raw]) => <article key={name}><strong><code>{name}</code></strong><span>{String(asRecord(raw)?.kind ?? "part")}</span></article>)}</div></section> : null}{Object.keys(uiDerived).length ? <section><h4>Derived</h4><pre className="contract-inline"><code>{stringifyYaml(uiDerived)}</code></pre></section> : null}{uiRules.length ? <section><h4>Rules</h4>{uiRules.map((rule, index) => <pre key={index} className="contract-inline"><code>{stringifyYaml(rule)}</code></pre>)}</section> : null}{contract.accessibility ? <section><h4>Accessibility</h4><pre className="contract-inline"><code>{stringifyYaml(contract.accessibility)}</code></pre></section> : null}{contract.responsive ? <section><h4>Responsive</h4><pre className="contract-inline"><code>{stringifyYaml(contract.responsive)}</code></pre></section> : null}</> : null}
    </section>
    {diagnostics.length ? <section><h3>診断</h3><ul className="diagnostic-list">{diagnostics.map((item, index) => <li key={item.code + index}><span className={"badge " + (item.severity === "error" ? "badge-ng" : "badge-warning")}>{item.severity}</span> {item.message}</li>)}</ul></section> : null}
    {dependencies.length ? <section><h3>依存Component</h3><div className="component-links">{dependencyIds.map((id) => dependencyButton(id))}</div></section> : null}
    <details><summary>Authored YAML</summary><pre className="component-contract"><code>{stringifyYaml(component.contract)}</code></pre></details>
    {component.kind === "ui" ? <section><h3>利用Instance <span className="muted">({instanceImpacts.length})</span></h3><ul className="component-usage-list">{instanceImpacts.map((impact) => <li key={impact.screenId + impact.instanceId}><span><code>{impact.screenId}</code> › <code>{impact.instanceId}</code></span><span className="badge badge-ok">直接利用</span></li>)}</ul></section> : null}
    {component.kind !== "ui" ? <section><h3>この画面での利用 <span className="muted">({current.length})</span></h3>{current.length ? usageList(current) : <p className="muted">なし</p>}</section> : null}
    {component.kind !== "ui" && otherGroups.size ? <section><h3>他の画面での利用 <span className="muted">({impacts.length - current.length})</span></h3>{[...otherGroups].map(([screenId, items]) => <details key={screenId}><summary><code>{screenId}</code> ({items.length})</summary>{usageList(items)}</details>)}</section> : null}
  </section>
}

function Detail({ label, value, code }: { label: string; value?: string; code?: boolean }) { return <div><dt>{label}</dt><dd>{value === undefined || value === '' ? <span className="muted">—</span> : code ? <code>{value}</code> : value}</dd></div> }
function EventDetail({ event, onOpenApi }: { event: EventView; onOpenApi: () => void }) {
  return <article className="related-event"><header><h4><code>{event.key}</code></h4>{event.trigger ? <span className="badge badge-region">{event.trigger}</span> : null}</header><p><code>{event.from ?? '?'}</code> → {event.branches.length ? `${event.branches.length} Branches` : <code>{event.to ?? '?'}</code>}</p>{event.apiCall ? <button type="button" className="link" onClick={onOpenApi}>API <code>{event.apiCall}</code></button> : null}{event.branches.length ? <ol className="branch-list">{event.branches.map((branch) => <BranchDetail key={branch.id} branch={branch} onOpenApi={onOpenApi} />)}</ol> : null}</article>
}
function BranchDetail({ branch, onOpenApi }: { branch: EventBranchView; onOpenApi: () => void }) { return <li><p><code>{branch.id}</code> — {branch.otherwise ? <strong>otherwise</strong> : <code>{branch.when}</code>} → <code>{branch.to}</code></p>{branch.apiCall ? <button type="button" className="link" onClick={onOpenApi}>API <code>{branch.apiCall}</code></button> : null}{branch.expects ? <p className="muted">期待結果あり</p> : null}{branch.onSuccess ? <p className="muted">成功 → <code>{branch.onSuccess.to ?? '—'}</code></p> : null}{branch.onError ? <p className="muted">エラー → <code>{branch.onError.to ?? '—'}</code></p> : null}</li> }
