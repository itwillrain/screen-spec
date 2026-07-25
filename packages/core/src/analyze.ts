// 状態機械（states/events）と API 連携式（apiBindings）の意味解析。
//  - 未定義の状態参照は error（構造的な誤り）
//  - initial の 0 個 / 複数、到達不能な状態、未定義参照（apiBinding / フィールド / route）は warning
// JSON Schema では表現できないクロス参照・到達性を補完する（決定 #10 / #11）。

import { parseTemplate, parseCondition, type RefExpr } from "./expr.js";
import { isKnownRule } from "./validation-rules.js";

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  /** 関連する状態/イベント/バインディングのキー（任意） */
  where?: string;
}

interface ExpectationLike {
  state?: unknown;
  navigate?: unknown;
  fields?: Record<string, { expression?: unknown }>;
}

interface EventOutcomeLike {
  to?: unknown;
  navigate?: unknown;
  expects?: ExpectationLike;
}

interface ErrorCaseLike extends EventOutcomeLike {
  when?: { status?: unknown; code?: unknown };
}

interface EventLike {
  from?: unknown;
  to?: unknown;
  action?: { apiCall?: unknown };
  expects?: ExpectationLike;
  onSuccess?: EventOutcomeLike;
  onError?: EventOutcomeLike & { cases?: ErrorCaseLike[] };
}

interface ApiBindingLike {
  request?: {
    path?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: Record<string, unknown>;
  };
  response?: { mapping?: Record<string, unknown> };
}

interface LayoutLike {
  sections?: Array<{ id?: unknown; title?: unknown; fields?: unknown }>;
}

interface ScreenLike {
  route?: unknown;
  params?: { path?: Record<string, unknown>; query?: Record<string, unknown> };
  fields?: Record<string, unknown>;
  layout?: LayoutLike;
  states?: Record<string, { initial?: unknown }>;
  events?: Record<string, EventLike>;
  apiBindings?: Record<string, ApiBindingLike>;
  permissions?: unknown[];
  accessControl?: {
    roles?: Record<
      string,
      {
        fields?: Record<string, { view?: unknown; edit?: unknown }>;
        events?: Record<string, { execute?: unknown }>;
      }
    >;
  };
}

/** accessControl の参照と継承後の権限整合性を検査する（ADR 0004）。 */
function analyzeAccessControl(s: ScreenLike, diagnostics: Diagnostic[]): void {
  const roles = s.accessControl?.roles;
  if (!roles) return;
  const fields = s.fields ?? {};
  const events = s.events ?? {};
  const hasLegacyFieldPermission = Object.values(fields).some(
    (field) => field && typeof field === "object" && "permission" in field,
  );
  if ((s.permissions?.length ?? 0) > 0 || hasLegacyFieldPermission) {
    diagnostics.push({
      severity: "warning",
      code: "mixed-permission-models",
      message: "accessControl と旧 permissions / field.permission が併用されています。accessControl へ集約してください。",
    });
  }

  for (const [role, access] of Object.entries(roles)) {
    const fieldRules = access.fields ?? {};
    const wildcard = fieldRules["*"] ?? {};
    for (const [field, rule] of Object.entries(fieldRules)) {
      if (field !== "*" && !(field in fields)) {
        diagnostics.push({
          severity: "warning",
          code: "unknown-permission-field",
          message: `role "${role}" の権限が未定義のフィールド "${field}" を参照しています。`,
          where: role,
        });
      }
      if (field !== "*") {
        const view = typeof rule.view === "boolean" ? rule.view : wildcard.view === true;
        const edit = typeof rule.edit === "boolean" ? rule.edit : wildcard.edit === true;
        if (edit && !view) {
          diagnostics.push({
            severity: "warning",
            code: "edit-without-view",
            message: `role "${role}" のフィールド "${field}" は edit=true ですが view=false です。`,
            where: role,
          });
        }
      }
    }
    if (wildcard.edit === true && wildcard.view !== true) {
      diagnostics.push({
        severity: "warning",
        code: "edit-without-view",
        message: `role "${role}" のフィールド "*" は edit=true ですが view=true ではありません。`,
        where: role,
      });
    }
    for (const event of Object.keys(access.events ?? {})) {
      if (event !== "*" && !(event in events)) {
        diagnostics.push({
          severity: "warning",
          code: "unknown-permission-event",
          message: `role "${role}" の権限が未定義のevent "${event}" を参照しています。`,
          where: role,
        });
      }
    }
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** path/query パラメータ名の集合を得る（route プレースホルダ ∪ 宣言）。 */
function paramSets(s: ScreenLike): { pathParams: Set<string>; queryParams: Set<string> } {
  const pathParams = routeParams(s.route);
  if (s.params?.path) for (const k of Object.keys(s.params.path)) pathParams.add(k);
  const queryParams = new Set<string>();
  if (s.params?.query) for (const k of Object.keys(s.params.query)) queryParams.add(k);
  return { pathParams, queryParams };
}

/** route 文字列（例 /users/{userId}/edit）からパスパラメータ名を抽出する。 */
function routeParams(route: unknown): Set<string> {
  const set = new Set<string>();
  const r = asString(route);
  if (!r) return set;
  for (const m of r.matchAll(/\{([^}]+)\}/g)) set.add(m[1]);
  return set;
}

interface RefContext {
  fieldKeys: Set<string>;
  pathParams: Set<string>;
  queryParams: Set<string>;
}

/** 参照（fields.X / screen.route.Y / screen.query.Y）が実在するか検査する。 */
function checkRefPart(ref: RefExpr, ctx: RefContext, where: string, diagnostics: Diagnostic[]): void {
  if (ref.root === "fields") {
    const f = ref.path[0];
    if (ref.path.length !== 1 || !f || !ctx.fieldKeys.has(f)) {
      diagnostics.push({
        severity: "warning",
        code: "unknown-field-ref",
        message: `"${where}" の式が未定義のフィールド "${ref.raw}" を参照しています。`,
        where,
      });
    }
  } else if (ref.root === "screen" && ref.path[0] === "route") {
    const p = ref.path[1];
    if (ref.path.length !== 2 || !p || !ctx.pathParams.has(p)) {
      diagnostics.push({
        severity: "warning",
        code: "unknown-route-param",
        message: `"${where}" の式が未定義の path パラメータ "${ref.raw}" を参照しています。`,
        where,
      });
    }
  } else if (ref.root === "screen" && ref.path[0] === "query") {
    const p = ref.path[1];
    if (ref.path.length !== 2 || !p || !ctx.queryParams.has(p)) {
      diagnostics.push({
        severity: "warning",
        code: "unknown-query-param",
        message: `"${where}" の式が未定義の query パラメータ "${ref.raw}" を参照しています。`,
        where,
      });
    }
  } else {
    diagnostics.push({
      severity: "warning",
      code: "unknown-expression-ref",
      message: `"${where}" の式 "${ref.raw}" は未対応の参照です。`,
      where,
    });
  }
}

/** テンプレート式内の参照（{fields.X} / {screen.route.Y} / {screen.query.Y}）と構文を検査する。 */
function checkExpression(expr: unknown, ctx: RefContext, where: string, diagnostics: Diagnostic[]): void {
  const s = asString(expr);
  if (!s) return;
  const { parts, errors } = parseTemplate(s);
  for (const err of errors) {
    diagnostics.push({
      severity: "warning",
      code: "expression-syntax",
      message: `"${where}" の式に構文エラー: ${err}`,
      where,
    });
  }
  for (const part of parts) {
    if (part.type === "ref") checkRefPart(part, ctx, where, diagnostics);
  }
}

/** route のプレースホルダと params.path 宣言の整合を検査する。 */
function analyzeParams(s: ScreenLike, diagnostics: Diagnostic[]): void {
  const declaredPath = s.params?.path;
  if (!declaredPath) return;
  const routePlaceholders = routeParams(s.route);
  const declaredKeys = new Set(Object.keys(declaredPath));
  for (const key of declaredKeys) {
    if (!routePlaceholders.has(key)) {
      diagnostics.push({
        severity: "warning",
        code: "path-param-not-in-route",
        message: `path パラメータ "${key}" は route に現れません。`,
        where: key,
      });
    }
  }
  for (const key of routePlaceholders) {
    if (!declaredKeys.has(key)) {
      diagnostics.push({
        severity: "warning",
        code: "undeclared-path-param",
        message: `route のプレースホルダ "{${key}}" が params.path に宣言されていません。`,
        where: key,
      });
    }
  }
}

/** フィールドのバリデーションが既知語彙かを検査する（ADR 0002）。 */
function analyzeValidations(s: ScreenLike, diagnostics: Diagnostic[]): void {
  const fields = s.fields;
  if (!fields) return;
  for (const [key, f] of Object.entries(fields)) {
    const vals = (f as { validations?: unknown }).validations;
    if (!Array.isArray(vals)) continue;
    for (const v of vals) {
      const rule = asString((v as { rule?: unknown })?.rule);
      if (rule && !isKnownRule(rule)) {
        diagnostics.push({
          severity: "warning",
          code: "unknown-validation-rule",
          message: `field "${key}" のバリデーション "${rule}" は既知の語彙ではありません（テスト自動導出の対象外）。`,
          where: key,
        });
      }
    }
  }
}

/** 各フィールドの visibleWhen 条件式を検査する。 */
function analyzeVisibility(s: ScreenLike, diagnostics: Diagnostic[]): void {
  const fields = s.fields;
  if (!fields) return;
  const { pathParams, queryParams } = paramSets(s);
  const ctx: RefContext = { fieldKeys: new Set(Object.keys(fields)), pathParams, queryParams };
  for (const [key, f] of Object.entries(fields)) {
    const vw = asString((f as { visibleWhen?: unknown }).visibleWhen);
    if (!vw) continue;
    const { errors, refs } = parseCondition(vw);
    for (const err of errors) {
      diagnostics.push({
        severity: "warning",
        code: "condition-syntax",
        message: `field "${key}" の visibleWhen 構文エラー: ${err}`,
        where: key,
      });
    }
    for (const ref of refs) checkRefPart(ref, ctx, key, diagnostics);
  }
}

/** apiBindings の request/response 式・マッピングを検査する（決定 #11）。 */
function analyzeApiExpressions(s: ScreenLike, diagnostics: Diagnostic[]): void {
  const bindings = s.apiBindings;
  if (!bindings) return;
  const fieldKeys = new Set(Object.keys(s.fields ?? {}));
  const { pathParams, queryParams } = paramSets(s);
  const ctx: RefContext = { fieldKeys, pathParams, queryParams };

  for (const [key, b] of Object.entries(bindings)) {
    for (const scope of ["path", "query", "body"] as const) {
      const entries = b.request?.[scope];
      if (entries) {
        for (const value of Object.values(entries)) {
          checkExpression(value, ctx, key, diagnostics);
        }
      }
    }
    // response.mapping のキーは画面フィールド。存在しなければ warning。
    for (const field of Object.keys(b.response?.mapping ?? {})) {
      if (!fieldKeys.has(field)) {
        diagnostics.push({
          severity: "warning",
          code: "unknown-field-in-mapping",
          message: `apiBinding "${key}" の response.mapping が未定義のフィールド "${field}" を指しています。`,
          where: key,
        });
      }
    }
  }
}

/** layout.sections のフィールド参照を検査する。 */
function analyzeLayout(s: ScreenLike, diagnostics: Diagnostic[]): void {
  const sections = s.layout?.sections;
  if (!Array.isArray(sections)) return;
  const fieldKeys = new Set(Object.keys(s.fields ?? {}));
  const placed = new Set<string>();

  sections.forEach((section, i) => {
    const where = asString(section.id) ?? `section[${i}]`;
    const fields = Array.isArray(section.fields) ? section.fields : [];
    for (const fk of fields) {
      const key = asString(fk);
      if (key === undefined) continue;
      placed.add(key);
      if (!fieldKeys.has(key)) {
        diagnostics.push({
          severity: "warning",
          code: "unknown-field-in-layout",
          message: `layout の section "${where}" が未定義のフィールド "${key}" を配置しています。`,
          where,
        });
      }
    }
  });

  // layout がある場合、どのセクションにも配置されていないフィールドを warning
  for (const key of fieldKeys) {
    if (!placed.has(key)) {
      diagnostics.push({
        severity: "warning",
        code: "field-not-in-layout",
        message: `フィールド "${key}" は layout のどのセクションにも配置されていません。`,
        where: key,
      });
    }
  }
}

/** 状態機械（states/events）を解析する（決定 #10・案C）。 */
function analyzeStateMachine(s: ScreenLike, diagnostics: Diagnostic[]): void {
  const states = s.states;
  const events = s.events ?? {};

  if (!states || typeof states !== "object") {
    if (Object.keys(events).length > 0) {
      diagnostics.push({
        severity: "error",
        code: "events-without-states",
        message: "events が定義されていますが states がありません。",
      });
    }
    return;
  }

  const stateKeys = new Set(Object.keys(states));
  const bindingKeys = new Set(Object.keys(s.apiBindings ?? {}));
  const fieldKeys = new Set(Object.keys(s.fields ?? {}));
  const { pathParams, queryParams } = paramSets(s);
  const exprContext: RefContext = { fieldKeys, pathParams, queryParams };

  const initials = Object.entries(states)
    .filter(([, v]) => v && typeof v === "object" && v.initial === true)
    .map(([k]) => k);
  if (initials.length === 0) {
    diagnostics.push({
      severity: "warning",
      code: "no-initial-state",
      message: "初期状態（initial: true）が指定されていません。",
    });
  } else if (initials.length > 1) {
    diagnostics.push({
      severity: "warning",
      code: "multiple-initial-states",
      message: `初期状態が複数あります: ${initials.join(", ")}`,
    });
  }

  const edges: Array<[string, string]> = [];
  const checkRef = (key: string, field: string, value: unknown): string | undefined => {
    const name = asString(value);
    if (name === undefined) return undefined;
    if (!stateKeys.has(name)) {
      diagnostics.push({
        severity: "error",
        code: "undefined-state-ref",
        message: `event "${key}" の ${field} が未定義の状態 "${name}" を参照しています。`,
        where: key,
      });
      return undefined;
    }
    return name;
  };

  const checkExpects = (
    key: string,
    field: string,
    expects: ExpectationLike | undefined,
    outcomeTo: string | undefined,
    outcomeNavigate?: string,
  ): void => {
    if (!expects) return;
    const expectedState = asString(expects.state);
    if (expectedState !== undefined) {
      checkRef(key, `${field}.state`, expectedState);
      if (outcomeTo !== undefined && expectedState !== outcomeTo) {
        diagnostics.push({
          severity: "error",
          code: "expectation-state-mismatch",
          message: `event "${key}" の ${field}.state "${expectedState}" が遷移先 "${outcomeTo}" と一致しません。`,
          where: key,
        });
      }
    }
    const expectedNavigate = asString(expects.navigate);
    if (expectedNavigate !== undefined && outcomeNavigate !== undefined && expectedNavigate !== outcomeNavigate) {
      diagnostics.push({
        severity: "error",
        code: "expectation-navigate-mismatch",
        message: `event "${key}" の ${field}.navigate "${expectedNavigate}" が遷移先 "${outcomeNavigate}" と一致しません。`,
        where: key,
      });
    }
    for (const [fieldKey, expected] of Object.entries(expects.fields ?? {})) {
      if (!fieldKeys.has(fieldKey)) {
        diagnostics.push({
          severity: "warning",
          code: "unknown-expected-field",
          message: `event "${key}" の ${field}.fields が未定義のフィールド "${fieldKey}" を参照しています。`,
          where: key,
        });
      }
      checkExpression(expected.expression, exprContext, `${key}.${field}.fields.${fieldKey}`, diagnostics);
    }
  };

  for (const [key, ev] of Object.entries(events)) {
    const from = checkRef(key, "from", ev.from);
    const to = checkRef(key, "to", ev.to);
    const onSuccess = checkRef(key, "onSuccess.to", ev.onSuccess?.to);
    const onError = checkRef(key, "onError.to", ev.onError?.to);
    if (from && to) edges.push([from, to]);
    if (to && onSuccess) edges.push([to, onSuccess]);
    if (to && onError) edges.push([to, onError]);
    checkExpects(key, "expects", ev.expects, to);
    checkExpects(key, "onSuccess.expects", ev.onSuccess?.expects, onSuccess, asString(ev.onSuccess?.navigate));
    checkExpects(key, "onError.expects", ev.onError?.expects, onError);

    const seenErrorCases = new Set<string>();
    for (const [index, errorCase] of (ev.onError?.cases ?? []).entries()) {
      const caseTo = checkRef(key, `onError.cases[${index}].to`, errorCase.to);
      if (to && caseTo) edges.push([to, caseTo]);
      checkExpects(key, `onError.cases[${index}].expects`, errorCase.expects, caseTo);
      const status = typeof errorCase.when?.status === "number" ? errorCase.when.status : "*";
      const code = asString(errorCase.when?.code) ?? "*";
      const signature = `${status}:${code}`;
      if (seenErrorCases.has(signature)) {
        diagnostics.push({
          severity: "warning",
          code: "duplicate-error-case",
          message: `event "${key}" の onError.cases に重複条件 status=${status}, code=${code} があります。`,
          where: key,
        });
      }
      seenErrorCases.add(signature);
    }

    const apiCall = asString(ev.action?.apiCall);
    if (apiCall !== undefined && !bindingKeys.has(apiCall)) {
      diagnostics.push({
        severity: "warning",
        code: "undefined-api-binding",
        message: `event "${key}" の action.apiCall が未定義の apiBinding "${apiCall}" を参照しています。`,
        where: key,
      });
    }
  }

  if (initials.length >= 1) {
    const adjacency = new Map<string, string[]>();
    for (const [a, b] of edges) {
      const list = adjacency.get(a) ?? [];
      list.push(b);
      adjacency.set(a, list);
    }
    const reached = new Set<string>(initials);
    const queue = [...initials];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const next of adjacency.get(cur) ?? []) {
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    for (const key of stateKeys) {
      if (!reached.has(key)) {
        diagnostics.push({
          severity: "warning",
          code: "unreachable-state",
          message: `状態 "${key}" は初期状態から到達できません。`,
          where: key,
        });
      }
    }
  }
}

/**
 * 解決済み screen オブジェクトを解析し、診断を返す。
 * states / apiBindings が無い部分はそれぞれスキップする。
 */
export function analyzeScreen(screen: unknown): Diagnostic[] {
  if (screen === null || typeof screen !== "object") return [];
  const s = screen as ScreenLike;
  const diagnostics: Diagnostic[] = [];
  analyzeParams(s, diagnostics);
  analyzeLayout(s, diagnostics);
  analyzeValidations(s, diagnostics);
  analyzeVisibility(s, diagnostics);
  analyzeApiExpressions(s, diagnostics);
  analyzeAccessControl(s, diagnostics);
  analyzeStateMachine(s, diagnostics);
  return diagnostics;
}

interface ProjectScreenLike {
  transitions?: Record<string, { to?: unknown }>;
  events?: Record<string, { onSuccess?: { navigate?: unknown } }>;
}

/** プロジェクト（複数画面）の横断解析入力。 */
export interface ProjectScreen {
  id: string;
  /** 解決済み screen オブジェクト */
  screen: unknown;
}

/**
 * 複数画面をまたいだ参照を検査する。
 * transition.to / event.onSuccess.navigate が未知の画面 id を指す場合は warning。
 */
export function analyzeProject(screens: ProjectScreen[]): Diagnostic[] {
  const ids = new Set(screens.map((s) => s.id));
  const diagnostics: Diagnostic[] = [];
  for (const { id, screen } of screens) {
    if (screen === null || typeof screen !== "object") continue;
    const s = screen as ProjectScreenLike;
    for (const [key, t] of Object.entries(s.transitions ?? {})) {
      const to = asString(t.to);
      if (to && !ids.has(to)) {
        diagnostics.push({
          severity: "warning",
          code: "unknown-screen-ref",
          message: `画面 "${id}" の transition "${key}" が未知の画面 "${to}" を参照しています。`,
          where: id,
        });
      }
    }
    for (const [key, ev] of Object.entries(s.events ?? {})) {
      const nav = asString(ev.onSuccess?.navigate);
      if (nav && !ids.has(nav)) {
        diagnostics.push({
          severity: "warning",
          code: "unknown-screen-ref",
          message: `画面 "${id}" の event "${key}" の navigate が未知の画面 "${nav}" を参照しています。`,
          where: id,
        });
      }
    }
  }
  return diagnostics;
}
