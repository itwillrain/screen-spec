import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./styles.css"

class ViewerErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Viewer render failed", error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return <main className="page" role="alert">
      <h1>Viewer表示エラー</h1>
      <p>画面の描画中にエラーが発生しました。</p>
      <pre className="component-contract"><code>{this.state.error.message}</code></pre>
      <p><a href={import.meta.env.BASE_URL}>概要へ戻る</a></p>
    </main>
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ViewerErrorBoundary><App /></ViewerErrorBoundary>
  </StrictMode>,
)
