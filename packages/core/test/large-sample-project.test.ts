import { describe, expect, it } from "vitest"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { analyzeProject } from "../src/index.js"
import { resolveDocument } from "../src/node.js"

const examples = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../examples")
const screens = [
  "pages/audit/log.screen.yaml",
  "pages/notifications/detail.screen.yaml",
  "pages/notifications/edit.screen.yaml",
  "pages/notifications/list.screen.yaml",
  "pages/permissions/role-detail.screen.yaml",
  "pages/permissions/role-list.screen.yaml",
  "pages/users/edit.screen.yaml",
  "pages/users/list.screen.yaml",
]

describe("large sample project", () => {
  it("resolves every cross-screen transition inside the workspace", async () => {
    const documents = await Promise.all(screens.map(async (path) => {
      const document = await resolveDocument(resolve(examples, path)) as { screen?: { id: string } }
      return { id: document.screen!.id, screen: document.screen }
    }))

    expect(analyzeProject(documents).filter((diagnostic) => diagnostic.severity === "error")).toEqual([])
  })
})
