// ブラウザ内で spec を解決して表示用ビューモデルを組み立てる。
// core はブラウザ安全なエントリ（parse / resolveRefs / validateSpec）だけを使う。
import { parseYaml, resolveRefs, validateSpec, type DocumentLoader } from "@screen-spec/core";

export interface FieldValidationView {
  rule: string;
  message?: string;
}

export interface FieldView {
  key: string;
  label: string;
  type: string;
  required: boolean;
  validations: FieldValidationView[];
  /** フィールド自体が $ref 由来なら、その参照文字列 */
  origin?: string;
}

export interface StateNode {
  key: string;
  name?: string;
  initial: boolean;
}

export interface StateEdge {
  from: string;
  to: string;
  label?: string;
}

export interface StateMachineView {
  states: StateNode[];
  edges: StateEdge[];
}

export interface ScreenView {
  id: string;
  name: string;
  description?: string;
  route?: string;
  fields: FieldView[];
  stateMachine?: StateMachineView;
  warnings: string[];
  valid: boolean;
  issueCount: number;
  sourceUri: string;
}

interface RawField {
  $ref?: string;
  label?: string;
  type?: string;
  required?: boolean;
  validations?: Array<{ rule?: string; message?: string }>;
}

interface RawState {
  name?: string;
  initial?: boolean;
}

interface RawEvent {
  from?: string;
  to?: string;
  trigger?: string;
  onSuccess?: { to?: string };
  onError?: { to?: string };
}

interface SpecDoc {
  screen?: {
    id?: string;
    name?: string;
    description?: string;
    route?: string;
    fields?: Record<string, RawField>;
    states?: Record<string, RawState>;
    events?: Record<string, RawEvent>;
  };
}

function buildStateMachine(screen: SpecDoc["screen"]): StateMachineView | undefined {
  const states = screen?.states;
  if (!states || Object.keys(states).length === 0) return undefined;

  const nodes: StateNode[] = Object.entries(states).map(([key, v]) => ({
    key,
    name: v?.name,
    initial: v?.initial === true,
  }));

  const edges: StateEdge[] = [];
  for (const [key, ev] of Object.entries(screen?.events ?? {})) {
    if (ev.from && ev.to) edges.push({ from: ev.from, to: ev.to, label: ev.trigger ? `${key} (${ev.trigger})` : key });
    if (ev.to && ev.onSuccess?.to) edges.push({ from: ev.to, to: ev.onSuccess.to, label: "onSuccess" });
    if (ev.to && ev.onError?.to) edges.push({ from: ev.to, to: ev.onError.to, label: "onError" });
  }
  return { states: nodes, edges };
}

/**
 * entryUri から spec を取得し、$ref 解決＋検証してビューモデルを返す。
 * @param entryUri エントリ spec の絶対 URL
 * @param load URI からテキストを取得するローダー（ブラウザは fetch）
 */
export async function buildScreenView(entryUri: string, load: DocumentLoader): Promise<ScreenView> {
  const rawText = await load(entryUri);
  const raw = parseYaml(rawText) as SpecDoc;
  const resolved = (await resolveRefs(raw, entryUri, load)) as SpecDoc;
  const result = await validateSpec(rawText, entryUri, load);

  const rawFields = raw.screen?.fields ?? {};
  const resolvedFields = resolved.screen?.fields ?? {};

  // 記述順（YAML の挿入順）＝表示順（決定 #6）
  const fields: FieldView[] = Object.keys(resolvedFields).map((key) => {
    const rf = resolvedFields[key] as RawField;
    const rawField = rawFields[key] as RawField | undefined;
    const origin = rawField && typeof rawField.$ref === "string" ? rawField.$ref : undefined;
    const validations: FieldValidationView[] = (rf.validations ?? []).map((v) => ({
      rule: String(v.rule ?? ""),
      message: v.message,
    }));
    return {
      key,
      label: String(rf.label ?? ""),
      type: String(rf.type ?? ""),
      required: Boolean(rf.required),
      validations,
      origin,
    };
  });

  return {
    id: String(resolved.screen?.id ?? ""),
    name: String(resolved.screen?.name ?? ""),
    description: resolved.screen?.description,
    route: resolved.screen?.route,
    fields,
    stateMachine: buildStateMachine(resolved.screen),
    warnings: result.warnings.map((w) => w.message),
    valid: result.valid,
    issueCount: result.issues.length,
    sourceUri: entryUri,
  };
}

/** ブラウザ向けの fetch ローダー。 */
export const fetchLoader: DocumentLoader = async (uri) => {
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error(`fetch ${uri} failed: ${res.status}`);
  }
  return res.text();
};
