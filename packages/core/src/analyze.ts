// 状態機械（states/events）と API 連携式（apiBindings）の意味解析。
//  - 未定義の状態参照は error（構造的な誤り）
//  - initial の 0 個 / 複数、到達不能な状態、未定義参照（apiBinding / フィールド / route）は warning
// JSON Schema では表現できないクロス参照・到達性を補完する（決定 #10 / #11）。

import { parseTemplate } from "./expr.js";

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  /** 関連する状態/イベント/バインディングのキー（任意） */
  where?: string;
}

interface EventLike {
  from?: unknown;
  to?: unknown;
  action?: { apiCall?: unknown };
  onSuccess?: { to?: unknown };
  onError?: { to?: unknown };
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
  fields?: Record<string, unknown>;
  layout?: LayoutLike;
  states?: Record<string, { initial?: unknown }>;
  events?: Record<string, EventLike>;
  apiBindings?: Record<string, ApiBindingLike>;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/** route 文字列（例 /users/{userId}/edit）からパスパラメータ名を抽出する。 */
function routeParams(route: unknown): Set<string> {
  const set = new Set<string>();
  const r = asString(route);
  if (!r) return set;
  for (const m of r.matchAll(/\{([^}]+)\}/g)) set.add(m[1]);
  return set;
}

/** テンプレート式内の参照（{fields.X} / {screen.route.Y}）と構文を検査する。 */
function checkExpression(
  expr: unknown,
  fieldKeys: Set<string>,
  params: Set<string>,
  where: string,
  diagnostics: Diagnostic[],
): void {
  const s = asString(expr);
  if (!s) return;
  const { parts, errors } = parseTemplate(s);

  for (const err of errors) {
    diagnostics.push({
      severity: "warning",
      code: "expression-syntax",
      message: `apiBinding "${where}" の式に構文エラー: ${err}`,
      where,
    });
  }

  for (const part of parts) {
    if (part.type !== "ref") continue;
    if (part.root === "fields") {
      const f = part.path[0];
      if (part.path.length !== 1 || !f || !fieldKeys.has(f)) {
        diagnostics.push({
          severity: "warning",
          code: "unknown-field-ref",
          message: `apiBinding "${where}" の式が未定義のフィールド "{${part.raw}}" を参照しています。`,
          where,
        });
      }
    } else if (part.root === "screen" && part.path[0] === "route") {
      const p = part.path[1];
      if (part.path.length !== 2 || !p || !params.has(p)) {
        diagnostics.push({
          severity: "warning",
          code: "unknown-route-param",
          message: `apiBinding "${where}" の式が route に無いパラメータ "{${part.raw}}" を参照しています。`,
          where,
        });
      }
    } else {
      diagnostics.push({
        severity: "warning",
        code: "unknown-expression-ref",
        message: `apiBinding "${where}" の式 "{${part.raw}}" は未対応の参照です。`,
        where,
      });
    }
  }
}

/** apiBindings の request/response 式・マッピングを検査する（決定 #11）。 */
function analyzeApiExpressions(s: ScreenLike, diagnostics: Diagnostic[]): void {
  const bindings = s.apiBindings;
  if (!bindings) return;
  const fieldKeys = new Set(Object.keys(s.fields ?? {}));
  const params = routeParams(s.route);

  for (const [key, b] of Object.entries(bindings)) {
    for (const scope of ["path", "query", "body"] as const) {
      const entries = b.request?.[scope];
      if (entries) {
        for (const value of Object.values(entries)) {
          checkExpression(value, fieldKeys, params, key, diagnostics);
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

  for (const [key, ev] of Object.entries(events)) {
    const from = checkRef(key, "from", ev.from);
    const to = checkRef(key, "to", ev.to);
    const onSuccess = checkRef(key, "onSuccess.to", ev.onSuccess?.to);
    const onError = checkRef(key, "onError.to", ev.onError?.to);
    if (from && to) edges.push([from, to]);
    if (to && onSuccess) edges.push([to, onSuccess]);
    if (to && onError) edges.push([to, onError]);

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
  analyzeLayout(s, diagnostics);
  analyzeApiExpressions(s, diagnostics);
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
