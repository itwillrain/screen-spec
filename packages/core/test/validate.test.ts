import { describe, it, expect } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDocument, resolveRefs, parseYaml } from "../src/index.js";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const examples = resolve(here, "../../../examples");

function example(name: string): string {
  return resolve(examples, name);
}

describe("validateDocument", () => {
  it("画面ファイル（$ref 参照つき）が妥当", () => {
    const result = validateDocument(example("user-edit.screen.yaml"));
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("共通コンポーネントファイル単体が妥当", () => {
    const result = validateDocument(example("common.yaml"));
    expect(result.valid).toBe(true);
  });

  it("不正ファイルは invalid（id/キー命名・$ref純粋性の違反を検出）", () => {
    const result = validateDocument(example("invalid.screen.yaml"));
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe("resolveRefs", () => {
  it("外部 $ref を展開し、純粋参照が具体値へ置換される", () => {
    const path = example("user-edit.screen.yaml");
    const raw = parseYaml(readFileSync(path, "utf8"));
    const resolved = resolveRefs(raw, path) as any;
    const email = resolved.screen.fields.email;
    expect(email.$ref).toBeUndefined();
    expect(email.type).toBe("email");
    // ネストした $ref（EmailField 内の validations）も解決される
    expect(email.validations[0].rule).toBe("required");
  });

  it("role.options の $ref が配列へ解決される", () => {
    const path = example("user-edit.screen.yaml");
    const raw = parseYaml(readFileSync(path, "utf8"));
    const resolved = resolveRefs(raw, path) as any;
    const options = resolved.screen.fields.role.options;
    expect(Array.isArray(options)).toBe(true);
    expect(options).toHaveLength(3);
    expect(options[0]).toEqual({ value: "admin", label: "管理者" });
  });
});
