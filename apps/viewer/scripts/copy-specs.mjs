// ブラウザが fetch できるよう、リポジトリの examples/ を public/specs/ へコピーする。
// examples/ を正本とし、viewer 側はビルド成果物に取り込むだけ（重複管理を避ける）。
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const defaultExamplesDir = resolve(here, "../../../examples");
const defaultOutDir = resolve(here, "../public/specs");

function relativeUrl(root, path) {
  return relative(root, path).split(sep).join("/");
}

function yamlFiles(root, directory = root) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return yamlFiles(root, path);
    return /\.ya?ml$/.test(entry.name) ? [relativeUrl(root, path)] : [];
  });
}

export function discoverSpecFiles(root) {
  const yaml = yamlFiles(root).filter((path) => !path.split("/").some((part) => part.includes("invalid")));
  return {
    screens: yaml.filter((path) => path.endsWith(".screen.yaml")).sort(),
    testData: yaml.filter((path) => path.endsWith(".fixtures.yaml")).sort(),
    components: yaml
      .filter((path) => {
        const source = readFileSync(resolve(root, path), "utf8");
        return /^specVersion:\s*/m.test(source) && /^components:\s*$/m.test(source);
      })
      .sort(),
  };
}

export function copySpecs(examplesDir = defaultExamplesDir, outDir = defaultOutDir) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  for (const entry of readdirSync(examplesDir, { withFileTypes: true })) {
    cpSync(resolve(examplesDir, entry.name), resolve(outDir, entry.name), { recursive: entry.isDirectory() });
  }

  const manifests = discoverSpecFiles(examplesDir);
  writeFileSync(resolve(outDir, "manifest.json"), JSON.stringify(manifests.screens, null, 2));
  writeFileSync(resolve(outDir, "test-data-manifest.json"), JSON.stringify(manifests.testData, null, 2));
  writeFileSync(resolve(outDir, "component-manifest.json"), JSON.stringify(manifests.components, null, 2));

  return manifests;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifests = copySpecs();
  console.log(`[copy-specs] copied specs and wrote manifests (${manifests.screens.length} screens, ${manifests.testData.length} testData, ${manifests.components.length} component documents)`);
}
