import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { mkdtempSync } from "node:fs";

import { discoverSpecFiles } from "./copy-specs.mjs";

test("discoverSpecFiles finds nested pages and component documents", () => {
  const root = mkdtempSync(join(tmpdir(), "screen-spec-discovery-"));
  mkdirSync(join(root, "pages", "users"), { recursive: true });
  mkdirSync(join(root, "components"), { recursive: true });
  writeFileSync(join(root, "pages", "users", "list.screen.yaml"), "screen:\n  id: user-list\n");
  writeFileSync(join(root, "components", "validations.yaml"), 'specVersion: "0.1"\ncomponents:\n  validations: {}\n');
  mkdirSync(join(root, "openapi"), { recursive: true });
  writeFileSync(join(root, "openapi", "users.yaml"), "openapi: 3.1.0\ncomponents:\n  schemas: {}\n");
  writeFileSync(join(root, "invalid.screen.yaml"), "screen:\n  id: invalid\n");

  assert.deepEqual(discoverSpecFiles(root), {
    screens: ["pages/users/list.screen.yaml"],
    testData: [],
    components: ["components/validations.yaml"],
  });
});
