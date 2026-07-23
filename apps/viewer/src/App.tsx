import { useEffect, useState } from 'react'
import { analyzeProject } from '@screen-spec/core'
import { loadAllScreens, fetchLoader, type ScreenView } from './screen-view'
import { ScreenDetail } from './ScreenDetail'
import { ScreenGraph } from './ScreenGraph'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; screens: ScreenView[] }

// 'overview' か画面 id
type Selection = 'overview' | string

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [selected, setSelected] = useState<Selection>('overview')

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

  return (
    <div className="layout">
      <nav className="sidebar">
        <p className="eyebrow">screen-spec viewer</p>
        <ul className="nav">
          <li>
            <button
              className={selected === 'overview' ? 'nav-item active' : 'nav-item'}
              onClick={() => setSelected('overview')}
            >
              概要
            </button>
          </li>
          {screens.map((s) => (
            <li key={s.id}>
              <button
                className={selected === s.id ? 'nav-item active' : 'nav-item'}
                onClick={() => setSelected(s.id)}
              >
                {s.name || s.id}
                {!s.valid ? <span className="badge badge-ng nav-badge">!</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <main className="page">
        {current ? (
          <ScreenDetail screen={current} />
        ) : (
          <>
            <header className="page-head">
              <p className="eyebrow">overview</p>
              <h1>画面一覧</h1>
              <p className="muted">{screens.length} 画面。左のナビから各画面の詳細を開けます。</p>
            </header>

            {(() => {
              const crossWarnings = analyzeProject(
                screens.map((s) => ({ id: s.id, screen: s.resolvedScreen })),
              )
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
                        <button className="link" onClick={() => setSelected(s.id)}>
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
  )
}
