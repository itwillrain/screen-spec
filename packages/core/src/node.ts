// Node 専用エントリ（@screen-spec/core/node）。
// node:fs に依存するため、ブラウザ向けの主エントリ（./index）からは export しない。
import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseYaml } from "./parse.js";
import { resolveRefs, type DocumentLoader } from "./resolve.js";
import { validateSpec, type ValidateResult } from "./validate.js";

/** file:// URI からローカルファイルを読むローダー。 */
export const nodeFileLoader: DocumentLoader = (uri) => readFileSync(fileURLToPath(uri), "utf8");

/** ローカルパスのファイルを読み、2 段検証する（CLI / テスト向け）。 */
export async function validateDocument(filePath: string): Promise<ValidateResult> {
  const abs = resolvePath(filePath);
  let text: string;
  try {
    text = readFileSync(abs, "utf8");
  } catch {
    return { valid: false, warnings: [], issues: [{ stage: "raw", path: "/", message: `File not found: ${filePath}` }] };
  }
  return validateSpec(text, pathToFileURL(abs).href, nodeFileLoader);
}

/** ローカルパスを file:// URI に変換する（resolveRefs の entryUri 用）。 */
export function fileUri(filePath: string): string {
  return pathToFileURL(resolvePath(filePath)).href;
}

/** ローカルパスの spec を読み、$ref を解決した正規化ドキュメントを返す。 */
export async function resolveDocument(filePath: string): Promise<unknown> {
  const abs = resolvePath(filePath);
  const raw = parseYaml(readFileSync(abs, "utf8"));
  return resolveRefs(raw, pathToFileURL(abs).href, nodeFileLoader);
}
