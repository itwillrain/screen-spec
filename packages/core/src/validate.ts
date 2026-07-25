import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";
import * as ajvFormats from "ajv-formats";
// スキーマは JSON import でインライン化する。fs 相対パスに依存しないため、
// core を別アプリ（Viewer 等）へバンドルしても壊れない。
import schema from "../../../schema/screen.schema.json" with { type: "json" };
import { parseYaml } from "./parse.js";
import { findResidualRefs, resolveRefs, RefError, type DocumentLoader } from "./resolve.js";
import { analyzeScreen, analyzeTestData } from "./analyze.js";

// ESM/CJS 相互運用: 実行環境差を吸収して呼び出し可能な関数を得る。
type AddFormatsFn = (ajv: unknown, opts?: unknown) => unknown;
const addFormats = ((ajvFormats as unknown as { default?: AddFormatsFn }).default ??
  (ajvFormats as unknown as AddFormatsFn)) as AddFormatsFn;

/** 検証の段（決定 #7: raw → 解決 → resolved の2段 ＋ 意味解析 analyze ＋ openapi 参照）。 */
export type ValidationStage = "raw" | "resolve" | "resolved" | "analyze" | "openapi";

export interface ValidationIssue {
  stage: ValidationStage;
  path: string;
  message: string;
}

export interface ValidateResult {
  valid: boolean;
  issues: ValidationIssue[];
  /** 致命ではない指摘（案C: 到達不能・initial 未指定など）。 */
  warnings: ValidationIssue[];
}

let cachedValidate: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (cachedValidate) return cachedValidate;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  cachedValidate = ajv.compile(schema);
  return cachedValidate;
}

function toIssues(errors: ErrorObject[] | null | undefined, stage: ValidationStage): ValidationIssue[] {
  if (!errors || errors.length === 0) {
    return [{ stage, path: "/", message: "schema validation failed" }];
  }
  return errors.map((e) => ({
    stage,
    path: e.instancePath || "/",
    message: `${e.instancePath || "/"} ${e.message ?? "is invalid"}`.trim(),
  }));
}

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"];

/** OpenAPI ドキュメントから operationId の集合を収集する。 */
function collectOperationIds(openapi: unknown): Set<string> {
  const ids = new Set<string>();
  const paths = (openapi as { paths?: unknown } | null)?.paths;
  if (paths && typeof paths === "object") {
    for (const item of Object.values(paths as Record<string, unknown>)) {
      if (item && typeof item === "object") {
        for (const method of HTTP_METHODS) {
          const op = (item as Record<string, unknown>)[method];
          const opId = (op as { operationId?: unknown } | undefined)?.operationId;
          if (typeof opId === "string") ids.add(opId);
        }
      }
    }
  }
  return ids;
}

/** apiBindings の specRef を解決し、operationId の存在を検証する（決定 #11・warning）。 */
async function checkOpenApiRefs(
  screen: unknown,
  entryUri: string,
  load: DocumentLoader,
): Promise<ValidationIssue[]> {
  const bindings = (screen as { apiBindings?: Record<string, unknown> } | null)?.apiBindings;
  if (!bindings || typeof bindings !== "object") return [];

  const warnings: ValidationIssue[] = [];
  const opIdCache = new Map<string, Set<string> | null>(); // null = 取得失敗

  for (const [key, binding] of Object.entries(bindings)) {
    const openapi = (binding as { openapi?: { operationId?: unknown; specRef?: unknown } }).openapi;
    const specRef = typeof openapi?.specRef === "string" ? openapi.specRef : undefined;
    const operationId = typeof openapi?.operationId === "string" ? openapi.operationId : undefined;
    if (!specRef || !operationId) continue;

    const targetUri = new URL(specRef, entryUri).href;
    if (!opIdCache.has(targetUri)) {
      try {
        const text = await load(targetUri);
        opIdCache.set(targetUri, collectOperationIds(parseYaml(text)));
      } catch {
        opIdCache.set(targetUri, null);
      }
    }
    const ids = opIdCache.get(targetUri);
    if (ids === null) {
      warnings.push({
        stage: "openapi",
        path: `/screen/apiBindings/${key}`,
        message: `apiBinding "${key}" の specRef を取得できません: ${specRef}`,
      });
    } else if (ids && !ids.has(operationId)) {
      warnings.push({
        stage: "openapi",
        path: `/screen/apiBindings/${key}`,
        message: `apiBinding "${key}" の operationId "${operationId}" が ${specRef} に見つかりません。`,
      });
    }
  }
  return warnings;
}

/**
 * screen-spec ドキュメントを2段で検証する（環境非依存）。
 *  1. raw: パース直後の文書をスキーマ検証（$ref は純粋参照として許容）
 *  2. resolve: 全 $ref を解決（純粋性・ローカル相対・循環などを担保）
 *  3. resolved: 解決済み正規化文書を同スキーマで再検証（参照先の型ミスマッチを検出）
 *
 * @param rawText エントリドキュメントのテキスト
 * @param entryUri エントリの絶対 URI（相対 $ref の基準）
 * @param load URI からドキュメント本文を取得するローダー（Node=fs / ブラウザ=fetch）
 */
export async function validateSpec(
  rawText: string,
  entryUri: string,
  load: DocumentLoader,
): Promise<ValidateResult> {
  const validate = getValidator();

  let raw: unknown;
  try {
    raw = parseYaml(rawText);
  } catch (e) {
    return {
      valid: false,
      warnings: [],
      issues: [{ stage: "raw", path: "/", message: `YAML parse error: ${(e as Error).message}` }],
    };
  }

  // 段1: raw
  if (!validate(raw)) {
    return { valid: false, warnings: [], issues: toIssues(validate.errors, "raw") };
  }

  // 段2: 解決
  let resolved: unknown;
  try {
    resolved = await resolveRefs(raw, entryUri, load);
  } catch (e) {
    if (e instanceof RefError) {
      return { valid: false, warnings: [], issues: [{ stage: "resolve", path: "/", message: e.message }] };
    }
    throw e;
  }

  const residual = findResidualRefs(resolved);
  if (residual.length > 0) {
    return {
      valid: false,
      warnings: [],
      issues: residual.map((p) => ({ stage: "resolve", path: p, message: `Unresolved $ref remains at ${p}` })),
    };
  }

  // 段3: resolved
  if (!validate(resolved)) {
    return { valid: false, warnings: [], issues: toIssues(validate.errors, "resolved") };
  }

  // 段4: 意味解析（状態機械・式・案C／testData）
  const screen = (resolved as { screen?: unknown } | null)?.screen;
  const testData = (resolved as { testData?: unknown } | null)?.testData;
  const diagnostics =
    screen !== undefined
      ? analyzeScreen(screen)
      : testData !== undefined
        ? analyzeTestData(testData)
        : [];
  const issues: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const scope = screen !== undefined ? "/screen" : "/testData";
  for (const d of diagnostics) {
    const item: ValidationIssue = { stage: "analyze", path: d.where ? `${scope}/${d.where}` : scope, message: d.message };
    if (d.severity === "error") issues.push(item);
    else warnings.push(item);
  }

  // 段5: OpenAPI 参照（specRef の operationId 検証）
  if (screen !== undefined) {
    warnings.push(...(await checkOpenApiRefs(screen, entryUri, load)));
  }

  return { valid: issues.length === 0, issues, warnings };
}
