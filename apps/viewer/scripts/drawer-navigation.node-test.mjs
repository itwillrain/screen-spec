import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("Drawer下部の前後ボタンは同じ内容幅で左右へ配置する", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  const buttonRule = css.match(/\.field-detail-navigation button\s*\{([^}]*)\}/)?.[1] ?? ""
  const previousRule = css.match(/\.field-detail-navigation button:first-child\s*\{([^}]*)\}/)?.[1] ?? ""
  const nextRule = css.match(/\.field-detail-navigation button:last-child\s*\{([^}]*)\}/)?.[1] ?? ""

  assert.doesNotMatch(buttonRule, /width:\s*100%/)
  assert.match(previousRule, /justify-self:\s*start/)
  assert.match(nextRule, /justify-self:\s*end/)
})
