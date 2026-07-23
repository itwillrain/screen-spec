// 状態機械（states/events）の意味解析（決定 #10・案C）。
//  - 未定義の状態参照は error（構造的な誤り）
//  - initial の 0 個 / 複数、到達不能な状態は warning（設計途中を許容）
// JSON Schema では表現できないクロス参照・到達性を補完する。

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  /** 関連する状態/イベントのキー（任意） */
  where?: string;
}

interface EventLike {
  from?: unknown;
  to?: unknown;
  onSuccess?: { to?: unknown };
  onError?: { to?: unknown };
}

interface ScreenLike {
  states?: Record<string, { initial?: unknown }>;
  events?: Record<string, EventLike>;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * 解決済み screen オブジェクトを解析し、診断を返す。
 * states が無い画面では何も報告しない（状態遷移は任意）。
 */
export function analyzeScreen(screen: unknown): Diagnostic[] {
  if (screen === null || typeof screen !== "object") return [];
  const s = screen as ScreenLike;
  const states = s.states;
  const events = s.events ?? {};

  // states が無ければ状態遷移解析はスキップ。events だけあるのは不整合。
  if (!states || typeof states !== "object") {
    if (Object.keys(events).length > 0) {
      return [
        {
          severity: "error",
          code: "events-without-states",
          message: "events が定義されていますが states がありません。",
        },
      ];
    }
    return [];
  }

  const diagnostics: Diagnostic[] = [];
  const stateKeys = new Set(Object.keys(states));

  // initial の個数
  const initials = Object.entries(states)
    .filter(([, v]) => v && typeof v === "object" && v.initial === true)
    .map(([k]) => k);
  if (initials.length === 0) {
    diagnostics.push({
      severity: "warning",
      code: "no-initial-state",
      message: "初期状態（initial: true）が指定されていません。",
    });
  } else if (initials.length > 1) {
    diagnostics.push({
      severity: "warning",
      code: "multiple-initial-states",
      message: `初期状態が複数あります: ${initials.join(", ")}`,
    });
  }

  // 遷移エッジを集めつつ、未定義の状態参照を検出する
  const edges: Array<[string, string]> = [];
  const checkRef = (key: string, field: string, value: unknown): string | undefined => {
    const name = asString(value);
    if (name === undefined) return undefined;
    if (!stateKeys.has(name)) {
      diagnostics.push({
        severity: "error",
        code: "undefined-state-ref",
        message: `event "${key}" の ${field} が未定義の状態 "${name}" を参照しています。`,
        where: key,
      });
      return undefined;
    }
    return name;
  };

  for (const [key, ev] of Object.entries(events)) {
    const from = checkRef(key, "from", ev.from);
    const to = checkRef(key, "to", ev.to);
    const onSuccess = checkRef(key, "onSuccess.to", ev.onSuccess?.to);
    const onError = checkRef(key, "onError.to", ev.onError?.to);
    if (from && to) edges.push([from, to]);
    // action の結果分岐は to（即時遷移先）を起点とみなす
    if (to && onSuccess) edges.push([to, onSuccess]);
    if (to && onError) edges.push([to, onError]);
  }

  // 到達可能性（初期状態が1つ以上あるときのみ）。到達不能な状態は warning。
  if (initials.length >= 1) {
    const adjacency = new Map<string, string[]>();
    for (const [a, b] of edges) {
      const list = adjacency.get(a) ?? [];
      list.push(b);
      adjacency.set(a, list);
    }
    const reached = new Set<string>(initials);
    const queue = [...initials];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const next of adjacency.get(cur) ?? []) {
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    for (const key of stateKeys) {
      if (!reached.has(key)) {
        diagnostics.push({
          severity: "warning",
          code: "unreachable-state",
          message: `状態 "${key}" は初期状態から到達できません。`,
          where: key,
        });
      }
    }
  }

  return diagnostics;
}
