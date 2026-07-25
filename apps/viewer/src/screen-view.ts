// ブラウザ内で spec を解決して表示用ビューモデルを組み立てる。
// core はブラウザ安全なエントリ（parse / resolveRefs / validateSpec）だけを使う。
import {
  parseYaml,
  resolveRefs,
  validateSpec,
  findOperation,
  generateTestItems,
  type DocumentLoader,
  type OpenApiOperation,
  type TestItem,
} from "@screen-spec/core";

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
  enabledWhen?: string;
  default?: unknown;
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

export interface ExpectedMessageView {
  kind: string;
  text?: string;
  key?: string;
}

export interface FieldExpectationView {
  field: string;
  value?: unknown;
  expression?: string;
  visible?: boolean;
  enabled?: boolean;
}

export interface ExpectationView {
  state?: string;
  navigate?: string;
  message?: ExpectedMessageView;
  fields: FieldExpectationView[];
}

export interface EventOutcomeView {
  to?: string;
  navigate?: string;
  expects?: ExpectationView;
}

export interface ErrorCaseView extends EventOutcomeView {
  status?: number;
  code?: string;
}

export interface EventView {
  key: string;
  trigger?: string;
  target?: string;
  from?: string;
  to?: string;
  apiCall?: string;
  expects?: ExpectationView;
  onSuccess?: EventOutcomeView;
  onError?: EventOutcomeView & { cases: ErrorCaseView[] };
}

export interface ApiBindingView {
  key: string;
  operationId: string;
  specRef: string;
  requestMappings: Array<{ scope: string; key: string; expr: string }>;
  responseMappings: Array<{ field: string; expr: string }>;
  /** specRef を解決した絶対 URL（Redoc/Swagger UI 連携用） */
  specUrl?: string;
  /** specRef を解決して得た実 operation（見つかれば） */
  operation?: OpenApiOperation;
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

export interface RoleAccessView {
  role: string;
  screenView?: boolean;
  /** フィールドキー→{view,edit}（"*" 既定を含む） */
  fields: Record<string, { view?: boolean; edit?: boolean }>;
  /** イベントキー→{execute}（"*" 既定を含む） */
  events: Record<string, { execute?: boolean }>;
}

export interface AccessControlView {
  roles: RoleAccessView[];
}

export interface ScreenView {
  id: string;
  name: string;
  description?: string;
  route?: string;
  params?: ParamsView;
  accessControl?: AccessControlView;
  fields: FieldView[];
  layout?: LayoutView;
  design?: DesignView;
  stateMachine?: StateMachineView;
  events: EventView[];
  apiBindings: ApiBindingView[];
  transitions: TransitionView[];
  testItems: TestItem[];
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
  enabledWhen?: string;
  default?: unknown;
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
  target?: string;
  action?: { apiCall?: string };
  expects?: RawExpectation;
  onSuccess?: RawEventOutcome;
  onError?: RawEventOutcome & { cases?: RawErrorCase[] };
}

interface RawExpectedMessage {
  kind?: string;
  text?: string;
  key?: string;
}

interface RawFieldExpectation {
  value?: unknown;
  expression?: string;
  visible?: boolean;
  enabled?: boolean;
}

interface RawExpectation {
  state?: string;
  navigate?: string;
  message?: RawExpectedMessage;
  fields?: Record<string, RawFieldExpectation>;
}

interface RawEventOutcome {
  to?: string;
  navigate?: string;
  expects?: RawExpectation;
}

interface RawErrorCase extends RawEventOutcome {
  when?: { status?: number; code?: string };
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
    accessControl?: {
      roles?: Record<
        string,
        {
          screen?: { view?: boolean };
          fields?: Record<string, { view?: boolean; edit?: boolean }>;
          events?: Record<string, { execute?: boolean }>;
        }
      >;
    };
    fields?: Record<string, RawField>;
    states?: Record<string, RawState>;
    events?: Record<string, RawEvent>;
    apiBindings?: Record<string, RawApiBinding>;
    transitions?: Record<string, RawTransition>;
  };
  testData?: {
    screen?: string;
    fixtures?: unknown[];
  };
}

function buildAccessControl(screen: SpecDoc["screen"]): AccessControlView | undefined {
  const roles = screen?.accessControl?.roles;
  if (!roles || Object.keys(roles).length === 0) return undefined;
  return {
    roles: Object.entries(roles).map(([role, ac]) => ({
      role,
      screenView: ac.screen?.view,
      fields: ac.fields ?? {},
      events: ac.events ?? {},
    })),
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
    for (const errorCase of ev.onError?.cases ?? []) {
      if (!ev.to || !errorCase.to) continue;
      const conditions = [
        errorCase.when?.status !== undefined ? String(errorCase.when.status) : undefined,
        errorCase.when?.code,
      ].filter(Boolean);
      edges.push({ from: ev.to, to: errorCase.to, label: `onError ${conditions.join(" / ")}` });
    }
  }
  return { states: nodes, edges };
}

function buildExpectation(raw: RawExpectation | undefined): ExpectationView | undefined {
  if (!raw) return undefined;
  const message = raw.message?.kind
    ? { kind: raw.message.kind, text: raw.message.text, key: raw.message.key }
    : undefined;
  const fields = Object.entries(raw.fields ?? {}).map(([field, expected]) => ({ field, ...expected }));
  return { state: raw.state, navigate: raw.navigate, message, fields };
}

function buildOutcome(raw: RawEventOutcome | undefined): EventOutcomeView | undefined {
  if (!raw) return undefined;
  return { to: raw.to, navigate: raw.navigate, expects: buildExpectation(raw.expects) };
}

function buildEvents(screen: SpecDoc["screen"]): EventView[] {
  return Object.entries(screen?.events ?? {}).map(([key, event]) => {
    const onError = event.onError
      ? {
          ...buildOutcome(event.onError),
          cases: (event.onError.cases ?? []).map((errorCase) => ({
            ...buildOutcome(errorCase),
            status: errorCase.when?.status,
            code: errorCase.when?.code,
          })),
        }
      : undefined;
    return {
      key,
      trigger: event.trigger,
      target: event.target,
      from: event.from,
      to: event.to,
      apiCall: event.action?.apiCall,
      expects: buildExpectation(event.expects),
      onSuccess: buildOutcome(event.onSuccess),
      onError,
    };
  });
}

/**
 * entryUri から spec を取得し、$ref 解決＋検証してビューモデルを返す。
 * @param entryUri エントリ spec の絶対 URL
 * @param load URI からテキストを取得するローダー（ブラウザは fetch）
 */
export async function buildScreenView(
  entryUri: string,
  load: DocumentLoader,
  testDataDocuments: SpecDoc[] = [],
): Promise<ScreenView> {
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

  // apiBindings の specRef を解決して実 operation を紐付ける。
  const apiBindings = buildApiBindings(resolved.screen);
  const openapiCache = new Map<string, unknown>();
  for (const b of apiBindings) {
    if (!b.specRef || !b.operationId) continue;
    try {
      const url = new URL(b.specRef, entryUri).href;
      b.specUrl = url;
      if (!openapiCache.has(url)) openapiCache.set(url, parseYaml(await load(url)));
      b.operation = findOperation(openapiCache.get(url), b.operationId);
    } catch {
      // 取得/解決に失敗しても表示は継続（検証側で warning 済み）
    }
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
      enabledWhen: typeof rf.enabledWhen === "string" ? rf.enabledWhen : undefined,
      default: rf.default,
      design: buildDesign(rf.design),
      validations,
      origin,
    };
  });

  const matchingTestData = testDataDocuments.find((document) =>
    document.testData?.screen === resolved.screen?.id
  )?.testData;

  return {
    id: String(resolved.screen?.id ?? ""),
    name: String(resolved.screen?.name ?? ""),
    description: resolved.screen?.description,
    route: resolved.screen?.route,
    params: buildParams(resolved.screen?.params),
    accessControl: buildAccessControl(resolved.screen),
    fields,
    layout: buildLayout(resolved.screen?.layout),
    design: buildDesign(resolved.screen?.design),
    stateMachine: buildStateMachine(resolved.screen),
    events: buildEvents(resolved.screen),
    apiBindings,
    transitions: Object.entries(resolved.screen?.transitions ?? {}).map(([key, t]) => ({
      key,
      to: String(t.to ?? ""),
      trigger: t.trigger,
    })),
    testItems: generateTestItems(resolved.screen, matchingTestData),
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
  let testDataDocuments: SpecDoc[] = [];
  try {
    const testDataManifestText = await load(new URL("test-data-manifest.json", specsBaseUri).href);
    const testDataFiles = JSON.parse(testDataManifestText) as string[];
    testDataDocuments = await Promise.all(
      testDataFiles.map(async (file) => parseYaml(await load(new URL(file, specsBaseUri).href)) as SpecDoc),
    );
  } catch {
    // testData manifest は任意。存在しない既存配信でも画面表示を継続する。
  }
  const screens = await Promise.all(
    files.map((file) => buildScreenView(new URL(file, specsBaseUri).href, load, testDataDocuments)),
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
