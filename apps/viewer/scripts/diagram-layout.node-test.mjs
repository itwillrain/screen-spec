import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("diagramは小さいSVGでは内容幅に縮み、大きいSVGでは画面幅を上限にする", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  const diagramRule = css.match(/\.diagram\s*\{([^}]*)\}/)?.[1] ?? ""

  assert.match(diagramRule, /width:\s*fit-content/)
  assert.match(diagramRule, /max-width:\s*100%/)
  assert.match(diagramRule, /overflow-x:\s*auto/)
})

test("Drawerのイベント図は高さで縮小せず利用可能な横幅を使う", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  const compactRule = css.match(/\.event-flow-diagram\.compact\s*\{([^}]*)\}/)?.[1] ?? ""
  const compactSvgRule = css.match(/\.event-flow-diagram\.compact svg\s*\{([^}]*)\}/)?.[1] ?? ""

  assert.match(compactRule, /width:\s*100%/)
  assert.match(compactSvgRule, /width:\s*100%/)
  assert.doesNotMatch(compactSvgRule, /max-height/)
})
