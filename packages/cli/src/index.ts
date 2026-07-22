#!/usr/bin/env node
import { resolve as resolvePath } from "node:path";
import { validateDocument } from "@screen-spec/core";

function printUsage(): void {
  console.error("Usage: screen-spec validate <file.yaml> [<file.yaml> ...]");
}

function runValidate(files: string[]): number {
  if (files.length === 0) {
    printUsage();
    return 2;
  }
  let hadError = false;
  for (const file of files) {
    const result = validateDocument(resolvePath(file));
    if (result.valid) {
      console.log(`✓ ${file} is valid`);
    } else {
      hadError = true;
      console.error(`✗ ${file} is invalid`);
      for (const issue of result.issues) {
        console.error(`    [${issue.stage}] ${issue.message}`);
      }
    }
  }
  return hadError ? 1 : 0;
}

function main(): number {
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

process.exit(main());
