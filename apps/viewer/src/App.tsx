import { useEffect, useRef, useState } from 'react'
import { analyzeProject } from '@screen-spec/core'
import { loadAllScreens, fetchLoader, type ScreenView } from './screen-view'
import { ScreenDetail } from './ScreenDetail'
import { ScreenGraph } from './ScreenGraph'
import { ScreenEditor } from './ScreenEditor'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; screens: ScreenView[] }

// 'overview' か画面 id
type Selection = 'overview' | string

type Theme = 'system' | 'light' | 'dark'

function ThemeControl() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('screen-spec-theme') as Theme | null) ?? 'system')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme === 'system' ? 'light dark' : theme
    localStorage.setItem('screen-spec-theme', theme)
  }, [theme])
  return (
    <label className="theme-control">
      <span>テーマ</span>
      <select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
        <option value="system">システム</option>
        <option value="light">ライト</option>
        <option value="dark">ダーク</option>
      </select>
    </label>
  )
}

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [selected, setSelected] = useState<Selection>(() => new URLSearchParams(window.location.search).get("screen") ?? "overview")
  const [navFilter, setNavFilter] = useState('')
  const [navOpen, setNavOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("screen-spec-sidebar-collapsed") === "true")
  const [editing, setEditing] = useState(() => new URLSearchParams(window.location.search).get("mode") === "edit")
  const mainRef = useRef<HTMLElement>(null)

  const setEditMode = (next: boolean) => {
    setEditing(next)
    const url = new URL(window.location.href)
    next ? url.searchParams.set("mode", "edit") : url.searchParams.delete("mode")
    window.history.pushState(null, "", url)
  }

  const toggleSidebar = () => {
    const next = !sidebarCollapsed
    setSidebarCollapsed(next)
    localStorage.setItem("screen-spec-sidebar-collapsed", String(next))
  }

  const selectScreen = (selection: Selection) => {
    setSelected(selection)
    setEditing(false)
    const url = new URL(window.location.href)
    url.searchParams.delete("mode")
    if (selection === "overview") url.searchParams.delete("screen")
    else url.searchParams.set("screen", selection)
    url.searchParams.delete("field")
    url.searchParams.delete("component")
    url.searchParams.delete("design")
    window.history.replaceState(null, "", url)
    setNavOpen(false)
    requestAnimationFrame(() => mainRef.current?.focus())
  }

  const navigateField = (screenId: string, fieldId: string) => {
    setSelected(screenId)
    const url = new URL(window.location.href)
    url.searchParams.set("screen", screenId)
    url.searchParams.set("tab", "fields")
    url.searchParams.set("field", fieldId)
    url.searchParams.delete("component")
    window.history.replaceState(null, "", url)
  }

  useEffect(() => {
    const restoreMode = () => setEditing(new URLSearchParams(window.location.search).get("mode") === "edit")
    window.addEventListener("popstate", restoreMode)
    return () => window.removeEventListener("popstate", restoreMode)
  }, [])

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    const specsBase = new URL(`${base}specs/`, window.location.origin).href
    let cancelled = false
    loadAllScreens(specsBase, fetchLoader)
      .then((screens) => {
        if (!cancelled) setState({ status: 'ready', screens })
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

  const screens = state.screens
  const current = selected === 'overview' ? undefined : screens.find((s) => s.id === selected)
  const nq = navFilter.trim().toLowerCase()
  const navScreens = nq
    ? screens.filter((s) => s.id.toLowerCase().includes(nq) || s.name.toLowerCase().includes(nq))
    : screens

  return (
    <>
      <a className="skip-link" href="#main-content">本文へ移動</a>
      <div className={sidebarCollapsed ? "layout sidebar-collapsed" : "layout"}>
      <nav className="sidebar" aria-label="画面ナビゲーション">
        <div className="sidebar-head">
          <p className="eyebrow">screen-spec viewer</p>
          <button className="sidebar-collapse" type="button" aria-expanded={!sidebarCollapsed} aria-label={sidebarCollapsed ? "サイドバーを開く" : "サイドバーを閉じる"} onClick={toggleSidebar}>
            <span aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span>
          </button>
          <button
            className="nav-toggle"
            type="button"
            aria-expanded={navOpen}
            aria-controls="screen-navigation"
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? '閉じる' : '画面を選ぶ'}
          </button>
        </div>
        <ThemeControl />
        {sidebarCollapsed ? (
          <span className="sidebar-current" title={current?.name ?? "概要"} aria-label={`現在の画面: ${current?.name ?? "概要"}`}>
            {current?.name?.slice(0, 1) ?? "⌂"}
          </span>
        ) : null}
        <div id="screen-navigation" className={navOpen ? 'sidebar-content open' : 'sidebar-content'}>
          <input
            className="filter"
            type="search"
            placeholder="画面を検索"
            aria-label="画面を検索"
            value={navFilter}
            onChange={(e) => setNavFilter(e.target.value)}
          />
          <ul className="nav">
            <li>
              <button
                className={selected === 'overview' ? 'nav-item active' : 'nav-item'}
                aria-current={selected === 'overview' ? 'page' : undefined}
                onClick={() => selectScreen('overview')}
              >
                概要
              </button>
            </li>
            {navScreens.map((s) => (
              <li key={s.id}>
                <button
                  className={selected === s.id ? 'nav-item active' : 'nav-item'}
                  aria-current={selected === s.id ? 'page' : undefined}
                  onClick={() => selectScreen(s.id)}
                >
                  {s.name || s.id}
                  {!s.valid ? <span className="badge badge-ng nav-badge">エラー {s.issueCount}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {navScreens.length === 0 ? <p className="empty" role="status">該当する画面はありません。</p> : null}
        </div>
      </nav>

      <main id="main-content" className="page" ref={mainRef} tabIndex={-1}>
        {current && editing ? (
          <ScreenEditor screen={current} onClose={() => setEditMode(false)} />
        ) : current ? (
          <ScreenDetail
            key={current.id}
            screen={current}
            screenIds={screens.map((s) => s.id)}
            onNavigate={(id) => selectScreen(id)}
            onNavigateField={navigateField}
            onEdit={() => setEditMode(true)}
          />
        ) : (
          <>
            <header className="page-head">
              <p className="eyebrow">overview</p>
              <h1>画面一覧</h1>
              <p className="muted">{screens.length} 画面。ナビから各画面の詳細を開けます。</p>
            </header>

            {(() => {
              const crossWarnings = [...analyzeProject(
                screens.map((s) => ({ id: s.id, screen: s.resolvedScreen })),
                screens[0]?.projectTestData ?? [],
              ), ...(screens[0]?.componentGraph.diagnostics ?? [])]
              return crossWarnings.length > 0 ? (
                <section>
                  <h2>横断警告</h2>
                  <ul className="warnings">
                    {crossWarnings.map((d, i) => (
                      <li key={i}>⚠ {d.message}</li>
                    ))}
                  </ul>
                </section>
              ) : null
            })()}

            <section>
              <h2>画面間遷移</h2>
              <p className="muted">各画面の transitions を集約した画面遷移図です。</p>
              <ScreenGraph screens={screens} />
            </section>

            <section>
              <h2>画面</h2>
              <table className="fields">
                <thead>
                  <tr>
                    <th>id</th>
                    <th>名前</th>
                    <th>route</th>
                    <th>検証</th>
                  </tr>
                </thead>
                <tbody>
                  {screens.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <button className="link" onClick={() => selectScreen(s.id)}>
                          <code>{s.id}</code>
                        </button>
                      </td>
                      <td>{s.name}</td>
                      <td>{s.route ? <code>{s.route}</code> : <span className="muted">—</span>}</td>
                      <td>
                        {s.valid ? (
                          <span className="badge badge-ok">valid</span>
                        ) : (
                          <span className="badge badge-ng">{s.issueCount}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </main>
      </div>
    </>
  )
}
