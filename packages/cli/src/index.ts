#!/usr/bin/env node
import { resolve as resolvePath } from "node:path";
import { analyzeProject, type ProjectScreen } from "@screen-spec/core";
import { validateDocument, resolveDocument } from "@screen-spec/core/node";

function printUsage(): void {
  console.error("Usage: screen-spec validate <file.yaml> [<file.yaml> ...]");
}

async function runValidate(files: string[]): Promise<number> {
  if (files.length === 0) {
    printUsage();
    return 2;
  }
  let hadError = false;
  for (const file of files) {
    const result = await validateDocument(resolvePath(file));
    if (result.valid) {
      console.log(`✓ ${file} is valid`);
    } else {
      hadError = true;
      console.error(`✗ ${file} is invalid`);
      for (const issue of result.issues) {
        console.error(`    [${issue.stage}] ${issue.message}`);
      }
    }
    for (const warning of result.warnings) {
      console.warn(`    ⚠ [${warning.stage}] ${warning.message}`);
    }
  }

  // 複数ファイル指定時は画面間の参照を横断検査する
  if (files.length > 1) {
    const project: ProjectScreen[] = [];
    for (const file of files) {
      try {
        const doc = (await resolveDocument(resolvePath(file))) as { screen?: { id?: unknown } };
        const id = doc?.screen?.id;
        if (typeof id === "string") project.push({ id, screen: doc.screen });
      } catch {
        // 解決に失敗したファイルは横断検査から除外（個別検証で報告済み）
      }
    }
    const crossDiagnostics = analyzeProject(project);
    for (const d of crossDiagnostics) {
      console.warn(`    ⚠ [project] ${d.message}`);
    }
  }

  return hadError ? 1 : 0;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "validate":
      return runValidate(rest);
    case undefined:
    case "-h":
    case "--help":
      printUsage();
      return command === undefined ? 2 : 0;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      return 2;
  }
}

main().then((code) => process.exit(code));
