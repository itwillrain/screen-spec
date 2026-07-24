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
  width?: string;
  visibleWhen?: string;
  design?: DesignView;
  validations: FieldValidationView[];
  /** フィールド自体が $ref 由来なら、その参照文字列 */
  origin?: string;
}

export interface LayoutSectionView {
  id?: string;
  title?: string;
  region?: string;
  columns: number;
  fieldKeys: string[];
}

export interface LayoutView {
  sections: LayoutSectionView[];
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

export interface ApiBindingView {
  key: string;
  operationId: string;
  specRef: string;
  requestMappings: Array<{ scope: string; key: string; expr: string }>;
  responseMappings: Array<{ field: string; expr: string }>;
}

export interface TransitionView {
  key: string;
  to: string;
  trigger?: string;
}

export interface DesignView {
  figma?: string;
  images: Array<{ url: string; caption?: string }>;
  links: Array<{ label?: string; url: string }>;
}

export interface ParamView {
  name: string;
  type?: string;
  required?: boolean;
  default?: unknown;
  description?: string;
  enum?: unknown[];
}

export interface ParamsView {
  path: ParamView[];
  query: ParamView[];
}

export interface ScreenView {
  id: string;
  name: string;
  description?: string;
  route?: string;
  params?: ParamsView;
  fields: FieldView[];
  layout?: LayoutView;
  design?: DesignView;
  stateMachine?: StateMachineView;
  apiBindings: ApiBindingView[];
  transitions: TransitionView[];
  warnings: string[];
  valid: boolean;
  issueCount: number;
  sourceUri: string;
  /** エントリ spec の原文（Raw YAML 表示用） */
  rawText: string;
  /** 横断解析（analyzeProject）用の解決済み screen オブジェクト */
  resolvedScreen: unknown;
}

interface RawField {
  $ref?: string;
  label?: string;
  type?: string;
  required?: boolean;
  width?: string;
  visibleWhen?: string;
  design?: RawDesign;
  validations?: Array<{ rule?: string; message?: string }>;
}

interface RawLayout {
  sections?: Array<{
    id?: string;
    title?: string;
    region?: string;
    columns?: number;
    fields?: string[];
  }>;
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

interface RawApiBinding {
  openapi?: { operationId?: string; specRef?: string };
  request?: Record<string, Record<string, string>>;
  response?: { mapping?: Record<string, string> };
}

interface RawTransition {
  to?: string;
  trigger?: string;
}

interface RawDesign {
  figma?: string;
  images?: Array<{ url?: string; caption?: string }>;
  links?: Array<{ label?: string; url?: string }>;
}

interface RawParam {
  type?: string;
  required?: boolean;
  default?: unknown;
  description?: string;
  enum?: unknown[];
}

interface RawParams {
  path?: Record<string, RawParam>;
  query?: Record<string, RawParam>;
}

function buildParams(params: RawParams | undefined): ParamsView | undefined {
  if (!params) return undefined;
  const toList = (m: Record<string, RawParam> | undefined): ParamView[] =>
    Object.entries(m ?? {}).map(([name, p]) => ({
      name,
      type: p.type,
      required: p.required,
      default: p.default,
      description: p.description,
      enum: p.enum,
    }));
  const path = toList(params.path);
  const query = toList(params.query);
  if (path.length === 0 && query.length === 0) return undefined;
  return { path, query };
}

interface SpecDoc {
  screen?: {
    id?: string;
    name?: string;
    description?: string;
    route?: string;
    design?: RawDesign;
    layout?: RawLayout;
    params?: RawParams;
    fields?: Record<string, RawField>;
    states?: Record<string, RawState>;
    events?: Record<string, RawEvent>;
    apiBindings?: Record<string, RawApiBinding>;
    transitions?: Record<string, RawTransition>;
  };
}

function buildApiBindings(screen: SpecDoc["screen"]): ApiBindingView[] {
  const bindings = screen?.apiBindings;
  if (!bindings) return [];
  return Object.entries(bindings).map(([key, b]) => {
    const requestMappings: ApiBindingView["requestMappings"] = [];
    for (const scope of ["path", "query", "body"] as const) {
      const entries = b.request?.[scope];
      if (entries) {
        for (const [k, expr] of Object.entries(entries)) {
          requestMappings.push({ scope, key: k, expr: String(expr) });
        }
      }
    }
    const responseMappings = Object.entries(b.response?.mapping ?? {}).map(([field, expr]) => ({
      field,
      expr: String(expr),
    }));
    return {
      key,
      operationId: String(b.openapi?.operationId ?? ""),
      specRef: String(b.openapi?.specRef ?? ""),
      requestMappings,
      responseMappings,
    };
  });
}

function buildLayout(layout: RawLayout | undefined): LayoutView | undefined {
  const sections = layout?.sections;
  if (!Array.isArray(sections) || sections.length === 0) return undefined;
  return {
    sections: sections.map((sec) => ({
      id: sec.id,
      title: sec.title,
      region: sec.region,
      columns: typeof sec.columns === "number" && sec.columns >= 1 ? sec.columns : 1,
      fieldKeys: Array.isArray(sec.fields) ? sec.fields.map(String) : [],
    })),
  };
}

function buildDesign(design: RawDesign | undefined): DesignView | undefined {
  if (!design) return undefined;
  const images = (design.images ?? [])
    .filter((i) => typeof i.url === "string")
    .map((i) => ({ url: String(i.url), caption: i.caption }));
  const links = (design.links ?? [])
    .filter((l) => typeof l.url === "string")
    .map((l) => ({ label: l.label, url: String(l.url) }));
  if (!design.figma && images.length === 0 && links.length === 0) return undefined;
  return { figma: design.figma, images, links };
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
  const result = await validateSpec(rawText, entryUri, load);
  // 不正な画面でも表示できるよう、解決に失敗したら未解決の raw にフォールバックする。
  let resolved: SpecDoc = raw;
  try {
    resolved = (await resolveRefs(raw, entryUri, load)) as SpecDoc;
  } catch {
    resolved = raw;
  }

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
      width: typeof rf.width === "string" ? rf.width : undefined,
      visibleWhen: typeof rf.visibleWhen === "string" ? rf.visibleWhen : undefined,
      design: buildDesign(rf.design),
      validations,
      origin,
    };
  });

  return {
    id: String(resolved.screen?.id ?? ""),
    name: String(resolved.screen?.name ?? ""),
    description: resolved.screen?.description,
    route: resolved.screen?.route,
    params: buildParams(resolved.screen?.params),
    fields,
    layout: buildLayout(resolved.screen?.layout),
    design: buildDesign(resolved.screen?.design),
    stateMachine: buildStateMachine(resolved.screen),
    apiBindings: buildApiBindings(resolved.screen),
    transitions: Object.entries(resolved.screen?.transitions ?? {}).map(([key, t]) => ({
      key,
      to: String(t.to ?? ""),
      trigger: t.trigger,
    })),
    warnings: result.warnings.map((w) => w.message),
    valid: result.valid,
    issueCount: result.issues.length,
    sourceUri: entryUri,
    rawText,
    resolvedScreen: resolved.screen,
  };
}

/**
 * マニフェスト（spec ファイル名の配列）を読み、全画面のビューモデルを構築する。
 * @param specsBaseUri specs ディレクトリの絶対 URL（末尾スラッシュ）
 */
export async function loadAllScreens(
  specsBaseUri: string,
  load: DocumentLoader,
): Promise<ScreenView[]> {
  const manifestText = await load(new URL("manifest.json", specsBaseUri).href);
  const files = JSON.parse(manifestText) as string[];
  const screens = await Promise.all(
    files.map((file) => buildScreenView(new URL(file, specsBaseUri).href, load)),
  );
  // 記述順を保ちつつ id で安定させる
  return screens;
}

/** ブラウザ向けの fetch ローダー。 */
export const fetchLoader: DocumentLoader = async (uri) => {
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error(`fetch ${uri} failed: ${res.status}`);
  }
  return res.text();
};
