// mermaid を動的 import して初期バンドルから分離する。
// 図を描画するコンポーネントが初めて使うときにのみ読み込まれる。
type Mermaid = (typeof import('mermaid'))['default']

let promise: Promise<Mermaid> | undefined
let renderQueue: Promise<void> = Promise.resolve()

export function getMermaid(): Promise<Mermaid> {
  if (!promise) {
    promise = import('mermaid').then((mod) => {
      mod.default.initialize({
        startOnLoad: false,
        theme: 'neutral',
        themeVariables: {
          fontSize: '14px',
        },
        flowchart: {
          // 画面数や交差する遷移が増えても読みやすい配置にする。
          defaultRenderer: 'elk',
        },
      })
      return mod.default
    })
  }
  return promise
}

/** Mermaid/ELK は同時 render で内部状態が競合するため、アプリ内の描画を直列化する。 */
function preserveDiagramScale(svg: string): string {
  const viewBox = svg.match(/viewBox="[\d.-]+[ ,]+[\d.-]+[ ,]+([\d.]+)[ ,]+([\d.]+)"/)
  if (!viewBox) return svg
  const width = Math.ceil(Number(viewBox[1]))
  const height = Math.ceil(Number(viewBox[2]))
  if (!Number.isFinite(width) || !Number.isFinite(height)) return svg
  return svg.replace(/<svg\b[^>]*>/, (tag) =>
    tag
      .replace(/\s(?:width|height)="[^"]*"/g, "")
      .replace(/\sstyle="[^"]*"/, "")
      .replace(/>$/, " width=\"" + width + "\" height=\"" + height + "\">")
  )
}

export function renderMermaid(id: string, graph: string) {
  const job = renderQueue.then(async () => {
    const mermaid = await getMermaid()
    const result = await mermaid.render(id, graph)
    return { ...result, svg: preserveDiagramScale(result.svg) }
  })
  renderQueue = job.then(() => undefined, () => undefined)
  return job
}
