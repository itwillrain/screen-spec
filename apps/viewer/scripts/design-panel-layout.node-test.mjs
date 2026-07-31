import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("2カラムPC表示ではデザインパネルをviewport内へ固定する", async () => {
  const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8")
  const desktopRule = css.match(/@media \(min-width: 1101px\)\s*\{\s*\.design-reference\s*\{([^}]*)\}/)?.[1] ?? ""

  assert.match(desktopRule, /position:\s*sticky/)
  assert.match(desktopRule, /top:\s*1rem/)
  assert.match(desktopRule, /max-height:\s*calc\(100dvh - 2rem\)/)
  assert.match(desktopRule, /overflow-y:\s*auto/)
  assert.match(desktopRule, /overscroll-behavior:\s*contain/)
})
