import { parseYaml } from "./parse.js";

/**
 * $ref 解決に関するエラー。
 * 決定 #3: $ref は純粋参照（兄弟キー禁止・マージなし）。
 * 決定 #7: core にリゾルバを持つ。
 * 決定 #8: 外部参照はローカル相対（絶対 URL / 絶対パス / スキームは不可）。
 */
export class RefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefError";
  }
}

/**
 * ドキュメント本文（YAML/JSON テキスト）を URI から取得するローダー。
 * 環境依存の入出力（Node の fs / ブラウザの fetch）を注入するための境界。
 */
export type DocumentLoader = (uri: string) => string | Promise<string>;

interface ResolveContext {
  /** 現在処理中ドキュメントの絶対 URI（相対 $ref の基準・循環検出キー） */
  baseUri: string;
  /** 現在処理中ドキュメントのルート（同一ファイル内 $ref の解決先） */
  docRoot: unknown;
  /** URI → パース済みドキュメントのキャッシュ */
  cache: Map<string, unknown>;
  load: DocumentLoader;
  /** 解決中の "uri#pointer" スタック（循環検出用） */
  stack: string[];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isRefObject(node: unknown): node is Record<string, unknown> {
  return isPlainObject(node) && Object.prototype.hasOwnProperty.call(node, "$ref");
}

function parseRef(ref: string): { file: string; pointer: string } {
  const hashIndex = ref.indexOf("#");
  if (hashIndex === -1) return { file: ref, pointer: "" };
  return { file: ref.slice(0, hashIndex), pointer: ref.slice(hashIndex + 1) };
}

/** 決定 #8: 作者が書く $ref のファイル部はローカル相対のみ許可する。 */
function isAllowedRelative(file: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:/i.test(file)) return false; // http:, file:, data: などのスキーム
  if (file.startsWith("//")) return false; // プロトコル相対
  if (file.startsWith("/")) return false; // ルート絶対
  return true;
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

async function loadDoc(uri: string, ctx: ResolveContext): Promise<unknown> {
  if (!ctx.cache.has(uri)) {
    let text: string;
    try {
      text = await ctx.load(uri);
    } catch {
      throw new RefError(`Referenced document could not be loaded: ${uri}`);
    }
    ctx.cache.set(uri, parseYaml(text));
  }
  return ctx.cache.get(uri);
}

async function resolveNode(node: unknown, ctx: ResolveContext): Promise<unknown> {
  if (Array.isArray(node)) {
    return Promise.all(node.map((item) => resolveNode(item, ctx)));
  }
  if (node !== null && typeof node === "object") {
    if (isRefObject(node)) {
      return resolveRefObject(node, ctx);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = await resolveNode(v, ctx);
    }
    return out;
  }
  return node;
}

async function resolveRefObject(node: Record<string, unknown>, ctx: ResolveContext): Promise<unknown> {
  const ref = node.$ref;
  if (typeof ref !== "string") {
    throw new RefError("$ref must be a string");
  }
  // 決定 #3: 純粋参照。兄弟キーがあれば拒否。
  const siblings = Object.keys(node).filter((k) => k !== "$ref");
  if (siblings.length > 0) {
    throw new RefError(
      `$ref must be a pure reference (no sibling keys): found "${siblings.join(", ")}" next to "${ref}"`,
    );
  }

  const { file, pointer } = parseRef(ref);
  let targetUri = ctx.baseUri;
  let targetRoot = ctx.docRoot;

  if (file !== "") {
    // 決定 #8: リモート/絶対は不可。相対のみ基準 URI に対して解決する。
    if (!isAllowedRelative(file)) {
      throw new RefError(`Only local relative $ref is allowed in v0.1: "${ref}"`);
    }
    targetUri = new URL(file, ctx.baseUri).href;
    targetRoot = await loadDoc(targetUri, ctx);
  }

  const key = `${targetUri}#${pointer}`;
  if (ctx.stack.includes(key)) {
    throw new RefError(`Circular $ref detected: ${[...ctx.stack, key].join(" -> ")}`);
  }

  const value = navigatePointer(targetRoot, pointer, ref);
  return resolveNode(value, {
    baseUri: targetUri,
    docRoot: targetRoot,
    cache: ctx.cache,
    load: ctx.load,
    stack: [...ctx.stack, key],
  });
}

/**
 * ドキュメント内の全 $ref を再帰的に解決し、正規化済みドキュメントを返す。
 * @param root エントリドキュメントのパース済み値
 * @param entryUri エントリの絶対 URI（相対 $ref の基準。Node は file:// URL、ブラウザは http(s) URL）
 * @param load URI からドキュメント本文を取得するローダー（Node=fs / ブラウザ=fetch）
 */
export async function resolveRefs(
  root: unknown,
  entryUri: string,
  load: DocumentLoader,
): Promise<unknown> {
  const cache = new Map<string, unknown>([[entryUri, root]]);
  return resolveNode(root, { baseUri: entryUri, docRoot: root, cache, load, stack: [] });
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
