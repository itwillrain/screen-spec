// OpenAPI ドキュメントから operation を解決する軽量ユーティリティ。
// OpenAPI 内部の $ref（#/components/...）とパス階層 parameters に対応する。

export interface OpenApiParameter {
  name: string;
  in: string; // path / query / header / cookie
  required?: boolean;
  type?: string;
}

export interface OpenApiOperation {
  operationId: string;
  method: string; // GET / PUT / POST ...
  path: string; // /users/{userId}
  summary?: string;
  parameters: OpenApiParameter[];
  /** requestBody(application/json) のトップレベルプロパティ名 */
  requestFields: string[];
  /** 2xx レスポンス(application/json) のトップレベルプロパティ名 */
  responseFields: string[];
}

const HTTP_METHODS = ["get", "put", "post", "delete", "patch", "options", "head", "trace"];

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** OpenAPI 内部参照（#/a/b/c）を解決する。深さ制限つきで循環を防ぐ。 */
function deref(root: unknown, node: unknown, depth = 0): unknown {
  if (depth > 20 || !isObject(node)) return node;
  const ref = node.$ref;
  if (typeof ref !== "string" || !ref.startsWith("#/")) return node;
  const parts = ref
    .slice(2)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = root;
  for (const part of parts) {
    if (!isObject(current)) return undefined;
    current = current[part];
  }
  return deref(root, current, depth + 1);
}

function topLevelProps(root: unknown, schema: unknown): string[] {
  const s = deref(root, schema);
  if (isObject(s) && isObject(s.properties)) return Object.keys(s.properties);
  return [];
}

/** { content: { "application/json": { schema } } } から schema を取り出す（$ref 解決込み）。 */
function jsonSchema(root: unknown, container: unknown): unknown {
  const c = deref(root, container);
  if (!isObject(c) || !isObject(c.content)) return undefined;
  const json = c.content["application/json"];
  return isObject(json) ? json.schema : undefined;
}

function schemaType(root: unknown, schema: unknown): string | undefined {
  const s = deref(root, schema);
  if (isObject(s) && typeof s.type === "string") return s.type;
  return undefined;
}

/** path-item と operation の parameters をマージする（name+in で operation 側が優先）。 */
function collectParameters(root: unknown, itemParams: unknown, opParams: unknown): OpenApiParameter[] {
  const byKey = new Map<string, OpenApiParameter>();
  for (const list of [itemParams, opParams]) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const p = deref(root, raw);
      if (!isObject(p) || typeof p.name !== "string" || typeof p.in !== "string") continue;
      byKey.set(`${p.in}:${p.name}`, {
        name: p.name,
        in: p.in,
        required: p.required === true,
        type: schemaType(root, p.schema),
      });
    }
  }
  return [...byKey.values()];
}

function firstSuccessResponse(responses: unknown): unknown {
  if (!isObject(responses)) return undefined;
  for (const [code, res] of Object.entries(responses)) {
    if (code.startsWith("2") || code === "default") return res;
  }
  return undefined;
}

/** operationId で operation を検索し、要約情報を返す。見つからなければ undefined。 */
export function findOperation(openapi: unknown, operationId: string): OpenApiOperation | undefined {
  if (!isObject(openapi) || !isObject(openapi.paths)) return undefined;
  for (const [path, item] of Object.entries(openapi.paths)) {
    if (!isObject(item)) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!isObject(op) || op.operationId !== operationId) continue;
      return {
        operationId,
        method: method.toUpperCase(),
        path,
        summary: typeof op.summary === "string" ? op.summary : undefined,
        parameters: collectParameters(openapi, item.parameters, op.parameters),
        requestFields: topLevelProps(openapi, jsonSchema(openapi, op.requestBody)),
        responseFields: topLevelProps(openapi, jsonSchema(openapi, firstSuccessResponse(op.responses))),
      };
    }
  }
  return undefined;
}
