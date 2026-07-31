import { expect, it } from "vitest"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))

it("publishes an executable CLI package that depends on core", async () => {
  const manifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8")) as Record<string, any>

  expect(manifest.private).not.toBe(true)
  expect(manifest.main).toBe("./dist/index.js")
  expect(manifest.bin).toEqual({ "screen-spec": "./dist/index.js" })
  expect(manifest.files).toEqual(expect.arrayContaining(["dist"]))
  expect(manifest.dependencies["@screen-spec/core"]).toBe("0.1.0")
})
