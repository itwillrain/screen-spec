// ブラウザが fetch できるよう、リポジトリの examples/*.yaml を public/specs/ へコピーする。
// examples/ を正本とし、viewer 側はビルド成果物に取り込むだけ（重複管理を避ける）。
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const examplesDir = resolve(here, "../../../examples");
const outDir = resolve(here, "../public/specs");

mkdirSync(outDir, { recursive: true });
for (const name of readdirSync(examplesDir)) {
  if (name.endsWith(".yaml") || name.endsWith(".yml")) {
    cpSync(resolve(examplesDir, name), resolve(outDir, name));
  }
}
console.log(`[copy-specs] copied *.yaml from examples/ to public/specs/`);
