import { describe, expect, it } from "vitest"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { validateDocument } from "../src/node.js"

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

describe("large multi-domain sample", () => {
  it.each(screens)("%s is a valid Screen Specification", async (path) => {
    const result = await validateDocument(resolve(examples, path))
    expect(result.issues).toEqual([])
    expect(result.valid).toBe(true)
  })
})
