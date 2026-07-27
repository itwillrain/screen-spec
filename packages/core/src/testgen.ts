// テスト項目書の自動導出（ADR 0002 の目的）。
// 形式化された情報（バリデーション語彙・期待結果・権限・パラメータ・状態遷移）から
// テスト項目を機械的に導出する。解決済み screen オブジェクトを入力に取る。

export type TestCategory =
  | "validation"
  | "required"
  | "visibility"
  | "enablement"
  | "transition"
  | "permission"
  | "param"
  | "fixture";

export interface TestItem {
  id: string;
  category: TestCategory;
  target: string;
  title: string;
  expected: string;
  fixtureId?: string;
  params?: Record<string, unknown>;
  given?: Record<string, unknown>;
  expectedFields?: Record<string, unknown>;
}

const TEST_ITEM_COLUMNS = [
  "id", "category", "target", "title", "fixtureId", "params", "given", "expected", "expectedFields",
] as const;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
  );
}

function cellValue(item: TestItem, column: typeof TEST_ITEM_COLUMNS[number]): string {
  const value = item[column];
  if (value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(stableValue(value)) : String(value);
}

function markdownCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** テスト項目をGitHub Flavored Markdownの表へ変換する。 */
export function testItemsToMarkdown(items: readonly TestItem[]): string {
  const header = `| ${TEST_ITEM_COLUMNS.join(" | ")} |`;
  const separator = `| ${TEST_ITEM_COLUMNS.map(() => "---").join(" | ")} |`;
  const rows = items.map((item) =>
    `| ${TEST_ITEM_COLUMNS.map((column) => markdownCell(cellValue(item, column))).join(" | ")} |`
  );
  return [header, separator, ...rows].join("\n") + "\n";
}

/** テスト項目をRFC 4180互換のCSVへ変換する。 */
export function testItemsToCsv(items: readonly TestItem[]): string {
  const rows = [
    TEST_ITEM_COLUMNS.join(","),
    ...items.map((item) => TEST_ITEM_COLUMNS.map((column) => csvCell(cellValue(item, column))).join(",")),
  ];
  return rows.join("\r\n") + "\r\n";
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function expectationText(value: unknown): string[] {
  if (!isObject(value)) return [];
  const parts: string[] = [];
  const state = asString(value.state);
  const navigate = asString(value.navigate);
  if (state) parts.push(`state=${state}`);
  if (navigate) parts.push(`画面 ${navigate} へ遷移`);
  if (isObject(value.message)) {
    const kind = asString(value.message.kind);
    const text = asString(value.message.text);
    const key = asString(value.message.key);
    parts.push(`message=${[kind, text ?? key].filter(Boolean).join(":")}`);
  }
  if (isObject(value.fields)) {
    for (const [field, expected] of Object.entries(value.fields)) {
      if (!isObject(expected)) continue;
      if (expected.value !== undefined) parts.push(`${field}=${JSON.stringify(expected.value)}`);
      const expression = asString(expected.expression);
      if (expression) parts.push(`${field}=${expression}`);
      if (typeof expected.visible === "boolean") parts.push(`${field}.visible=${expected.visible}`);
      if (typeof expected.enabled === "boolean") parts.push(`${field}.enabled=${expected.enabled}`);
    }
  }
  return parts;
}

interface FieldLike {
  label?: unknown;
  required?: unknown;
  visibleWhen?: unknown;
  enabledWhen?: unknown;
  options?: unknown;
  validations?: unknown;
}

/** 1 フィールドのバリデーションからテスト項目を導出。 */
function fieldValidationItems(key: string, field: FieldLike): TestItem[] {
  const items: TestItem[] = [];
  const push = (suffix: string, title: string, expected: string) =>
    items.push({ id: `field.${key}.${suffix}`, category: "validation", target: key, title, expected });

  const vals = Array.isArray(field.validations) ? field.validations : [];
  for (const v of vals) {
    if (!isObject(v)) continue;
    const rule = asString(v.rule);
    if (!rule) continue;
    const n = asNumber(v.value);
    switch (rule) {
      case "required":
        push("required.empty", `${key}: 空値`, "required エラーになる");
        push("required.filled", `${key}: 値あり`, "required を通過する");
        break;
      case "maxLength":
        if (n !== undefined) {
          push("maxLength.boundary", `${key}: ${n}文字`, "受理される（境界）");
          push("maxLength.over", `${key}: ${n + 1}文字`, "maxLength エラーになる");
        }
        break;
      case "minLength":
        if (n !== undefined) {
          push("minLength.boundary", `${key}: ${n}文字`, "受理される（境界）");
          if (n > 0) push("minLength.under", `${key}: ${n - 1}文字`, "minLength エラーになる");
        }
        break;
      case "min":
        if (n !== undefined) {
          push("min.boundary", `${key}: ${n}`, "受理される（境界）");
          push("min.under", `${key}: ${n - 1}`, "min エラーになる");
        }
        break;
      case "max":
        if (n !== undefined) {
          push("max.boundary", `${key}: ${n}`, "受理される（境界）");
          push("max.over", `${key}: ${n + 1}`, "max エラーになる");
        }
        break;
      case "pattern":
        push("pattern.match", `${key}: パターンに一致する値`, "受理される");
        push("pattern.nomatch", `${key}: パターンに一致しない値`, "pattern エラーになる");
        break;
      case "email":
      case "url":
        push(`${rule}.valid`, `${key}: 正しい${rule}形式`, "受理される");
        push(`${rule}.invalid`, `${key}: 不正な${rule}形式`, `${rule} エラーになる`);
        break;
      case "enum": {
        const allowed = Array.isArray(v.value) ? v.value : [];
        const sample = allowed.length > 0 ? String(allowed[0]) : "許可値";
        push("enum.allowed", `${key}: 許可値（${sample}）`, "受理される");
        push("enum.disallowed", `${key}: 許可外の値`, "enum エラーになる");
        break;
      }
      default:
        // 未知ルールは境界が不明なため導出しない
        break;
    }
  }
  return items;
}

/** 解決済み screen からテスト項目を導出する。 */
export function generateTestItems(screen: unknown, testData?: unknown): TestItem[] {
  if (!isObject(screen)) return [];
  const items: TestItem[] = [];
  const fields = isObject(screen.fields) ? screen.fields : {};
  const events = isObject(screen.events) ? screen.events : {};

  // フィールド：required / バリデーション境界 / 表示・編集条件
  for (const [key, raw] of Object.entries(fields)) {
    if (!isObject(raw)) continue;
    const field = raw as FieldLike;
    if (field.required === true) {
      items.push({
        id: `field.${key}.required`,
        category: "required",
        target: key,
        title: `${key}: 未入力で送信`,
        expected: "必須エラーになる",
      });
    }
    items.push(...fieldValidationItems(key, field));
    const vw = asString(field.visibleWhen);
    if (vw) {
      items.push({ id: `field.${key}.visible.true`, category: "visibility", target: key, title: `${key}: 条件 [${vw}] が真`, expected: "表示される" });
      items.push({ id: `field.${key}.visible.false`, category: "visibility", target: key, title: `${key}: 条件 [${vw}] が偽`, expected: "非表示になる" });
    }
    const ew = asString(field.enabledWhen);
    if (ew) {
      items.push({ id: `field.${key}.enabled.true`, category: "enablement", target: key, title: `${key}: 条件 [${ew}] が真`, expected: "編集可能" });
      items.push({ id: `field.${key}.enabled.false`, category: "enablement", target: key, title: `${key}: 条件 [${ew}] が偽`, expected: "編集不可" });
    }
  }

  // 状態遷移：event ごとの遷移・成功/失敗・エラー条件
  for (const [key, ev] of Object.entries(events)) {
    if (!isObject(ev)) continue;
    const from = asString(ev.from);
    const to = asString(ev.to);
    const trigger = asString(ev.trigger) ?? key;
    const branches = Array.isArray(ev.branches) ? ev.branches : [];
    branches.forEach((branch, index) => {
      if (!isObject(branch)) return;
      const branchId = asString(branch.id) ?? String(index + 1);
      const branchTo = asString(branch.to);
      const when = asString(branch.when);
      const otherwise = branch.otherwise === true;
      const expects = expectationText(branch.expects);
      const prior = index > 0 ? "先行分岐はすべて偽 / " : "";
      items.push({
        id: `event.${key}.branch.${branchId}`,
        category: "transition",
        target: key,
        title: `state=${from ?? "?"} で ${trigger}: ${prior}${otherwise ? "otherwise" : `[${when ?? "?"}] が真`}`,
        expected: expects.length > 0 ? expects.join(" / ") : `state=${branchTo ?? "?"} へ遷移する`,
      });
    });
    if (branches.length > 0 && !branches.some((branch) => isObject(branch) && branch.otherwise === true)) {
      items.push({
        id: `event.${key}.noMatch`,
        category: "transition",
        target: key,
        title: `state=${from ?? "?"} で ${trigger}: すべての分岐条件が偽`,
        expected: "状態遷移なし / API呼び出しなし / 副作用なし",
      });
    }
    if (from && to) {
      const expects = expectationText(ev.expects);
      items.push({
        id: `event.${key}.transition`,
        category: "transition",
        target: key,
        title: `state=${from} で ${trigger}`,
        expected: expects.length > 0 ? expects.join(" / ") : `state=${to} へ遷移する`,
      });
    }
    const onSuccess = isObject(ev.onSuccess) ? ev.onSuccess : undefined;
    if (onSuccess) {
      const st = asString(onSuccess.to);
      const nav = asString(onSuccess.navigate);
      const expects = expectationText(onSuccess.expects);
      items.push({
        id: `event.${key}.success`,
        category: "transition",
        target: key,
        title: `${key}: 成功時`,
        expected: expects.length > 0
          ? expects.join(" / ")
          : [st ? `state=${st}` : null, nav ? `画面 ${nav} へ遷移` : null].filter(Boolean).join(" / ") || "成功処理",
      });
    }
    const onError = isObject(ev.onError) ? ev.onError : undefined;
    if (onError) {
      const st = asString(onError.to);
      const defaultExpects = expectationText(onError.expects);
      if (st || defaultExpects.length > 0) items.push({
        id: `event.${key}.error.default`,
        category: "transition",
        target: key,
        title: `${key}: 既定エラー`,
        expected: defaultExpects.length > 0 ? defaultExpects.join(" / ") : `state=${st}`,
      });
      const cases = Array.isArray(onError.cases) ? onError.cases : [];
      cases.forEach((c, i) => {
        if (!isObject(c)) return;
        const when = isObject(c.when) ? c.when : {};
        const status = asNumber(when.status);
        const code = asString(when.code);
        const cond = [status !== undefined ? `HTTP ${status}` : null, code ? `code=${code}` : null].filter(Boolean).join(" / ");
        const expects = expectationText(c.expects);
        items.push({
          id: `event.${key}.error.case${i}`,
          category: "transition",
          target: key,
          title: `${key}: エラー条件 ${cond || "*"}`,
          expected: expects.length > 0 ? expects.join(" / ") : asString(c.to) ? `state=${asString(c.to)}` : "エラー処理",
        });
      });
    }
  }

  // 権限（accessControl）：role × screen/field/event
  const roles = isObject(screen.accessControl) && isObject(screen.accessControl.roles) ? screen.accessControl.roles : undefined;
  if (roles) {
    const eff = (map: unknown, k: string, prop: string): boolean | undefined => {
      const m = isObject(map) ? map : {};
      const specific = isObject(m[k]) ? (m[k] as Record<string, unknown>)[prop] : undefined;
      if (typeof specific === "boolean") return specific;
      const wild = isObject(m["*"]) ? (m["*"] as Record<string, unknown>)[prop] : undefined;
      return typeof wild === "boolean" ? wild : undefined;
    };
    for (const [role, ac] of Object.entries(roles)) {
      if (!isObject(ac)) continue;
      const sv = isObject(ac.screen) ? ac.screen.view : undefined;
      if (typeof sv === "boolean") {
        items.push({ id: `access.${role}.screen`, category: "permission", target: role, title: `role=${role}: 画面アクセス`, expected: sv ? "閲覧できる" : "閲覧できない（拒否）" });
      }
      for (const key of Object.keys(fields)) {
        const view = eff(ac.fields, key, "view");
        const edit = eff(ac.fields, key, "edit");
        if (view !== undefined || edit !== undefined) {
          items.push({
            id: `access.${role}.field.${key}`,
            category: "permission",
            target: role,
            title: `role=${role}: フィールド ${key}`,
            expected: `表示=${view ? "可" : "不可"} / 編集=${edit ? "可" : "不可"}`,
          });
        }
      }
      for (const key of Object.keys(events)) {
        const exec = eff(ac.events, key, "execute");
        if (exec !== undefined) {
          items.push({ id: `access.${role}.event.${key}`, category: "permission", target: role, title: `role=${role}: event ${key}`, expected: exec ? "実行可" : "実行不可" });
        }
      }
    }
  }

  // パラメータ（path/query）
  const params = isObject(screen.params) ? screen.params : undefined;
  if (params) {
    for (const kind of ["path", "query"] as const) {
      const map = isObject(params[kind]) ? params[kind] : undefined;
      if (!isObject(map)) continue;
      for (const [name, p] of Object.entries(map)) {
        if (!isObject(p)) continue;
        if (p.required === true) {
          items.push({ id: `param.${kind}.${name}.required`, category: "param", target: name, title: `${kind} ${name}: 欠如`, expected: "必須エラーになる" });
        }
        if (Array.isArray(p.enum)) {
          items.push({ id: `param.${kind}.${name}.enum`, category: "param", target: name, title: `${kind} ${name}: enum 外の値`, expected: "不正値として扱われる" });
        }
        if (p.default !== undefined) {
          items.push({ id: `param.${kind}.${name}.default`, category: "param", target: name, title: `${kind} ${name}: 未指定`, expected: `既定値 ${String(p.default)} が使われる` });
        }
      }
    }
  }

  // testData：フィクスチャごとの前提パラメータ・データと初期表示期待値
  if (isObject(testData)) {
    const targetScreen = asString(testData.screen);
    const screenId = asString(screen.id);
    const fixtures = Array.isArray(testData.fixtures) ? testData.fixtures : [];
    if (targetScreen === undefined || screenId === undefined || targetScreen === screenId) {
      for (const raw of fixtures) {
        if (!isObject(raw)) continue;
        const fixtureId = asString(raw.id);
        if (!fixtureId) continue;
        const params = isObject(raw.params) ? raw.params : undefined;
        const given = isObject(raw.given) ? raw.given : undefined;
        const expected = isObject(raw.expected) ? raw.expected : undefined;
        const expectedFields = expected && isObject(expected.fields) ? expected.fields : undefined;
        const fieldText = expectedFields
          ? Object.entries(expectedFields).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(" / ")
          : "初期表示を確認する";
        items.push({
          id: `fixture.${fixtureId}.initial`,
          category: "fixture",
          target: fixtureId,
          title: asString(raw.description) ?? `fixture=${fixtureId}: 初期表示`,
          expected: fieldText,
          fixtureId,
          params,
          given,
          expectedFields,
        });
      }
    }
  }

  return items;
}
