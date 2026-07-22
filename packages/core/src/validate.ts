import { readFileSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv/dist/2020.js";
import * as ajvFormats from "ajv-formats";

// ESM/CJS 相互運用: 実行環境（tsx / node ESM）差を吸収して呼び出し可能な関数を得る。
type AddFormatsFn = (ajv: unknown, opts?: unknown) => unknown;
const addFormats = ((ajvFormats as unknown as { default?: AddFormatsFn }).default ??
  (ajvFormats as unknown as AddFormatsFn)) as AddFormatsFn;
import { parseYaml } from "./parse.js";
import { findResidualRefs, resolveRefs, RefError } from "./resolve.js";

/** 検証の段（決定 #7: raw → 解決 → resolved の2段構え）。 */
export type ValidationStage = "raw" | "resolve" | "resolved";

export interface ValidationIssue {
  stage: ValidationStage;
  path: string;
  message: string;
}

export interface ValidateResult {
  valid: boolean;
  issues: ValidationIssue[];
}

const here = dirname(fileURLToPath(import.meta.url));
// packages/core/src → リポジトリルート/schema
const SCHEMA_PATH = resolvePath(here, "../../../schema/screen.schema.json");

let cachedValidate: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (cachedValidate) return cachedValidate;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
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

/**
 * screen-spec ドキュメントを2段で検証する。
 *  1. raw: パース直後の文書をスキーマ検証（$ref は純粋参照として許容）
 *  2. resolve: 全 $ref を解決（純粋性・ローカル相対・循環などを担保）
 *  3. resolved: 解決済み正規化文書を同スキーマで再検証（参照先の型ミスマッチを検出）
 */
export function validateDocument(filePath: string): ValidateResult {
  const validate = getValidator();

  let text: string;
  try {
    text = readFileSync(filePath, "utf8");
  } catch {
    return { valid: false, issues: [{ stage: "raw", path: "/", message: `File not found: ${filePath}` }] };
  }

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (e) {
    return { valid: false, issues: [{ stage: "raw", path: "/", message: `YAML parse error: ${(e as Error).message}` }] };
  }

  // 段1: raw
  if (!validate(raw)) {
    return { valid: false, issues: toIssues(validate.errors, "raw") };
  }

  // 段2: 解決
  let resolved: unknown;
  try {
    resolved = resolveRefs(raw, filePath);
  } catch (e) {
    if (e instanceof RefError) {
      return { valid: false, issues: [{ stage: "resolve", path: "/", message: e.message }] };
    }
    throw e;
  }

  const residual = findResidualRefs(resolved);
  if (residual.length > 0) {
    return {
      valid: false,
      issues: residual.map((p) => ({ stage: "resolve", path: p, message: `Unresolved $ref remains at ${p}` })),
    };
  }

  // 段3: resolved
  if (!validate(resolved)) {
    return { valid: false, issues: toIssues(validate.errors, "resolved") };
  }

  return { valid: true, issues: [] };
}
