// mermaid を動的 import して初期バンドルから分離する。
// 図を描画するコンポーネントが初めて使うときにのみ読み込まれる。
type Mermaid = (typeof import('mermaid'))['default']

let promise: Promise<Mermaid> | undefined

export function getMermaid(): Promise<Mermaid> {
  if (!promise) {
    promise = import('mermaid').then((mod) => {
      mod.default.initialize({ startOnLoad: false, theme: 'neutral' })
      return mod.default
    })
  }
  return promise
}
