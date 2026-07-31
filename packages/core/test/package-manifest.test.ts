import { describe, expect, it } from "vitest"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageRoot = resolve(fileURLToPath(new URL("..", import.meta.url)))

async function readManifest(path: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(packageRoot, path), "utf8")) as Record<string, unknown>
}

describe("npm package manifest", () => {
  it("publishes browser and Node entry points as built modules", async () => {
    const manifest = await readManifest("package.json")
    expect(manifest.private).not.toBe(true)
    expect(manifest.main).toBe("./dist/index.js")
    expect(manifest.types).toBe("./dist/index.d.ts")
    expect(manifest.files).toEqual(expect.arrayContaining(["dist"]))
    expect(manifest.exports).toMatchObject({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
      "./node": {
        types: "./dist/node.d.ts",
        import: "./dist/node.js",
      },
    })
  })

  it("exports browser and Node runtime functions from the built package", async () => {
    const browser = await import("@screen-spec/core")
    const node = await import("@screen-spec/core/node")
    expect(typeof browser.validateSpec).toBe("function")
    expect(typeof browser.resolveRefs).toBe("function")
    expect(typeof node.validateDocument).toBe("function")
    expect(typeof node.resolveDocument).toBe("function")
  })

  it("exposes the JSON Schema as a package subpath", async () => {
    const manifest = await readManifest("package.json")
    expect(manifest.exports).toMatchObject({ "./schema": "./dist/schema/screen.schema.json" })
  })
})


it("schema source stays synchronized with the repository schema", async () => {
  const canonical = JSON.parse(await readFile(resolve(packageRoot, "../../schema/screen.schema.json"), "utf8"))
  const packaged = JSON.parse(await readFile(resolve(packageRoot, "src/schema/screen.schema.json"), "utf8"))
  expect(packaged).toEqual(canonical)
})
