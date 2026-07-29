import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { discoverSpecFiles } from "./copy-specs.mjs";

test("project sample exposes every nested screen through the manifest", () => {
  const root = join(import.meta.dirname, "../../../examples");
  assert.deepEqual(discoverSpecFiles(root).screens, [
    "pages/audit/log.screen.yaml",
    "pages/notifications/detail.screen.yaml",
    "pages/notifications/edit.screen.yaml",
    "pages/notifications/list.screen.yaml",
    "pages/permissions/role-detail.screen.yaml",
    "pages/permissions/role-list.screen.yaml",
    "pages/users/edit.screen.yaml",
    "pages/users/list.screen.yaml",
  ]);
});
