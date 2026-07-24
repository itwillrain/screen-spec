import { describe, it, expect } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  resolveRefs,
  parseYaml,
  validateSpec,
  analyzeScreen,
  analyzeProject,
  parseTemplate,
  templateRefs,
  parseCondition,
  type DocumentLoader,
} from "../src/index.js";
import { validateDocument, resolveDocument, nodeFileLoader, fileUri } from "../src/node.js";
import { findOperation } from "../src/openapi.js";

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

  it("action.apiCall が未定義の apiBinding を参照すると warning", () => {
    const screen = {
      states: { a: { initial: true }, b: {} },
      events: { go: { from: "a", to: "b", action: { apiCall: "missingBinding" } } },
      apiBindings: {},
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "undefined-api-binding" && d.where === "go")).toBe(true);
  });

  it("action.apiCall が定義済み apiBinding を参照すれば診断なし", () => {
    const screen = {
      states: { a: { initial: true }, b: {} },
      events: { go: { from: "a", to: "b", action: { apiCall: "updateUser" } } },
      apiBindings: { updateUser: {} },
    };
    expect(analyzeScreen(screen)).toEqual([]);
  });

  it("式が未定義フィールド/route パラメータを参照すると warning", () => {
    const screen = {
      route: "/users/{userId}",
      fields: { name: {} },
      apiBindings: {
        save: {
          request: { body: { name: "{fields.missing}", id: "{screen.route.other}" } },
        },
      },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "unknown-field-ref")).toBe(true);
    expect(diags.some((d) => d.code === "unknown-route-param")).toBe(true);
  });

  it("response.mapping のキーが未定義フィールドなら warning", () => {
    const screen = {
      fields: { name: {} },
      apiBindings: { get: { response: { mapping: { ghost: "data.x" } } } },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "unknown-field-in-mapping")).toBe(true);
  });

  it("正しい式・マッピングは診断なし", () => {
    const screen = {
      route: "/users/{userId}",
      fields: { name: {}, email: {} },
      apiBindings: {
        get: {
          request: { path: { userId: "{screen.route.userId}" } },
          response: { mapping: { name: "data.name", email: "data.email" } },
        },
      },
    };
    expect(analyzeScreen(screen)).toEqual([]);
  });
});

describe("横断解析（analyzeProject）", () => {
  it("既知の画面への遷移は診断なし", () => {
    const screens = [
      { id: "a", screen: { transitions: { t: { to: "b" } } } },
      { id: "b", screen: { transitions: { t: { to: "a" } } } },
    ];
    expect(analyzeProject(screens)).toEqual([]);
  });

  it("未知の画面への transition / navigate は warning", () => {
    const screens = [
      {
        id: "a",
        screen: {
          transitions: { t: { to: "ghost" } },
          events: { go: { onSuccess: { navigate: "missing" } } },
        },
      },
    ];
    const diags = analyzeProject(screens);
    expect(diags.filter((d) => d.code === "unknown-screen-ref")).toHaveLength(2);
  });

  it("実サンプル 2 画面は横断診断なし", async () => {
    const a = (await resolveDocument(example("user-edit.screen.yaml"))) as { screen?: { id: string } };
    const b = (await resolveDocument(example("user-list.screen.yaml"))) as { screen?: { id: string } };
    const diags = analyzeProject([
      { id: a.screen!.id, screen: a.screen },
      { id: b.screen!.id, screen: b.screen },
    ]);
    expect(diags).toEqual([]);
  });
});

describe("OpenAPI specRef 検証", () => {
  const BASE = "https://ex.test/";
  const api = `openapi: 3.1.0
info: { title: t, version: 1.0.0 }
paths:
  /x:
    get:
      operationId: getIt`;
  const screenFor = (opId: string) => `specVersion: "0.1"
screen:
  id: s
  name: S
  apiBindings:
    a:
      openapi: { operationId: ${opId}, specRef: ./api.yaml }`;
  const loaderFor = (screenText: string): DocumentLoader => (uri) => {
    const name = uri.slice(BASE.length);
    if (name === "screen.yaml") return screenText;
    if (name === "api.yaml") return api;
    throw new Error(`404 ${uri}`);
  };

  it("operationId が存在すれば warning なし", async () => {
    const text = screenFor("getIt");
    const r = await validateSpec(text, `${BASE}screen.yaml`, loaderFor(text));
    expect(r.valid).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("operationId が無ければ openapi warning", async () => {
    const text = screenFor("nope");
    const r = await validateSpec(text, `${BASE}screen.yaml`, loaderFor(text));
    expect(r.warnings.some((w) => w.stage === "openapi")).toBe(true);
  });
});

describe("compose（明示合成）", () => {
  const BASE = "https://ex.test/";
  const common = `specVersion: "0.1"
components:
  fields:
    Base:
      label: ベース
      type: text
      required: true`;
  const loader: DocumentLoader = (uri) => {
    const name = uri.slice(BASE.length).split("#")[0];
    if (name === "common.yaml") return common;
    throw new Error(`404 ${uri}`);
  };

  it("compose がマージし、兄弟キーが最優先で上書きする", async () => {
    const screenText = `specVersion: "0.1"
screen:
  id: s
  name: S
  fields:
    f:
      compose:
        - $ref: "./common.yaml#/components/fields/Base"
      required: false`;
    const raw = parseYaml(screenText);
    const resolved = (await resolveRefs(raw, `${BASE}s.yaml`, loader)) as any;
    expect(resolved.screen.fields.f).toEqual({ label: "ベース", type: "text", required: false });
  });

  it("compose を使った画面が検証を通る", async () => {
    const screenText = `specVersion: "0.1"
screen:
  id: s
  name: S
  fields:
    f:
      compose:
        - $ref: "./common.yaml#/components/fields/Base"
      label: 上書きラベル`;
    const result = await validateSpec(screenText, `${BASE}s.yaml`, loader);
    expect(result.valid).toBe(true);
  });
});

describe("式エンジン（parseTemplate）", () => {
  it("リテラルと複数補間をパースする", () => {
    const { parts, errors } = parseTemplate("/users/{screen.route.userId}/x{fields.name}");
    expect(errors).toEqual([]);
    expect(parts).toEqual([
      { type: "literal", text: "/users/" },
      { type: "ref", root: "screen", path: ["route", "userId"], raw: "screen.route.userId" },
      { type: "literal", text: "/x" },
      { type: "ref", root: "fields", path: ["name"], raw: "fields.name" },
    ]);
  });

  it("templateRefs が参照のみを返す", () => {
    expect(templateRefs("{fields.a}{fields.b}").map((r) => r.raw)).toEqual(["fields.a", "fields.b"]);
  });

  it("未閉じ括弧・空式は構文エラー", () => {
    expect(parseTemplate("{fields.a").errors.length).toBeGreaterThan(0);
    expect(parseTemplate("{}").errors.length).toBeGreaterThan(0);
  });

  it("未知ルートの参照は analyze で warning", () => {
    const screen = {
      fields: { name: {} },
      apiBindings: { b: { request: { body: { x: "{ctx.user}" } } } },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "unknown-expression-ref")).toBe(true);
  });
});

describe("layout 検査", () => {
  it("未定義フィールドの配置は warning", () => {
    const screen = { fields: { a: {} }, layout: { sections: [{ id: "s", fields: ["a", "ghost"] }] } };
    expect(analyzeScreen(screen).some((d) => d.code === "unknown-field-in-layout")).toBe(true);
  });

  it("layout があり未配置のフィールドは warning", () => {
    const screen = { fields: { a: {}, b: {} }, layout: { sections: [{ fields: ["a"] }] } };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "field-not-in-layout" && d.where === "b")).toBe(true);
  });

  it("全フィールドを配置すれば診断なし", () => {
    const screen = { fields: { a: {}, b: {} }, layout: { sections: [{ fields: ["a", "b"] }] } };
    expect(analyzeScreen(screen)).toEqual([]);
  });
});

describe("条件式（parseCondition / visibleWhen）", () => {
  it("比較と &&/|| をパースする", () => {
    const r = parseCondition('fields.role == "admin" && fields.name != ""');
    expect(r.errors).toEqual([]);
    expect(r.ast?.type).toBe("and");
    expect(r.refs.map((x) => x.raw)).toEqual(["fields.role", "fields.name"]);
  });

  it("構文エラーを報告する", () => {
    expect(parseCondition("fields.role ==").errors.length).toBeGreaterThan(0);
    expect(parseCondition("").errors.length).toBeGreaterThan(0);
  });

  it("visibleWhen の未定義フィールド参照は warning", () => {
    const screen = { fields: { role: {}, x: { visibleWhen: 'fields.ghost == "y"' } } };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "unknown-field-ref" && d.where === "x")).toBe(true);
  });

  it("visibleWhen の構文エラーは warning", () => {
    const screen = { fields: { x: { visibleWhen: "fields.role ==" } } };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "condition-syntax")).toBe(true);
  });

  it("正しい visibleWhen は診断なし", () => {
    const screen = { fields: { role: {}, x: { visibleWhen: 'fields.role == "admin"' } } };
    expect(analyzeScreen(screen)).toEqual([]);
  });
});

describe("findOperation（OpenAPI 解決）", () => {
  it("サンプル OpenAPI から operation を解決する", () => {
    const doc = parseYaml(readFileSync(example("openapi/users.yaml"), "utf8"));

    const update = findOperation(doc, "updateUserById");
    expect(update?.method).toBe("PUT");
    expect(update?.path).toBe("/users/{userId}");
    expect(update?.parameters.map((p) => p.name)).toContain("userId");
    expect(update?.requestFields).toEqual(["name", "email", "role"]);

    const list = findOperation(doc, "listUsers");
    expect(list?.method).toBe("GET");
    expect(list?.parameters.map((p) => `${p.in}:${p.name}`)).toEqual(["query:keyword", "query:role"]);
    expect(list?.responseFields).toEqual(["data"]);
  });

  it("未知 operationId は undefined", () => {
    const doc = parseYaml(readFileSync(example("openapi/users.yaml"), "utf8"));
    expect(findOperation(doc, "nope")).toBeUndefined();
  });
});

describe("params（path / query）", () => {
  it("route プレースホルダと path 宣言が一致すれば診断なし", () => {
    const screen = {
      route: "/users/{userId}",
      params: { path: { userId: { type: "string" } } },
    };
    expect(analyzeScreen(screen)).toEqual([]);
  });

  it("route に無い path 宣言・未宣言のプレースホルダは warning", () => {
    const screen = {
      route: "/users/{userId}",
      params: { path: { ghost: { type: "string" } } },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "path-param-not-in-route")).toBe(true);
    expect(diags.some((d) => d.code === "undeclared-path-param")).toBe(true);
  });

  it("式が宣言済み query パラメータを参照すれば診断なし、未宣言なら warning", () => {
    const ok = {
      params: { query: { tab: { type: "string" } } },
      fields: { a: {} },
      apiBindings: { b: { request: { query: { tab: "{screen.query.tab}" } } } },
    };
    expect(analyzeScreen(ok)).toEqual([]);

    const bad = {
      fields: { a: {} },
      apiBindings: { b: { request: { query: { tab: "{screen.query.missing}" } } } },
    };
    expect(analyzeScreen(bad).some((d) => d.code === "unknown-query-param")).toBe(true);
  });
});
