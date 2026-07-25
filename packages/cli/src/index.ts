#!/usr/bin/env node
import { resolve as resolvePath } from "node:path";
import { writeFileSync } from "node:fs";
import {
  analyzeProject,
  generateTestItems,
  testItemsToCsv,
  testItemsToMarkdown,
  type ProjectScreen,
  type ProjectTestData,
} from "@screen-spec/core";
import { validateDocument, resolveDocument } from "@screen-spec/core/node";

function printUsage(): void {
  console.error(`Usage:
  screen-spec validate <file.yaml> [<file.yaml> ...]
  screen-spec testgen <screen.yaml> [--test-data <fixtures.yaml>] [--format markdown|csv] [--output <file>]`);
}

interface TestgenOptions {
  screen?: string;
  testData?: string;
  format: "markdown" | "csv";
  output?: string;
}

function parseTestgenOptions(args: string[]): TestgenOptions | undefined {
  const options: TestgenOptions = { format: "markdown" };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--test-data" || arg === "--format" || arg === "--output") {
      const value = args[i + 1];
      if (!value) return undefined;
      if (arg === "--test-data") options.testData = value;
      if (arg === "--output") options.output = value;
      if (arg === "--format") {
        if (value !== "markdown" && value !== "csv") return undefined;
        options.format = value;
      }
      i += 1;
    } else if (arg.startsWith("-")) {
      return undefined;
    } else if (!options.screen) {
      options.screen = arg;
    } else {
      return undefined;
    }
  }
  return options.screen ? options : undefined;
}

async function runTestgen(args: string[]): Promise<number> {
  const options = parseTestgenOptions(args);
  if (!options?.screen) {
    printUsage();
    return 2;
  }
  try {
    const screenDocument = await resolveDocument(resolvePath(options.screen)) as { screen?: unknown };
    if (!screenDocument.screen) {
      console.error(`✗ ${options.screen} does not contain a screen document`);
      return 1;
    }
    let testData: unknown;
    if (options.testData) {
      const testDataDocument = await resolveDocument(resolvePath(options.testData)) as { testData?: unknown };
      if (!testDataDocument.testData) {
        console.error(`✗ ${options.testData} does not contain a testData document`);
        return 1;
      }
      testData = testDataDocument.testData;
    }
    const items = generateTestItems(screenDocument.screen, testData);
    const content = options.format === "csv" ? testItemsToCsv(items) : testItemsToMarkdown(items);
    if (options.output) {
      writeFileSync(resolvePath(options.output), content, "utf8");
      console.error(`✓ wrote ${items.length} test items to ${options.output}`);
    } else {
      process.stdout.write(content);
    }
    return 0;
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
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
    const projectTestData: ProjectTestData[] = [];
    for (const file of files) {
      try {
        const doc = (await resolveDocument(resolvePath(file))) as {
          screen?: { id?: unknown };
          testData?: unknown;
        };
        const id = doc?.screen?.id;
        if (typeof id === "string") project.push({ id, screen: doc.screen });
        if (doc.testData !== undefined) projectTestData.push({ testData: doc.testData, source: file });
      } catch {
        // 解決に失敗したファイルは横断検査から除外（個別検証で報告済み）
      }
    }
    const crossDiagnostics = analyzeProject(project, projectTestData);
    for (const d of crossDiagnostics) {
      if (d.severity === "error") {
        hadError = true;
        console.error(`    ✗ [project] ${d.message}`);
      } else {
        console.warn(`    ⚠ [project] ${d.message}`);
      }
    }
  }

  return hadError ? 1 : 0;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "validate":
      return runValidate(rest);
    case "testgen":
      return runTestgen(rest);
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
