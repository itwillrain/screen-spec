import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { stringifyYaml } from "@screen-spec/core"
import { CodeHighlight } from "./CodeHighlight"
import type { DiagnosticView, EventBranchView, EventView, FieldView, ScreenView, UIInstanceView } from './screen-view'

const PANE_KEY = 'screen-spec-field-review-pane'
const COLLAPSED_KEY = 'screen-spec-field-review-design-collapsed'
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

function formatDefaultValue(value: unknown): string {
  if (value !== null && typeof value === "object") return JSON.stringify(value, null, 2)
  return displayValue(value)
}

function DefaultValueDetail({ value }: { value: unknown }) {
  return <Detail label="既定値" value={formatDefaultValue(value)} code copy codeBlock={value !== null && typeof value === "object"} />
}

function TypeLabel({ value }: { value: string }) {
  const typeClass = value.toLowerCase().replace(/[^a-z0-9-]/g, "-")
  return <span className={"badge field-type type-" + typeClass}>{value}</span>
}

function CopyableText({ value, className, codeBlock = false }: { value: string; className?: string; codeBlock?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    await navigator.clipboard?.writeText(value)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }
  return <span className={`copyable-text${className ? ` ${className}` : ""}`}>
    {codeBlock ? <code><CodeHighlight source={value}/></code> : <span>{value}</span>}
    <button type="button" className="copy-text-button" aria-label={`「${value}」をコピー`} title={copied ? "コピーしました" : "コピー"} data-copied={copied || undefined} onClick={(event) => void copy(event)}>
      {copied ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> : <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></svg>}
      <span className="sr-only" aria-live="polite">{copied ? "コピーしました" : ""}</span>
    </button>
  </span>
}

function DrawerIcon({ name }: { name: "back" | "close" | "copy" }) {
  if (name === "back") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>
  if (name === "close") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></svg>
}

function DrawerIconButton({ name, label, onClick }: { name: "back" | "close" | "copy"; label: string; onClick: () => void }) {
  return <button type="button" className="drawer-icon-button" aria-label={label} title={label} onClick={onClick}><DrawerIcon name={name} /></button>
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

function EventIdLink({ eventId, onOpen }: { eventId: string; onOpen: (eventId: string) => void }) {
  const url = new URL(window.location.href)
  url.searchParams.set("tab", "states")
  url.searchParams.set("event", eventId)
  return <a className="event-id" href={url.toString()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); onOpen(eventId) }}><code>{eventId}</code></a>
}

export function FieldReviewWorkspace({ screen, onOpenTab, onOpenEvent, onNavigateField }: { screen: ScreenView; onOpenTab: (tab: string) => void; onOpenEvent: (eventId: string) => void; onNavigateField: (screenId: string, fieldId: string) => void }) {
  const [filter, setFilter] = useState('')
  const [hoveredDesignTarget, setHoveredDesignTarget] = useState<string>()
  const [tourFocusedTarget, setTourFocusedTarget] = useState<string>()
  const [typeFilter, setTypeFilter] = useState('all')
  const [eventFilter, setEventFilter] = useState('all')
  const [conditionFilter, setConditionFilter] = useState(false)
  const [diagnosticFilter, setDiagnosticFilter] = useState(false)
  const [drawerWidth, setDrawerWidth] = useState(() => {
    const saved = Number(localStorage.getItem(DRAWER_KEY)) || 512
    return Math.min(Math.max(360, window.innerWidth - 64), Math.max(320, saved))
  })
  const initialField = queryValue('field')
  const [expandedInstances, setExpandedInstances] = useState<Set<string>>(() => new Set(screen.uiInstances.map((instance) => instance.key)))
  const [selectedKey, setSelectedKey] = useState(() => screen.fields.some((field) => field.key === initialField) ? initialField : undefined)
  const [selectedInstanceKey, setSelectedInstanceKey] = useState(() => queryValue("instance"))
  const [selectedInstanceFieldKey, setSelectedInstanceFieldKey] = useState(() => queryValue("instanceField"))
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
      section.items.forEach((item) => result.set(`${item.kind}:${item.key}`, label))
    })
    return result
  }, [screen.layout])

  const enriched = useMemo(() => screen.fields.map((field) => {
    const events = relatedEvents(screen, field)
    return { kind: "field" as const, field, events, diagnostics: fieldDiagnostics(screen, field, events) }
  }), [screen])
  const enrichedInstances = useMemo(() => screen.uiInstances.map((instance) => {
    const events = instance.events.map((mapping) => screen.events.find((event) => event.key === mapping.screenEvent)).filter((event): event is EventView => !!event)
    const diagnostics = screen.diagnostics.filter((diagnostic) => diagnostic.path.includes(`/ui/${instance.key}`) || diagnostic.message.includes(`"${instance.key}"`))
    const component = screen.componentGraph.components.find((item) => item.id === instance.componentId)
    return { kind: "component" as const, instance, component, events, diagnostics }
  }), [screen])

  const elements = useMemo(() => {
    const fields = new Map(enriched.map((row) => [row.field.key, row]))
    const instances = new Map(enrichedInstances.map((row) => [row.instance.key, row]))
    const ordered = screen.layout?.sections.flatMap((section) => section.items.map((item) => item.kind === "field" ? fields.get(item.key) : instances.get(item.key)).filter((row): row is NonNullable<typeof row> => !!row)) ?? []
    const placed = new Set(ordered.map((row) => `${row.kind}:${row.kind === "field" ? row.field.key : row.instance.key}`))
    return [...ordered, ...enriched.filter((row) => !placed.has(`field:${row.field.key}`)), ...enrichedInstances.filter((row) => !placed.has(`component:${row.instance.key}`))]
  }, [screen.layout, enriched, enrichedInstances])

  const designTourNumbers = useMemo(() => {
    const result = new Map<string, number[]>()
    let step = 0
    for (const image of screen.design?.images ?? []) for (const mapping of image.mappings) {
      step += 1
      result.set(mapping.target, [...(result.get(mapping.target) ?? []), step])
    }
    return result
  }, [screen.design])
  const types = [...new Set([...screen.fields.map((field) => field.type).filter(Boolean), "component"])]
  const q = filter.trim().toLowerCase()
  const rows = elements.filter((row) => {
    const isField = row.kind === "field"
    const key = isField ? row.field.key : row.instance.key
    const label = isField ? row.field.label : row.component?.name ?? componentName(row.instance.componentId ?? row.instance.componentRef ?? row.instance.key)
    const copy = isField ? row.field.text ?? "" : JSON.stringify(asRecord(row.component?.contract)?.fields ?? {})
    const type = isField ? row.field.type : "component"
    const section = sections.get(`${row.kind}:${key}`) ?? "未配置"
    const hasCondition = isField ? !!row.field.visibleWhen || !!row.field.enabledWhen : !!row.instance.visibleWhen
    if (q && ![key, label, copy, section].some((value) => value.toLowerCase().includes(q))) return false
    if (typeFilter !== "all" && type !== typeFilter) return false
    if (eventFilter === "linked" && row.events.length === 0) return false
    if (eventFilter === "unlinked" && row.events.length > 0) return false
    if (conditionFilter && !hasCondition) return false
    if (diagnosticFilter && row.diagnostics.length === 0) return false
    return true
  })

  const selected = enriched.find(({ field }) => field.key === selectedKey)
  const selectedInstance = screen.uiInstances.find((instance) => instance.key === selectedInstanceKey)
  const detailTargets = rows.flatMap((row) => {
    if (row.kind === "field") return [{ kind: "field" as const, key: row.field.key }]
    const targets: Array<{ kind: "component"; key: string; fieldKey?: string }> = [{ kind: "component", key: row.instance.key }]
    if (expandedInstances.has(row.instance.key)) {
      const fields = Object.keys(asRecord(asRecord(row.component?.contract)?.fields) ?? {})
      targets.push(...fields.map((fieldKey) => ({ kind: "component" as const, key: row.instance.key, fieldKey })))
    }
    return targets
  })
  const currentDetailIndex = detailTargets.findIndex((target) => target.kind === "field" ? target.key === selectedKey : target.key === selectedInstanceKey && target.fieldKey === selectedInstanceFieldKey)
  const selectField = (key: string, focusDetail = true) => {
    setSelectedInstanceKey(undefined)
    setSelectedKey(key)
    setComponentTrail([])
    setQuery({ field: key, instance: undefined, component: undefined })
    if (focusDetail) requestAnimationFrame(() => detailHeading.current?.focus())
  }
  const selectInstance = (key: string, fieldKey?: string, focusDetail = true) => {
    setSelectedKey(undefined)
    setSelectedInstanceKey(key)
    setSelectedInstanceFieldKey(fieldKey)
    setComponentTrail([])
    setQuery({ field: undefined, instance: key, instanceField: fieldKey, component: undefined })
    if (focusDetail) requestAnimationFrame(() => detailHeading.current?.focus())
  }
  const selectedDesignTarget = selectedKey ?? (selectedInstanceKey ? selectedInstanceFieldKey ? `${selectedInstanceKey}.${selectedInstanceFieldKey}` : selectedInstanceKey : undefined)
  const focusTourTarget = (target: string) => {
    closeDetail()
    setTourFocusedTarget(target)
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(`[data-screen-element="${target}"]`)
      row?.scrollIntoView({ block: "center", behavior: "smooth" })
      row?.focus({ preventScroll: true })
    })
  }
  const closeDetail = () => {
    setSelectedInstanceKey(undefined)
    setSelectedInstanceFieldKey(undefined)
    setSelectedKey(undefined)
    setComponentTrail([])
    setQuery({ field: undefined, instance: undefined, instanceField: undefined, component: undefined })
  }
  const openComponent = (id: string) => {
    setComponentTrail([id])
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
  const navigateDetail = (offset: number) => {
    const target = detailTargets[currentDetailIndex + offset]
    if (!target) return
    target.kind === "field" ? selectField(target.key) : selectInstance(target.key, target.fieldKey)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-screen-element="` + (target.fieldKey ? target.key + "." + target.fieldKey : target.key) + `"]`)?.scrollIntoView({ block: "center" }))
  }
  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, kind: "field" | "component", key: string, fieldKey?: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      kind === "field" ? selectField(key) : selectInstance(key, fieldKey)
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
        {hasDesign && !designCollapsed ? <DesignReference screen={screen} selectedTarget={selectedDesignTarget} hoveredTarget={hoveredDesignTarget} onTourTarget={focusTourTarget} onTourEnd={() => setTourFocusedTarget(undefined)} onHoverTarget={setHoveredDesignTarget} /> : null}
        {hasDesign && !designCollapsed ? <div className="pane-resizer" role="separator" tabIndex={0} aria-label="デザインペインの幅" aria-orientation="vertical" aria-valuemin={25} aria-valuemax={60} aria-valuenow={Math.round(panePercent)} onPointerDown={startResize} onKeyDown={onResizeKeyDown} /> : null}
        <div className="field-review-main">
          <div className="field-list-sticky">
          <div className="detail-section-head element-list-head"><h2>画面要素</h2><div className="detail-actions"><button type="button" className="link" onClick={() => setExpandedInstances(new Set(screen.uiInstances.map((instance) => instance.key)))}>すべて開く</button><button type="button" className="link" onClick={() => setExpandedInstances(new Set())}>すべて閉じる</button></div></div>
          <FieldFilters
            filter={filter} setFilter={setFilter}
            types={types} typeFilter={typeFilter} setTypeFilter={setTypeFilter}
            eventFilter={eventFilter} setEventFilter={setEventFilter}
            conditionFilter={conditionFilter} setConditionFilter={setConditionFilter}
            diagnosticFilter={diagnosticFilter} setDiagnosticFilter={setDiagnosticFilter}
          />
          </div>
          <div className="table-scroll">
            <table className="fields review-fields">
              <thead><tr><th>要素ID</th><th>名称／文言</th><th>種別</th><th>必須</th><th>Event ID</th></tr></thead>
              <tbody>
                {rows.map((row, index) => {
                  const isField = row.kind === "field"
                  const key = isField ? row.field.key : row.instance.key
                  const label = isField ? row.field.label : row.component?.name ?? componentName(row.instance.componentId ?? row.instance.componentRef ?? row.instance.key)
                  const copy = isField ? row.field.text : undefined
                  const type = isField ? row.field.type : "Component"
                  const selectedRow = isField ? selectedKey === key : selectedInstanceKey === key
                  const section = sections.get(`${row.kind}:${key}`)
                  const previous = rows[index - 1]
                  const previousKey = previous ? previous.kind === "field" ? previous.field.key : previous.instance.key : undefined
                  const previousSection = previous && previousKey ? sections.get(`${previous.kind}:${previousKey}`) : undefined
                  const showSection = index === 0 || section !== previousSection
                  const errors = row.diagnostics.filter((item) => item.severity === "error").length
                  const warnings = row.diagnostics.length - errors
                  const componentFields = isField ? [] : Object.entries(asRecord(asRecord(row.component?.contract)?.fields) ?? {})
                  const expanded = !isField && expandedInstances.has(key)
                  const toggleExpanded = () => setExpandedInstances((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next })
                  return (
                    <Fragment key={`${row.kind}:${key}`}>
                      {showSection ? <tr className="section-group-row"><th colSpan={5} scope="rowgroup">{section ?? "未配置"}</th></tr> : null}
                      <tr tabIndex={0} data-screen-element={key} aria-selected={selectedRow} className={`${selectedRow ? "selected " : ""}${hoveredDesignTarget === key ? "design-linked-hover " : ""}${tourFocusedTarget === key ? "tour-focused " : ""}${isField ? "" : "component-chunk-row"}`} onMouseEnter={() => setHoveredDesignTarget(key)} onMouseLeave={() => setHoveredDesignTarget(undefined)} onClick={() => isField ? selectField(key) : selectInstance(key)} onKeyDown={(event) => onRowKeyDown(event, row.kind, key)}>
                        <td>{tourFocusedTarget !== undefined ? designTourNumbers.get(key)?.map((number) => <span key={number} className="tour-row-number" aria-label={`Design Tour ${number}`}>{number}</span>) : null}{!isField ? <button type="button" className="component-toggle" aria-label={`${label}を${expanded ? "閉じる" : "開く"}`} aria-expanded={expanded} onClick={(event) => { event.stopPropagation(); toggleExpanded() }}>{expanded ? "▾" : "▸"}</button> : null}<code className="element-id">{key}</code></td>
                        <td><span className="row-label"><strong>{label}</strong>{errors ? <span className="badge badge-ng">error {errors}</span> : null}{warnings ? <span className="badge badge-warning">warning {warnings}</span> : null}</span>{isField && copy ? <CopyableText className="field-copy" value={copy} /> : null}</td>
                        <td><TypeLabel value={type} /></td>
                        <td>{isField && INPUT_FIELD_TYPES.has(row.field.type) ? row.field.required ? "必須" : <span className="muted">任意</span> : <span className="muted">—</span>}</td>
                        <td>{row.events.length ? row.events.map((event) => <EventIdLink key={event.key} eventId={event.key} onOpen={onOpenEvent} />) : <span className="muted">—</span>}</td>
                      </tr>
                      {expanded ? componentFields.map(([fieldKey, rawField]) => { const field = asRecord(rawField); const eventId = typeof field?.eventId === "string" ? field.eventId : undefined; const mappedEvents = eventId ? row.instance.events.filter((mapping) => mapping.fieldEvent === eventId) : []; return <tr key={`${key}.${fieldKey}`} className={`component-field-row${hoveredDesignTarget === `${key}.${fieldKey}` ? " design-linked-hover" : ""}${tourFocusedTarget === `${key}.${fieldKey}` ? " tour-focused" : ""}`} data-screen-element={`${key}.${fieldKey}`} tabIndex={0} onMouseEnter={() => setHoveredDesignTarget(`${key}.${fieldKey}`)} onMouseLeave={() => setHoveredDesignTarget(undefined)} onClick={() => selectInstance(key, fieldKey)} onKeyDown={(event) => onRowKeyDown(event, "component", key, fieldKey)}><td>{tourFocusedTarget !== undefined ? designTourNumbers.get(`${key}.${fieldKey}`)?.map((number) => <span key={number} className="tour-row-number" aria-label={`Design Tour ${number}`}>{number}</span>) : null}<span className="component-field-branch" aria-hidden="true">└</span><code className="element-id">{key}.{fieldKey}</code></td><td><strong>{String(field?.label ?? fieldKey)}</strong>{typeof field?.text === "string" ? <CopyableText className="field-copy" value={field.text} /> : null}</td><td><TypeLabel value={String(field?.type ?? "unknown")} /></td><td>{field?.required === true ? "必須" : <span className="muted">—</span>}</td><td>{mappedEvents.length ? mappedEvents.map((mapping) => <EventIdLink key={mapping.screenEvent} eventId={mapping.screenEvent} onOpen={onOpenEvent} />) : eventId ? <EventIdLink eventId={eventId} onOpen={onOpenEvent} /> : <span className="muted">—</span>}</td></tr> }) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length === 0 ? <p className="empty" role="status">条件に一致する画面要素はありません。</p> : null}
          {selected || selectedInstance ? <><button type="button" className="field-detail-backdrop" aria-label="詳細ペインの外側をクリックして閉じる" onClick={closeDetail} /><nav className="field-detail-navigation" aria-label="項目間の移動" style={{ "--field-drawer-width": drawerWidth + "px" } as React.CSSProperties}><button type="button" disabled={currentDetailIndex <= 0} onClick={() => navigateDetail(-1)}>← 前の項目</button><span>{currentDetailIndex + 1} / {detailTargets.length}</span><button type="button" disabled={currentDetailIndex < 0 || currentDetailIndex >= detailTargets.length - 1} onClick={() => navigateDetail(1)}>次の項目 →</button></nav></> : null}
          {selected ? componentTrail.length ? <ComponentDetail componentId={componentTrail.at(-1)!} screen={screen} fieldId={selected.field.key} headingRef={detailHeading} onBack={backDetail} onClose={closeDetail} onOpenComponent={openComponent} onNavigateField={(targetScreen, targetField) => targetScreen === screen.id ? selectField(targetField) : onNavigateField(targetScreen, targetField)} drawerWidth={drawerWidth} onResizeStart={startDrawerResize} onResizeKeyDown={onDrawerResizeKeyDown} /> : <FieldDetail item={selected} section={sections.get(`field:${selected.field.key}`)} headingRef={detailHeading} onClose={closeDetail} onOpenTab={onOpenTab} onOpenComponent={openComponent} componentUsages={screen.componentGraph.usages.filter((usage) => usage.screenId === screen.id && usage.fieldId === selected.field.key)} drawerWidth={drawerWidth} onResizeStart={startDrawerResize} onResizeKeyDown={onDrawerResizeKeyDown} /> : selectedInstance ? componentTrail.length ? <ComponentDetail componentId={componentTrail.at(-1)!} screen={screen} fieldId={selectedInstance.key} headingRef={detailHeading} onBack={backDetail} onClose={closeDetail} onOpenComponent={openComponent} onNavigateField={onNavigateField} drawerWidth={drawerWidth} onResizeStart={startDrawerResize} onResizeKeyDown={onDrawerResizeKeyDown} /> : <UIInstanceDetail instance={selectedInstance} fieldKey={selectedInstanceFieldKey} screen={screen} headingRef={detailHeading} onClose={closeDetail} drawerWidth={drawerWidth} onResizeStart={startDrawerResize} onResizeKeyDown={onDrawerResizeKeyDown} /> : null}
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
  return <div className="field-filters" aria-label="画面要素の絞り込み">
    <input className="filter" type="search" aria-label="要素ID、名称、文言、セクションで検索" placeholder="要素ID・名称・文言・セクションを検索" value={props.filter} onChange={(event) => props.setFilter(event.target.value)} />
    <select aria-label="型で絞り込み" value={props.typeFilter} onChange={(event) => props.setTypeFilter(event.target.value)}><option value="all">すべての型</option>{props.types.map((type) => <option key={type}>{type}</option>)}</select>
    <select aria-label="Event連携で絞り込み" value={props.eventFilter} onChange={(event) => props.setEventFilter(event.target.value)}><option value="all">Event連携: すべて</option><option value="linked">連携あり</option><option value="unlinked">連携なし</option></select>
    <label><input type="checkbox" checked={props.conditionFilter} onChange={(event) => props.setConditionFilter(event.target.checked)} /> 条件あり</label>
    <label><input type="checkbox" checked={props.diagnosticFilter} onChange={(event) => props.setDiagnosticFilter(event.target.checked)} /> 診断あり</label>
  </div>
}

function DesignReference({ screen, selectedTarget, hoveredTarget, onTourTarget, onTourEnd, onHoverTarget }: { screen: ScreenView; selectedTarget?: string; hoveredTarget?: string; onTourTarget: (target: string) => void; onTourEnd: () => void; onHoverTarget: (target?: string) => void }) {
  const design = screen.design!
  const initialImage = Math.max(0, Math.min(Number(queryValue("design")) || 0, Math.max(0, design.images.length - 1)))
  const [index, setIndex] = useState(initialImage)
  const [tourStep, setTourStep] = useState<number>()
  const viewport = useRef<HTMLDivElement>(null)
  const image = design.images[index]
  const steps = design.images.flatMap((item, imageIndex) => item.mappings.map((mapping, mappingIndex) => ({ imageIndex, mappingIndex, mapping })))
  const setImage = (next: number) => { setIndex(next); setQuery({ design: String(next) }) }
  const targetLabel = (target: string) => {
    const directField = screen.fields.find((field) => field.key === target)
    if (directField) return directField.label
    const [instanceKey, fieldKey] = target.split(".")
    const instance = screen.uiInstances.find((item) => item.key === instanceKey)
    const component = screen.componentGraph.components.find((item) => item.id === instance?.componentId)
    if (!fieldKey) return component?.name ?? instanceKey
    const field = asRecord(asRecord(component?.contract)?.fields)?.[fieldKey]
    return String(asRecord(field)?.label ?? fieldKey)
  }
  const activateStep = (next: number) => {
    const normalized = (next + steps.length) % steps.length
    const step = steps[normalized]
    if (!step) return
    setTourStep(normalized)
    setImage(step.imageIndex)
    onTourTarget(step.mapping.target)
  }
  useEffect(() => {
    if (!selectedTarget) return
    const selectedStep = steps.findIndex((step) => step.mapping.target === selectedTarget)
    if (selectedStep >= 0 && steps[selectedStep].imageIndex !== index) setImage(steps[selectedStep].imageIndex)
  }, [selectedTarget])
  useEffect(() => {
    if (tourStep === undefined || steps[tourStep]?.imageIndex !== index) return
    requestAnimationFrame(() => viewport.current?.querySelector(`[data-tour-step="${tourStep}"]`)?.scrollIntoView({ block: "center", inline: "center" }))
  }, [index, tourStep])
  const activeTarget = hoveredTarget ?? selectedTarget
  return <aside className="design-reference" aria-label="デザイン参照">
    <div className="design-pane-sticky">
    <header><h2>デザイン</h2><span className="muted">{image ? `${index + 1} / ${design.images.length}` : "画像なし"}</span></header>
    <div className="design-tools">
      {image ? <a href={image.url} target="_blank" rel="noreferrer">別タブで開く ↗</a> : null}
    </div>
    {steps.length ? tourStep === undefined ? <button type="button" className="tour-start" onClick={() => activateStep(0)}>Design Tourを開始 <span>{steps.length}項目</span></button> : <div className="design-tour" aria-label="Design Tour"><div><span className="eyebrow">Design Tour {tourStep + 1} / {steps.length}</span><strong>{targetLabel(steps[tourStep].mapping.target)}</strong><code>{steps[tourStep].mapping.target}</code></div><div className="design-tour-actions"><button type="button" aria-label="前の項目" onClick={() => activateStep(tourStep - 1)}>←</button><button type="button" aria-label="次の項目" onClick={() => activateStep(tourStep + 1)}>→</button><button type="button" className="link" onClick={() => { setTourStep(undefined); onTourEnd() }}>終了</button></div></div> : null}
    </div>
    {image ? <div className="design-viewport" ref={viewport}><div className="design-canvas"><img src={image.url} alt={image.caption ?? `デザイン ${index + 1}`} draggable={false} />{tourStep !== undefined ? image.mappings.flatMap((mapping, mappingIndex) => { const stepIndex = steps.findIndex((step) => step.imageIndex === index && step.mappingIndex === mappingIndex); return mapping.regions.map((region, regionIndex) => <button key={`${mapping.target}:${regionIndex}`} type="button" className={`design-region${activeTarget === mapping.target ? " active" : ""}${tourStep === stepIndex ? " tour-current" : ""}`} data-tour-step={stepIndex} aria-label={`${targetLabel(mapping.target)}（${mapping.target}）を開く`} style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }} onPointerDown={(event) => event.stopPropagation()} onMouseEnter={() => onHoverTarget(mapping.target)} onMouseLeave={() => onHoverTarget(undefined)} onFocus={() => onHoverTarget(mapping.target)} onBlur={() => onHoverTarget(undefined)} onClick={() => { setTourStep(stepIndex); onTourTarget(mapping.target) }}><span>{stepIndex + 1}</span></button>) }) : null}</div></div> : <p className="empty">デザイン画像はありません。</p>}
    {image?.caption ? <p className="muted design-caption">{image.caption}</p> : null}
    {design.images.length > 1 ? <div className="design-thumbnails" aria-label="デザイン画像を選択">{design.images.map((item, itemIndex) => <button key={`${item.url}:${itemIndex}`} type="button" className={index === itemIndex ? "active" : ""} aria-pressed={index === itemIndex} onClick={() => { setImage(itemIndex); setTourStep(undefined) }}><img src={item.url} alt={item.caption ?? `デザイン ${itemIndex + 1}`} /></button>)}</div> : null}
    <div className="design-links">{design.figma ? <a href={design.figma} target="_blank" rel="noreferrer">Figmaを開く ↗</a> : null}{design.links.map((link, linkIndex) => <a key={`${link.url}:${linkIndex}`} href={link.url} target="_blank" rel="noreferrer">{link.label ?? link.url} ↗</a>)}</div>
  </aside>
}

function UIInstanceDetail({ instance, fieldKey, screen, headingRef, onClose, drawerWidth, onResizeStart, onResizeKeyDown }: {
  instance: UIInstanceView; fieldKey?: string; screen: ScreenView; headingRef: React.RefObject<HTMLHeadingElement | null>; onClose: () => void; drawerWidth: number; onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void; onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}) {
  const component = screen.componentGraph.components.find((item) => item.id === instance.componentId)
  const fieldRecord = fieldKey ? asRecord(asRecord(asRecord(component?.contract)?.fields)?.[fieldKey]) : undefined
  const fieldBindings = fieldKey ? instance.bindings.filter((binding) => binding.target === fieldKey || binding.target.startsWith(fieldKey + ".")) : instance.bindings
  const fieldEventId = typeof fieldRecord?.eventId === "string" ? fieldRecord.eventId : undefined
  const fieldEvents = fieldEventId ? instance.events.filter((event) => event.fieldEvent === fieldEventId) : fieldKey ? [] : instance.events
  const placement = screen.layout?.sections.find((section) => section.items.some((item) => item.kind === "component" && item.key === instance.key))
  return <section className="field-detail" role="complementary" aria-labelledby="instance-detail-title" style={{ "--field-drawer-width": drawerWidth + "px" } as React.CSSProperties}>
    <div className="field-detail-resizer" role="separator" tabIndex={0} aria-label="Component Instance詳細の幅" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={Math.max(360, window.innerWidth - 64)} aria-valuenow={drawerWidth} onPointerDown={onResizeStart} onKeyDown={onResizeKeyDown} />
    <header><div><p className="eyebrow">{fieldKey ? "component field" : "component instance"}</p><h2 className="drawer-title" id="instance-detail-title" ref={headingRef} tabIndex={-1}><span><code>{fieldKey ? instance.key + "." + fieldKey : instance.key}</code>{fieldKey ? " — " + String(fieldRecord?.label ?? fieldKey) : null}</span><TypeLabel value={fieldKey && typeof fieldRecord?.type === "string" ? fieldRecord.type : "Component"} /></h2><p className="component-identity">{component?.name ?? componentName(instance.componentId ?? instance.componentRef ?? "Unknown")}</p></div><DrawerIconButton name="close" label="詳細を閉じる" onClick={onClose} /></header>
    <dl className="field-detail-grid">{fieldKey ? <>{fieldRecord?.text !== undefined ? <Detail label="文言" value={String(fieldRecord.text)} copy /> : null}{typeof fieldRecord?.required === "boolean" ? <Detail label="必須" value={fieldRecord.required ? "必須" : "任意"} /> : null}{fieldRecord && "default" in fieldRecord ? <DefaultValueDetail value={fieldRecord.default} /> : null}</> : null}<Detail label="Section" value={placement?.title ?? placement?.id} /><Detail label="Region" value={placement?.region ?? "body"} /><Detail label="Field Binding" value={String(fieldBindings.length)} /><Detail label="Event Mapping" value={String(fieldEvents.length)} /></dl>
    {component ? <section><h3>Component定義</h3><p className="component-identity"><code>{component.uri.split("/").pop()}</code><span aria-hidden="true"> › </span><code>{component.name}</code> <DrawerIconButton name="copy" label="Component参照をコピー" onClick={() => void navigator.clipboard?.writeText(component.id)} /></p></section> : null}
    {fieldRecord && asRecord(fieldRecord.eventContext) ? <section><h3>Event Context</h3><dl className="event-context-list">{Object.entries(asRecord(fieldRecord.eventContext) ?? {}).map(([name, raw]) => { const value = asRecord(raw); return <div key={name}><dt><code>event.{name}</code></dt><dd><code>{String(value?.type ?? "unknown")}</code>{typeof value?.description === "string" ? " — " + value.description : null}</dd></div> })}</dl></section> : null}
    {fieldBindings.length ? <section><h3>Field Bindings</h3><ul className="instance-mappings">{fieldBindings.map((binding) => { const isObject = binding.value !== null && typeof binding.value === "object"; return <li key={binding.target}><code className="binding-target">{binding.target}</code>{binding.source ? <p className="binding-value"><span className="muted">参照</span><code>{binding.source}</code></p> : isObject ? <pre className="binding-value-block"><code><CodeHighlight source={JSON.stringify(binding.value, null, 2)}/></code></pre> : <p className="binding-value"><span className="muted">固定値</span><code>{displayValue(binding.value)}</code></p>}</li> })}</ul></section> : null}
    {fieldEvents.length ? <section><h3>Event Mappings</h3><ul className="instance-mappings">{fieldEvents.map((event) => <li key={event.fieldEvent}><code>{event.fieldEvent}</code><span aria-hidden="true"> → </span><code>{event.screenEvent}</code></li>)}</ul></section> : null}
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
    <header><div><p className="eyebrow">selected field</p><h2 className="drawer-title" id="field-detail-title" ref={headingRef} tabIndex={-1}><span><code>{field.key}</code> — {field.label}</span><TypeLabel value={field.type} /></h2></div><DrawerIconButton name="close" label="Field詳細を閉じる" onClick={onClose} /></header>
    <dl className="field-detail-grid">
      {field.text !== undefined || field.type === "button" || field.type === "label" ? <Detail label="文言" value={field.text} copy /> : null}
      {INPUT_FIELD_TYPES.has(field.type) ? <Detail label="必須" value={field.required ? "必須" : "任意"} /> : null}
      {INPUT_FIELD_TYPES.has(field.type) && field.default !== undefined ? <DefaultValueDetail value={field.default} /> : null}
      {INPUT_FIELD_TYPES.has(field.type) && field.placeholder ? <Detail label="プレースホルダー" value={field.placeholder} /> : null}
      {field.visibleWhen ? <Detail label="表示条件" value={field.visibleWhen} code /> : null}
      {field.enabledWhen ? <Detail label="有効条件" value={field.enabledWhen} code /> : null}
      {section ? <Detail label="セクション" value={section} /> : null}
      {field.width ? <Detail label="幅" value={field.width} code /> : null}
    </dl>
    {componentUsages.some((usage) => usage.location === "field-origin") ? <section><h3>Origin</h3><div className="component-links">{componentUsages.filter((usage) => usage.location === "field-origin").map((usage) => <button key={usage.componentId + usage.sourcePath} type="button" className="component-link" onClick={() => onOpenComponent(usage.componentId)}><span>Field Component</span><code>{componentName(usage.componentId)}</code></button>)}</div></section> : <p className="muted">Origin: Inline</p>}
    {INPUT_FIELD_TYPES.has(field.type) && (field.validations.length || componentUsages.some((usage) => usage.location === "validation")) ? <section><h3>Validation</h3><div className="component-links">{componentUsages.filter((usage) => usage.location === "validation").map((usage) => <button key={usage.componentId + usage.sourcePath} type="button" className="component-link" onClick={() => onOpenComponent(usage.componentId)}><span>Validation Component</span><code>{componentName(usage.componentId)}</code></button>)}</div>{field.validations.length ? <ul className="rules">{field.validations.map((validation, index) => <li key={validation.rule + index}><code>{validation.rule}</code>{validation.message ? " — " + validation.message : ""}</li>)}</ul> : null}</section> : null}
    {OPTION_FIELD_TYPES.has(field.type) && (field.options.length || componentUsages.some((usage) => usage.location === "options")) ? <section><h3>Options</h3><div className="component-links">{componentUsages.filter((usage) => usage.location === "options").map((usage) => <button key={usage.componentId + usage.sourcePath} type="button" className="component-link" onClick={() => onOpenComponent(usage.componentId)}><span>Options Component</span><code>{componentName(usage.componentId)}</code></button>)}</div>{field.options.length ? <ul className="rules">{field.options.map((option, index) => <li key={String(option.value) + index}><code>{displayValue(option.value)}</code> — {option.label}</li>)}</ul> : null}</section> : null}
    {field.binding ? <section><h3>データ入力</h3>{field.binding.options ? <dl className="field-detail-grid data-route">
      <div><dt>参照元</dt><dd>{field.binding.options.apiBinding ? <><code>api.{field.binding.options.apiBinding}</code><span aria-hidden="true"> → </span></> : null}<code>{field.binding.options.source}</code></dd></div>
      <div><dt>Value パス</dt><dd><code>{field.binding.options.valuePath}</code></dd></div>
      <div><dt>Label パス</dt><dd><code>{field.binding.options.labelPath}</code></dd></div>
      {field.binding.options.responsePath ? <div><dt>Response パス</dt><dd><code>{field.binding.options.responsePath}</code>{" "}{field.binding.options.pathStatus === "valid" ? <span className="badge badge-ok">path確認済み</span> : null}{field.binding.options.pathStatus === "invalid" ? <span className="badge badge-ng">path不正</span> : null}{field.binding.options.pathStatus === "unverifiable" ? <span className="badge badge-warning">path未検証</span> : null}</dd></div> : null}
    </dl> : null}{field.binding.loading ? <p className="muted data-route-loading">loading: <code>{field.binding.loading.source}</code>（読込中は無効化、既存Optionsを保持）</p> : null}</section> : null}
    {diagnostics.length ? <section><h3>診断</h3><ul className="diagnostic-list">{diagnostics.map((diagnostic, index) => <li key={`${diagnostic.path}:${index}`}><span className={`badge ${diagnostic.severity === 'error' ? 'badge-ng' : 'badge-warning'}`}>{diagnostic.severity}</span> {diagnostic.message}<small><code>{diagnostic.path}</code></small></li>)}</ul></section> : null}
    {events.length ? <section><div className="detail-section-head"><h3>関連Event</h3><button type="button" className="link" onClick={() => onOpenTab('states')}>状態遷移で開く</button></div>{events.map((event) => <EventDetail key={event.key} event={event} onOpenApi={() => onOpenTab('api')} />)}</section> : null}
  </section>
}

function componentName(id: string): string { return decodeURIComponent(id.split("/").pop() ?? id) }

function asRecord(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined }

function ComponentDetail({ componentId, screen, fieldId, headingRef, onBack, onClose, onOpenComponent, onNavigateField, drawerWidth, onResizeStart, onResizeKeyDown }: {
  componentId: string; screen: ScreenView; fieldId: string; headingRef: React.RefObject<HTMLHeadingElement | null>; onBack: () => void; onClose: () => void
  onOpenComponent: (id: string) => void; onNavigateField: (screenId: string, fieldId: string) => void; drawerWidth: number
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void; onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
}) {
  const [optionQuery, setOptionQuery] = useState("")
  const component = screen.componentGraph.components.find((item) => item.id === componentId)
  if (!component) return <section className="field-detail" role="complementary" style={{ "--field-drawer-width": drawerWidth + "px" } as React.CSSProperties}><header><div><p className="eyebrow">component</p><h2 ref={headingRef} tabIndex={-1}>Componentが見つかりません</h2></div><DrawerIconButton name="close" label="詳細を閉じる" onClick={onClose} /></header><p><code>{componentId}</code></p></section>
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
  const uiFields = asRecord(contract?.fields) ?? {}
  const instanceImpacts = screen.componentGraph.instanceImpacts.filter((impact) => impact.componentId === componentId)
  const options = component.kind === "options" && Array.isArray(component.contract) ? component.contract : Array.isArray(contract?.options) ? contract.options : []
  const filteredOptions = options.filter((item) => { const row = asRecord(item); const query = optionQuery.toLowerCase(); return !query || String(row?.value ?? "").toLowerCase().includes(query) || String(row?.label ?? "").toLowerCase().includes(query) })
  const dependencyButton = (id: string, label = "dependency") => <button key={id + label} type="button" className="component-link" onClick={() => onOpenComponent(id)}><span>{label}</span><code>{componentName(id)}</code></button>
  const usageList = (items: typeof impacts) => <ul className="component-usage-list">{items.map((impact) => { const direct = directFields.has(impact.screenId + ":" + impact.fieldId); return <li key={impact.screenId + impact.fieldId}><button className="link" type="button" onClick={() => impact.screenId === screen.id && impact.fieldId === fieldId ? onBack() : onNavigateField(impact.screenId, impact.fieldId)}><code>{impact.fieldId}</code></button><span className={"badge " + (direct ? "badge-ok" : "badge-region")}>{direct ? "直接利用" : "依存経由"}</span></li> })}</ul>
  return <section className="field-detail" role="complementary" aria-labelledby="component-detail-title" style={{ "--field-drawer-width": drawerWidth + "px" } as React.CSSProperties}>
    <div className="field-detail-resizer" role="separator" tabIndex={0} aria-label="Component詳細の幅" aria-orientation="vertical" aria-valuemin={320} aria-valuemax={Math.max(360, window.innerWidth - 64)} aria-valuenow={drawerWidth} onPointerDown={onResizeStart} onKeyDown={onResizeKeyDown} />
    <header><div className="detail-heading-with-back"><DrawerIconButton name="back" label="元の詳細へ戻る" onClick={onBack} /><div><p className="eyebrow">{component.kind} component</p><h2 className="drawer-title" id="component-detail-title" ref={headingRef} tabIndex={-1}><span>{component.name}</span>{component.kind === "field" && typeof contract?.type === "string" ? <TypeLabel value={contract.type} /> : null}</h2><p className="component-identity"><code>{component.uri.split("/").pop()}</code><span aria-hidden="true"> › </span><code>{component.kind}</code><span aria-hidden="true"> › </span><code>{component.name}</code> <DrawerIconButton name="copy" label="Component参照をコピー" onClick={() => void navigator.clipboard?.writeText(component.id)} /></p></div></div><div className="detail-actions"><DrawerIconButton name="close" label="詳細を閉じる" onClick={onClose} /></div></header>
    <dl className="component-metrics"><Detail label="直接参照" value={String(usages.length)} /><Detail label={component.kind === "ui" ? "影響Instance" : "影響Field"} value={String(component.kind === "ui" ? instanceImpacts.length : impacts.length)} /><Detail label="依存Component" value={String(dependencyIds.length)} /></dl>
    <section><h3>定義</h3>
      {component.kind === "field" && contract ? <><dl className="field-detail-grid">{typeof contract.label === "string" ? <Detail label="ラベル" value={contract.label} /> : null}{typeof contract.text === "string" ? <Detail label="文言" value={contract.text} copy /> : null}{typeof contract.required === "boolean" ? <Detail label="必須" value={contract.required ? "必須" : "任意"} /> : null}{contract.default !== undefined ? <DefaultValueDetail value={contract.default} /> : null}{typeof contract.placeholder === "string" ? <Detail label="プレースホルダー" value={contract.placeholder} /> : null}</dl>{validations.length ? <section><h4>Validation</h4><div className="component-links">{dependencies.filter((usage) => usage.location === "validation").map((usage) => dependencyButton(usage.componentId, "validation"))}</div>{validations.filter((item) => !asRecord(item)?.$ref).map((item, index) => <pre key={index} className="contract-inline"><code><CodeHighlight source={stringifyYaml(item)}/></code></pre>)}</section> : null}{contract.options !== undefined ? <section><h4>Options</h4><div className="component-links">{dependencies.filter((usage) => usage.location === "options").map((usage) => dependencyButton(usage.componentId, "options"))}</div></section> : null}</> : null}
      {component.kind === "validation" && contract ? <dl className="field-detail-grid"><Detail label="rule" value={typeof contract.rule === "string" ? contract.rule : undefined} code /><Detail label="value" value={contract.value === undefined ? undefined : displayValue(contract.value)} code /><Detail label="message" value={typeof contract.message === "string" ? contract.message : undefined} /></dl> : null}
      {component.kind === "options" ? <><p className="muted">{options.length} options</p>{options.length > 10 ? <details><summary>Optionsを表示 ({options.length})</summary><input type="search" className="filter" aria-label="Optionsを検索" placeholder="value・labelを検索" value={optionQuery} onChange={(event) => setOptionQuery(event.target.value)} /><div className="options-contract-scroll"><table className="fields"><thead><tr><th>value</th><th>label</th></tr></thead><tbody>{filteredOptions.map((item, index) => { const row = asRecord(item); return <tr key={String(row?.value) + index}><td><code>{displayValue(row?.value)}</code></td><td>{String(row?.label ?? "")}</td></tr> })}</tbody></table></div></details> : <table className="fields"><thead><tr><th>value</th><th>label</th></tr></thead><tbody>{filteredOptions.map((item, index) => { const row = asRecord(item); return <tr key={String(row?.value) + index}><td><code>{displayValue(row?.value)}</code></td><td>{String(row?.label ?? "")}</td></tr> })}</tbody></table>}</> : null}
      {component.kind === "ui" && contract ? <><section><h4>Fields</h4><table className="fields"><thead><tr><th>Field</th><th>ラベル／文言</th><th>型</th><th>Event ID</th><th>Event Context</th></tr></thead><tbody>{Object.entries(uiFields).map(([name, raw]) => { const field = asRecord(raw); return <tr key={name}><td><code>{name}</code></td><td>{String(field?.label ?? name)}{typeof field?.text === "string" ? <CopyableText className="field-copy" value={field.text} /> : null}</td><td><TypeLabel value={String(field?.type ?? "unknown")} /></td><td>{typeof field?.eventId === "string" ? <code>{field.eventId}</code> : <span className="muted">—</span>}</td><td>{asRecord(field?.eventContext) ? Object.keys(asRecord(field?.eventContext) ?? {}).map((name) => <code key={name}>event.{name}</code>) : <span className="muted">—</span>}</td></tr> })}</tbody></table></section></> : null}
    </section>
    {diagnostics.length ? <section><h3>診断</h3><ul className="diagnostic-list">{diagnostics.map((item, index) => <li key={item.code + index}><span className={"badge " + (item.severity === "error" ? "badge-ng" : "badge-warning")}>{item.severity}</span> {item.message}</li>)}</ul></section> : null}
    {dependencies.length ? <section><h3>依存Component</h3><div className="component-links">{dependencyIds.map((id) => dependencyButton(id))}</div></section> : null}
    <details><summary>Authored YAML</summary><pre className="component-contract"><code><CodeHighlight source={stringifyYaml(component.contract)}/></code></pre></details>
    {component.kind === "ui" ? <section><h3>利用Instance <span className="muted">({instanceImpacts.length})</span></h3><ul className="component-usage-list">{instanceImpacts.map((impact) => <li key={impact.screenId + impact.instanceId}><span><code>{impact.screenId}</code> › <code>{impact.instanceId}</code></span><span className="badge badge-ok">直接利用</span></li>)}</ul></section> : null}
    {component.kind !== "ui" ? <section><h3>この画面での利用 <span className="muted">({current.length})</span></h3>{current.length ? usageList(current) : <p className="muted">なし</p>}</section> : null}
    {component.kind !== "ui" && otherGroups.size ? <section><h3>他の画面での利用 <span className="muted">({impacts.length - current.length})</span></h3>{[...otherGroups].map(([screenId, items]) => <details key={screenId}><summary><code>{screenId}</code> ({items.length})</summary>{usageList(items)}</details>)}</section> : null}
  </section>
}

function Detail({ label, value, code, copy, codeBlock, badge }: { label: string; value?: string; code?: boolean; copy?: boolean; codeBlock?: boolean; badge?: boolean }) { return <div><dt>{label}</dt><dd>{value === undefined || value === '' ? <span className="muted">—</span> : copy ? <CopyableText value={value} codeBlock={codeBlock} className={codeBlock ? "code-block-copy" : undefined} /> : badge ? <TypeLabel value={value} /> : code ? <code>{value}</code> : value}</dd></div> }
function EventOutcomeSummary({ label, outcome }: { label: string; outcome?: { to?: string; navigate?: string; expects?: { message?: { kind: string; text?: string; key?: string } } } }) {
  if (!outcome || (!outcome.to && !outcome.navigate && !outcome.expects)) return null
  return <div className="event-flow-step"><strong>{label}</strong><p>{outcome.to ? <>状態 <code>{outcome.to}</code></> : null}{outcome.navigate ? <> / 画面 <code>{outcome.navigate}</code>へ遷移</> : null}{outcome.expects?.message ? <> / <span className={"message-kind message-" + outcome.expects.message.kind}>{outcome.expects.message.kind}</span> {outcome.expects.message.text ?? outcome.expects.message.key}</> : null}</p></div>
}
function EventDetail({ event, onOpenApi }: { event: EventView; onOpenApi: () => void }) {
  const actionStep = event.context.length ? 3 : 2
  const resultStep = actionStep + 1
  const completionStep = actionStep + 2
  return <article className="related-event event-flow"><header><div><p className="eyebrow">event</p><h4><code>{event.key}</code></h4></div><span className="event-route"><code>{event.from ?? "?"}</code> → {event.branches.length ? String(event.branches.length) + "分岐" : <code>{event.to ?? "?"}</code>}</span></header><div className="event-flow-step"><strong>1. きっかけ</strong><p>{event.target ? <>Field <code>{event.target}</code></> : event.trigger ? <code>{event.trigger}</code> : <span className="muted">未定義</span>}</p></div>{event.context.length ? <div className="event-flow-step"><strong>2. 引き渡す値</strong><dl className="event-context-list">{event.context.map((item) => <div key={item.name}><dt><code>event.{item.name}</code></dt><dd><code>{item.type}</code>{item.description ? " — " + item.description : null}</dd></div>)}</dl></div> : null}{event.branches.length ? <div className="event-flow-step"><strong>{actionStep}. 条件分岐（記述順）</strong><ol className="branch-list">{event.branches.map((branch) => <BranchDetail key={branch.id} branch={branch} onOpenApi={onOpenApi} />)}</ol></div> : <><div className="event-flow-step"><strong>{actionStep}. 実行する処理</strong><p>{event.apiCall ? <button type="button" className="link" onClick={onOpenApi}>API <code>{event.apiCall}</code></button> : <span className="muted">なし</span>}</p></div><EventOutcomeSummary label={resultStep + ". 実行後"} outcome={{ to: event.to, expects: event.expects }} /><EventOutcomeSummary label={completionStep + ". 成功時"} outcome={event.onSuccess} /><EventOutcomeSummary label={completionStep + ". エラー時"} outcome={event.onError} /></>}</article>
}
function BranchDetail({ branch, onOpenApi }: { branch: EventBranchView; onOpenApi: () => void }) { return <li><header><code>{branch.id}</code><span>{branch.otherwise ? "その他の場合" : <><code>{branch.when}</code> の場合</>}</span></header>{branch.apiCall ? <p><button type="button" className="link" onClick={onOpenApi}>API <code>{branch.apiCall}</code></button></p> : null}<EventOutcomeSummary label="結果" outcome={branch} /><EventOutcomeSummary label="成功" outcome={branch.onSuccess} /><EventOutcomeSummary label="エラー" outcome={branch.onError} /></li> }
