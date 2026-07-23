import { describe, it, expect } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolveRefs, parseYaml, validateSpec, analyzeScreen, type DocumentLoader } from "../src/index.js";
import { validateDocument, nodeFileLoader, fileUri } from "../src/node.js";

const here = dirname(fileURLToPath(import.meta.url));
const examples = resolve(here, "../../../examples");

function example(name: string): string {
  return resolve(examples, name);
}

describe("validateDocument", () => {
  it("画面ファイル（$ref 参照つき）が妥当", async () => {
    const result = await validateDocument(example("user-edit.screen.yaml"));
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("共通コンポーネントファイル単体が妥当", async () => {
    const result = await validateDocument(example("common.yaml"));
    expect(result.valid).toBe(true);
  });

  it("不正ファイルは invalid（id/キー命名・$ref純粋性の違反を検出）", async () => {
    const result = await validateDocument(example("invalid.screen.yaml"));
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});

describe("resolveRefs", () => {
  it("外部 $ref を展開し、純粋参照が具体値へ置換される", async () => {
    const path = example("user-edit.screen.yaml");
    const raw = parseYaml(readFileSync(path, "utf8"));
    const resolved = (await resolveRefs(raw, fileUri(path), nodeFileLoader)) as any;
    const email = resolved.screen.fields.email;
    expect(email.$ref).toBeUndefined();
    expect(email.type).toBe("email");
    // ネストした $ref（EmailField 内の validations）も解決される
    expect(email.validations[0].rule).toBe("required");
  });

  it("role.options の $ref が配列へ解決される", async () => {
    const path = example("user-edit.screen.yaml");
    const raw = parseYaml(readFileSync(path, "utf8"));
    const resolved = (await resolveRefs(raw, fileUri(path), nodeFileLoader)) as any;
    const options = resolved.screen.fields.role.options;
    expect(Array.isArray(options)).toBe(true);
    expect(options).toHaveLength(3);
    expect(options[0]).toEqual({ value: "admin", label: "管理者" });
  });
});

describe("browser-style resolution (HTTP base URL + custom loader)", () => {
  // fetch を模したローダー: http(s) URL をローカルの examples にマップする。
  const BASE = "https://example.test/specs/";
  const httpLoader: DocumentLoader = (uri) => {
    if (!uri.startsWith(BASE)) throw new Error(`unexpected uri: ${uri}`);
    const name = uri.slice(BASE.length).split("#")[0];
    return readFileSync(example(name), "utf8");
  };

  it("http ベース URL に対して外部 $ref を相対 URL 解決できる", async () => {
    const entry = `${BASE}user-edit.screen.yaml`;
    const raw = parseYaml(await httpLoader(entry));
    const resolved = (await resolveRefs(raw, entry, httpLoader)) as any;
    expect(resolved.screen.fields.email.type).toBe("email");
    expect(resolved.screen.fields.email.validations[1].rule).toBe("pattern");
  });

  it("validateSpec が fs 非依存のローダーで妥当と判定する", async () => {
    const entry = `${BASE}user-edit.screen.yaml`;
    const result = await validateSpec(await httpLoader(entry), entry, httpLoader);
    expect(result.valid).toBe(true);
  });
});

describe("状態機械の解析（analyzeScreen・案C）", () => {
  it("正しい状態機械は診断なし", () => {
    const screen = {
      states: {
        viewing: { initial: true },
        editing: {},
      },
      events: {
        edit: { from: "viewing", to: "editing" },
      },
    };
    expect(analyzeScreen(screen)).toEqual([]);
  });

  it("未定義状態への参照は error", () => {
    const screen = {
      states: { viewing: { initial: true } },
      events: { go: { from: "viewing", to: "missing" } },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.severity === "error" && d.code === "undefined-state-ref")).toBe(true);
  });

  it("初期状態なしは warning", () => {
    const screen = { states: { a: {}, b: {} }, events: { go: { from: "a", to: "b" } } };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.severity === "warning" && d.code === "no-initial-state")).toBe(true);
  });

  it("到達不能な状態は warning", () => {
    const screen = {
      states: { a: { initial: true }, b: {}, orphan: {} },
      events: { go: { from: "a", to: "b" } },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "unreachable-state" && d.where === "orphan")).toBe(true);
  });

  it("サンプル画面（状態遷移つき）は error なし・warning なし", async () => {
    const result = await validateDocument(example("user-edit.screen.yaml"));
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});
