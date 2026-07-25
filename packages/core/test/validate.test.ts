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
  analyzeTestData,
  parseTemplate,
  templateRefs,
  parseCondition,
  generateTestItems,
  testItemsToMarkdown,
  testItemsToCsv,
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

  it("expects.state が遷移先と不一致なら error", () => {
    const screen = {
      states: { a: { initial: true }, b: {}, c: {} },
      events: { go: { from: "a", to: "b", expects: { state: "c" } } },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "expectation-state-mismatch" && d.severity === "error")).toBe(true);
  });

  it("onSuccess.expects.navigate が遷移先画面と不一致なら error", () => {
    const screen = {
      states: { a: { initial: true }, b: {} },
      events: {
        go: {
          from: "a",
          to: "b",
          onSuccess: { navigate: "screen-a", expects: { navigate: "screen-b" } },
        },
      },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "expectation-navigate-mismatch" && d.severity === "error")).toBe(true);
  });

  it("expects.fields が未定義フィールドを参照すると warning", () => {
    const screen = {
      fields: { name: {} },
      states: { a: { initial: true }, b: {} },
      events: {
        go: { from: "a", to: "b", expects: { fields: { ghost: { value: "x" } } } },
      },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "unknown-expected-field" && d.where === "go")).toBe(true);
  });

  it("同じAPIエラー条件が重複すると warning", () => {
    const screen = {
      states: { a: { initial: true }, pending: {}, failed: {} },
      events: {
        go: {
          from: "a",
          to: "pending",
          onError: {
            to: "failed",
            cases: [
              { when: { status: 409, code: "CONFLICT" }, to: "failed" },
              { when: { status: 409, code: "CONFLICT" }, to: "failed" },
            ],
          },
        },
      },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "duplicate-error-case" && d.severity === "warning")).toBe(true);
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

describe("期待結果とAPIエラー構文（ADR 0003）", () => {
  const BASE = "https://ex.test/";
  const loader: DocumentLoader = () => {
    throw new Error("no external refs");
  };

  it("expects と onError.cases の最小構文が妥当", async () => {
    const result = await validateSpec(
      `specVersion: "0.1"
screen:
  id: example
  name: Example
  fields:
    name: { label: Name, type: text }
  states:
    editing: { initial: true }
    submitting: {}
    conflict: {}
    error: {}
  events:
    submit:
      from: editing
      to: submitting
      expects:
        state: submitting
        fields:
          name: { expression: "{fields.name}" }
      onError:
        to: error
        cases:
          - when: { status: 409, code: CONFLICT }
            to: conflict
            expects:
              message: { kind: warning, key: update.conflict }
        expects:
          state: error
          message: { kind: error, text: 更新に失敗しました }
`,
      `${BASE}screen.yaml`,
      loader,
    );
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("不正なHTTP status はスキーマエラー", async () => {
    const result = await validateSpec(
      `specVersion: "0.1"
screen:
  id: example
  name: Example
  states:
    a: { initial: true }
    b: {}
  events:
    go:
      from: a
      to: b
      onError:
        cases:
          - when: { status: 42 }
            to: a
`,
      `${BASE}screen.yaml`,
      loader,
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.stage === "raw")).toBe(true);
  });

  it("フィールド期待値の value と expression は同時指定不可", async () => {
    const result = await validateSpec(
      `specVersion: "0.1"
screen:
  id: example
  name: Example
  fields:
    name: { label: Name, type: text }
  states:
    a: { initial: true }
    b: {}
  events:
    go:
      from: a
      to: b
      expects:
        fields:
          name: { value: x, expression: "{fields.name}" }
`,
      `${BASE}screen.yaml`,
      loader,
    );
    expect(result.valid).toBe(false);
  });
});

describe("権限マトリクス（ADR 0004）", () => {
  const BASE = "https://ex.test/";
  const loader: DocumentLoader = () => {
    throw new Error("no external refs");
  };

  it("role×field×event の正しいマトリクスは診断なし", () => {
    const screen = {
      fields: { name: {}, role: {} },
      events: { submit: { from: "a", to: "b" } },
      states: { a: { initial: true }, b: {} },
      accessControl: {
        roles: {
          editor: {
            screen: { view: true },
            fields: { "*": { view: true, edit: false }, name: { edit: true } },
            events: { submit: { execute: true } },
          },
        },
      },
    };
    expect(analyzeScreen(screen)).toEqual([]);
  });

  it("未定義field/event参照は warning", () => {
    const screen = {
      fields: { name: {} },
      events: {},
      accessControl: {
        roles: {
          admin: {
            fields: { ghost: { view: true } },
            events: { missing: { execute: true } },
          },
        },
      },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "unknown-permission-field")).toBe(true);
    expect(diags.some((d) => d.code === "unknown-permission-event")).toBe(true);
  });

  it("edit=true かつ継承後view=falseは warning", () => {
    const screen = {
      fields: { name: {} },
      accessControl: {
        roles: { editor: { fields: { "*": { view: false }, name: { edit: true } } } },
      },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "edit-without-view" && d.where === "editor")).toBe(true);
  });

  it("新旧権限モデルの併用は warning", () => {
    const screen = {
      permissions: [{ role: "admin", access: "full" }],
      fields: { name: { permission: { editRoles: ["admin"] } } },
      accessControl: { roles: { admin: { screen: { view: true } } } },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "mixed-permission-models")).toBe(true);
  });

  it("旧permissions形式は後方互換で引き続き妥当", async () => {
    const result = await validateSpec(
      `specVersion: "0.1"
screen:
  id: legacy
  name: Legacy
  permissions:
    - { role: admin, access: full }
  fields:
    name:
      label: Name
      type: text
      permission: { editRoles: [admin] }
`,
      `${BASE}legacy.yaml`,
      loader,
    );
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("roleキーはcamelCaseに限定する", async () => {
    const result = await validateSpec(
      `specVersion: "0.1"
screen:
  id: example
  name: Example
  accessControl:
    roles:
      Admin: { screen: { view: true } }
`,
      `${BASE}screen.yaml`,
      loader,
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.stage === "raw")).toBe(true);
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

  it("testDataの未知画面・field・paramを警告する", () => {
    const screens = [{
      id: "user-edit",
      screen: {
        fields: { name: {} },
        params: { path: { userId: {} } },
      },
    }];
    const diags = analyzeProject(screens, [
      { testData: { screen: "missing", fixtures: [{ id: "x" }] }, source: "missing.yaml" },
      {
        testData: {
          screen: "user-edit",
          fixtures: [{ id: "existing", params: { ghost: 1 }, expected: { fields: { unknown: "x" } } }],
        },
        source: "user-edit.fixtures.yaml",
      },
    ]);
    expect(diags.map((d) => d.code)).toEqual([
      "unknown-test-data-screen",
      "unknown-test-data-param",
      "unknown-test-data-field",
    ]);
  });

  it("同じ画面のtestData文書間でfixture idが重複するとerror", () => {
    const screens = [{ id: "a", screen: { fields: {} } }];
    const diags = analyzeProject(screens, [
      { testData: { screen: "a", fixtures: [{ id: "same" }] }, source: "a-1.yaml" },
      { testData: { screen: "a", fixtures: [{ id: "same" }] }, source: "a-2.yaml" },
    ]);
    expect(diags).toContainEqual(expect.objectContaining({
      severity: "error",
      code: "duplicate-project-fixture-id",
      where: "a-2.yaml",
    }));
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

  it("enabledWhen も条件式として検査される（未定義参照は warning）", () => {
    const screen = { fields: { a: { enabledWhen: 'fields.ghost == "x"' } } };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "unknown-field-ref" && d.where === "a")).toBe(true);
  });
});

describe("field.default と options の整合", () => {
  it("default が options にあれば診断なし", () => {
    const screen = {
      fields: { role: { default: "viewer", options: [{ value: "admin" }, { value: "viewer" }] } },
    };
    expect(analyzeScreen(screen)).toEqual([]);
  });

  it("default が options に無ければ warning", () => {
    const screen = {
      fields: { role: { default: "ghost", options: [{ value: "admin" }, { value: "viewer" }] } },
    };
    const diags = analyzeScreen(screen);
    expect(diags.some((d) => d.code === "default-not-in-options" && d.where === "role")).toBe(true);
  });
});

describe("バリデーション語彙（ADR 0002）", () => {
  const BASE = "https://ex.test/";
  const loader: DocumentLoader = () => {
    throw new Error("no external refs");
  };
  const validateInline = (validations: string) =>
    validateSpec(
      `specVersion: "0.1"\nscreen:\n  id: s\n  name: S\n  fields:\n    a:\n      label: A\n      type: text\n${validations}`,
      `${BASE}s.yaml`,
      loader,
    );

  it("既知ルールが正しい型なら妥当・警告なし", async () => {
    const r = await validateInline(
      "      validations:\n        - { rule: required }\n        - { rule: maxLength, value: 50 }",
    );
    expect(r.valid).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("既知ルールで value 型が誤りだとスキーマエラー", async () => {
    const r = await validateInline("      validations:\n        - { rule: maxLength, value: fifty }");
    expect(r.valid).toBe(false);
  });

  it("未知ルールは warning（テスト導出対象外）", async () => {
    const r = await validateInline("      validations:\n        - { rule: customBiz }");
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.message.includes("customBiz"))).toBe(true);
  });
});

describe("testData ドキュメント（ADR 0005）", () => {
  it("フィクスチャ文書が妥当", async () => {
    const result = await validateDocument(example("user-edit.fixtures.yaml"));
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("fixture id 重複は error", () => {
    const diags = analyzeTestData({ fixtures: [{ id: "a" }, { id: "a" }] });
    expect(diags.some((d) => d.severity === "error" && d.code === "duplicate-fixture-id")).toBe(true);
  });
});

describe("テスト項目自動生成", () => {
  it("形式化された画面仕様から主要カテゴリを導出する", () => {
    const items = generateTestItems({
      fields: {
        name: {
          required: true,
          validations: [{ rule: "maxLength", value: 10 }],
          visibleWhen: 'fields.role == "admin"',
          enabledWhen: 'fields.status == "draft"',
        },
        role: {},
      },
      states: { editing: {}, submitting: {}, done: {}, error: {} },
      events: {
        submit: {
          from: "editing",
          to: "submitting",
          expects: { state: "submitting" },
          onSuccess: {
            to: "done",
            expects: { state: "done", message: { kind: "success", text: "保存しました" } },
          },
          onError: {
            to: "error",
            cases: [{ when: { status: 409 }, to: "editing", expects: { state: "editing" } }],
          },
        },
      },
      accessControl: {
        roles: {
          editor: {
            screen: { view: true },
            fields: { "*": { view: true, edit: false }, name: { edit: true } },
            events: { submit: { execute: true } },
          },
        },
      },
      params: { query: { tab: { required: true, enum: ["profile"], default: "profile" } } },
    });

    const categories = new Set(items.map((item) => item.category));
    expect(categories).toEqual(new Set(["required", "validation", "visibility", "enablement", "transition", "permission", "param"]));
    expect(items.some((item) => item.id === "field.name.maxLength.over")).toBe(true);
    expect(items.some((item) => item.id === "event.submit.error.case0" && item.expected.includes("state=editing"))).toBe(true);
    expect(items.some((item) => item.id === "event.submit.success" && item.expected.includes("保存しました"))).toBe(true);
    expect(items.some((item) => item.id === "access.editor.field.name" && item.expected.includes("編集=可"))).toBe(true);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it("未知バリデーションは自動導出しない", () => {
    const items = generateTestItems({ fields: { a: { validations: [{ rule: "customBiz" }] } } });
    expect(items).toEqual([]);
  });

  it("testDataから前提・入力・初期表示期待値を構造化して導出する", () => {
    const items = generateTestItems(
      { id: "user-edit", fields: { name: {}, role: {} } },
      {
        screen: "user-edit",
        fixtures: [{
          id: "existingEditor",
          description: "既存editorを表示",
          params: { userId: "u-001" },
          given: { user: { id: "u-001", role: "editor" } },
          expected: { fields: { name: "田中太郎", role: "editor" } },
        }],
      },
    );
    expect(items).toContainEqual({
      id: "fixture.existingEditor.initial",
      category: "fixture",
      target: "existingEditor",
      title: "既存editorを表示",
      expected: 'name="田中太郎" / role="editor"',
      fixtureId: "existingEditor",
      params: { userId: "u-001" },
      given: { user: { id: "u-001", role: "editor" } },
      expectedFields: { name: "田中太郎", role: "editor" },
    });
  });

  it("別画面向けtestDataは導出しない", () => {
    const items = generateTestItems(
      { id: "user-edit" },
      { screen: "user-list", fixtures: [{ id: "list" }] },
    );
    expect(items).toEqual([]);
  });

  it("Markdownでパイプ・改行をエスケープしJSONキー順を安定化する", () => {
    const markdown = testItemsToMarkdown([{
      id: "fixture.a.initial",
      category: "fixture",
      target: "a",
      title: "日本語 | 条件\n続き",
      expected: "表示",
      params: { z: 1, a: "値" },
    }]);
    expect(markdown).toContain("日本語 \\| 条件<br>続き");
    expect(markdown).toContain('{"a":"値","z":1}');
    expect(markdown.endsWith("\n")).toBe(true);
  });

  it("CSVでカンマ・引用符・改行をエスケープする", () => {
    const csv = testItemsToCsv([{
      id: "field.name.required",
      category: "required",
      target: "name",
      title: '姓, "名"\n入力',
      expected: "必須エラー",
    }]);
    expect(csv).toContain('"姓, ""名""\n入力"');
    expect(csv.split("\r\n")[0]).toBe("id,category,target,title,fixtureId,params,given,expected,expectedFields");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
});

describe("findOperation（OpenAPI 解決）", () => {
  it("サンプル OpenAPI から operation を解決する", () => {
    const doc = parseYaml(readFileSync(example("openapi/users.yaml"), "utf8"));

    const update = findOperation(doc, "updateUserById");
    expect(update?.method).toBe("PUT");
    expect(update?.path).toBe("/users/{userId}");
    // path 階層の userId がマージされる
    expect(update?.parameters.map((p) => `${p.in}:${p.name}`)).toContain("path:userId");
    // requestBody は $ref(UserInput) を解決して項目を得る
    expect(update?.requestFields).toEqual(["name", "email", "role"]);
    // response は $ref(UserResponse) → { data }
    expect(update?.responseFields).toEqual(["data"]);

    const list = findOperation(doc, "listUsers");
    expect(list?.method).toBe("GET");
    expect(list?.parameters.map((p) => `${p.in}:${p.name}`)).toEqual([
      "query:keyword",
      "query:role",
      "query:page",
    ]);
    // $ref(UserListResponse) → { data, total }
    expect(list?.responseFields).toEqual(["data", "total"]);
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
