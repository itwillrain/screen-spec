import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("PCのイベントカードは内容幅に縮み長いフローだけ画面幅を上限にする", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  const desktopRule = css.match(/@media \(min-width: 761px\)\s*\{\s*\.event-card\s*\{([^}]*)\}/)?.[1] ?? ""

  assert.match(desktopRule, /width:\s*fit-content/)
  assert.match(desktopRule, /max-width:\s*100%/)
})
