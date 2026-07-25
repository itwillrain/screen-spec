// ブラウザが fetch できるよう、リポジトリの examples/*.yaml を public/specs/ へコピーする。
// examples/ を正本とし、viewer 側はビルド成果物に取り込むだけ（重複管理を避ける）。
import { cpSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(here, "../../../examples");
const outDir = resolve(here, "../public/specs");

mkdirSync(outDir, { recursive: true });

// examples/ 直下の yaml をコピー（common.yaml や *.screen.yaml など）
for (const name of readdirSync(examplesDir)) {
  if (name.endsWith(".yaml") || name.endsWith(".yml")) {
    cpSync(resolve(examplesDir, name), resolve(outDir, name));
  }
}
// 参照される OpenAPI などのサブディレクトリも丸ごとコピー
for (const name of readdirSync(examplesDir, { withFileTypes: true })) {
  if (name.isDirectory()) {
    cpSync(resolve(examplesDir, name.name), resolve(outDir, name.name), { recursive: true });
  }
}

// 画面ファイル（*.screen.yaml）のマニフェストを生成（負のテスト用 invalid.* は除外）
const screens = readdirSync(examplesDir)
  .filter((n) => n.endsWith(".screen.yaml") && !n.includes("invalid"))
  .sort();
writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(screens, null, 2));

const testData = readdirSync(examplesDir)
  .filter((n) => n.endsWith(".fixtures.yaml") && !n.includes("invalid"))
  .sort();
writeFileSync(resolve(outDir, "test-data-manifest.json"), JSON.stringify(testData, null, 2));

console.log(`[copy-specs] copied specs and wrote manifests (${screens.length} screens, ${testData.length} testData)`);
