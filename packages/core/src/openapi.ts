// OpenAPI ドキュメントから operation を解決する軽量ユーティリティ。
// v0.1 系では inline スキーマのみを対象とし、components/$ref の深追いはしない。

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

function topLevelProps(schema: unknown): string[] {
  if (isObject(schema) && isObject(schema.properties)) {
    return Object.keys(schema.properties);
  }
  return [];
}

function jsonSchema(container: unknown): unknown {
  // { content: { "application/json": { schema } } } から schema を取り出す
  if (!isObject(container)) return undefined;
  const content = container.content;
  if (!isObject(content)) return undefined;
  const json = content["application/json"];
  return isObject(json) ? json.schema : undefined;
}

function extractParameters(op: Record<string, unknown>): OpenApiParameter[] {
  const params = op.parameters;
  if (!Array.isArray(params)) return [];
  const out: OpenApiParameter[] = [];
  for (const p of params) {
    if (!isObject(p) || typeof p.name !== "string" || typeof p.in !== "string") continue;
    const schema = isObject(p.schema) ? p.schema : undefined;
    out.push({
      name: p.name,
      in: p.in,
      required: p.required === true,
      type: typeof schema?.type === "string" ? schema.type : undefined,
    });
  }
  return out;
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
        parameters: extractParameters(op),
        requestFields: topLevelProps(jsonSchema(op.requestBody)),
        responseFields: topLevelProps(jsonSchema(firstSuccessResponse(op.responses))),
      };
    }
  }
  return undefined;
}
