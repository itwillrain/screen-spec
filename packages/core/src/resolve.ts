import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve as resolvePath } from "node:path";
import { parseYaml } from "./parse.js";

/**
 * $ref 解決に関するエラー。
 * 決定 #3: $ref は純粋参照（兄弟キー禁止・マージなし）。
 * 決定 #7: core にリゾルバを持つ。
 * 決定 #8: 外部参照はローカル相対パスのみ。
 */
export class RefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefError";
  }
}

type DocCache = Record<string, unknown>;

interface ResolveContext {
  /** 現在処理中ドキュメントのディレクトリ（相対 $ref の基準） */
  baseDir: string;
  /** 現在処理中ドキュメントのルート（同一ファイル内 $ref の解決先） */
  docRoot: unknown;
  /** 現在処理中ドキュメントの絶対パス（循環検出キー用） */
  absPath: string;
  cache: DocCache;
  /** 解決中の "absPath#pointer" スタック（循環検出用） */
  stack: string[];
}

function isRefObject(node: unknown): node is Record<string, unknown> {
  return (
    typeof node === "object" &&
    node !== null &&
    !Array.isArray(node) &&
    Object.prototype.hasOwnProperty.call(node, "$ref")
  );
}

function parseRef(ref: string): { file: string; pointer: string } {
  const hashIndex = ref.indexOf("#");
  if (hashIndex === -1) return { file: ref, pointer: "" };
  return { file: ref.slice(0, hashIndex), pointer: ref.slice(hashIndex + 1) };
}

function navigatePointer(root: unknown, pointer: string, refDisplay: string): unknown {
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) {
    throw new RefError(`Invalid JSON pointer in $ref "${refDisplay}": must start with "/"`);
  }
  const parts = pointer
    .slice(1)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = root;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const idx = Number(part);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
        throw new RefError(`$ref "${refDisplay}" not found: array index "${part}" out of range`);
      }
      current = current[idx];
    } else if (current !== null && typeof current === "object") {
      if (!Object.prototype.hasOwnProperty.call(current, part)) {
        throw new RefError(`$ref "${refDisplay}" not found: missing key "${part}"`);
      }
      current = (current as Record<string, unknown>)[part];
    } else {
      throw new RefError(`$ref "${refDisplay}" not found: cannot descend into "${part}"`);
    }
  }
  return current;
}

function loadDoc(absPath: string, cache: DocCache): unknown {
  if (!(absPath in cache)) {
    let text: string;
    try {
      text = readFileSync(absPath, "utf8");
    } catch {
      throw new RefError(`Referenced file not found: ${absPath}`);
    }
    cache[absPath] = parseYaml(text);
  }
  return cache[absPath];
}

function resolveNode(node: unknown, ctx: ResolveContext): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => resolveNode(item, ctx));
  }
  if (node !== null && typeof node === "object") {
    if (isRefObject(node)) {
      return resolveRefObject(node, ctx);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = resolveNode(v, ctx);
    }
    return out;
  }
  return node;
}

function resolveRefObject(node: Record<string, unknown>, ctx: ResolveContext): unknown {
  const ref = node.$ref;
  if (typeof ref !== "string") {
    throw new RefError("$ref must be a string");
  }
  // 決定 #3: 純粋参照。兄弟キーがあれば拒否（スキーマでも弾くが二重に防御）。
  const siblings = Object.keys(node).filter((k) => k !== "$ref");
  if (siblings.length > 0) {
    throw new RefError(
      `$ref must be a pure reference (no sibling keys): found "${siblings.join(", ")}" next to "${ref}"`,
    );
  }
  // 決定 #8: リモート/絶対パスは v0.1 では不可。
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(ref)) {
    throw new RefError(`Remote $ref is not allowed in v0.1: "${ref}"`);
  }

  const { file, pointer } = parseRef(ref);
  let targetAbs = ctx.absPath;
  let targetRoot = ctx.docRoot;
  let targetBaseDir = ctx.baseDir;

  if (file !== "") {
    if (isAbsolute(file)) {
      throw new RefError(`Absolute path $ref is not allowed in v0.1: "${ref}"`);
    }
    targetAbs = resolvePath(ctx.baseDir, file);
    targetRoot = loadDoc(targetAbs, ctx.cache);
    targetBaseDir = dirname(targetAbs);
  }

  const key = `${targetAbs}#${pointer}`;
  if (ctx.stack.includes(key)) {
    throw new RefError(`Circular $ref detected: ${[...ctx.stack, key].join(" -> ")}`);
  }

  const value = navigatePointer(targetRoot, pointer, ref);
  return resolveNode(value, {
    baseDir: targetBaseDir,
    docRoot: targetRoot,
    absPath: targetAbs,
    cache: ctx.cache,
    stack: [...ctx.stack, key],
  });
}

/**
 * ドキュメント内の全 $ref を再帰的に解決し、正規化済みドキュメントを返す。
 * @param root エントリドキュメントのパース済み値
 * @param entryFilePath エントリファイルのパス（相対 $ref の基準に使う）
 */
export function resolveRefs(root: unknown, entryFilePath: string): unknown {
  const absEntry = resolvePath(entryFilePath);
  const cache: DocCache = { [absEntry]: root };
  return resolveNode(root, {
    baseDir: dirname(absEntry),
    docRoot: root,
    absPath: absEntry,
    cache,
    stack: [],
  });
}

/** 解決後に残存する $ref を探す（リゾルバの健全性チェック用）。 */
export function findResidualRefs(node: unknown, path = ""): string[] {
  const hits: string[] = [];
  if (Array.isArray(node)) {
    node.forEach((item, i) => hits.push(...findResidualRefs(item, `${path}/${i}`)));
  } else if (node !== null && typeof node === "object") {
    if (Object.prototype.hasOwnProperty.call(node, "$ref")) {
      hits.push(path || "/");
    }
    for (const [k, v] of Object.entries(node)) {
      hits.push(...findResidualRefs(v, `${path}/${k}`));
    }
  }
  return hits;
}
