// 式（テンプレート）エンジン。設計書は実行されないため、評価器ではなく
// 「パーサ＋AST＋参照抽出」を提供する（決定 #11 の式表現を形式化）。
//
// テンプレート = リテラル文字列と {参照} の並び。
//   例: "{fields.name}", "{fields.first} {fields.last}", "/users/{screen.route.userId}"
// 参照 = ドット区切りのパス（例 fields.name / screen.route.userId）。

/** {式} で表される参照。root は先頭セグメント、path は残り。 */
export interface RefExpr {
  type: "ref";
  root: string;
  path: string[];
  /** {} 内の元テキスト（トリム済み） */
  raw: string;
}

export interface LiteralExpr {
  type: "literal";
  text: string;
}

export type ExprPart = RefExpr | LiteralExpr;

export interface ParsedTemplate {
  parts: ExprPart[];
  /** 構文エラー（未閉じ括弧・空式・不正パスなど） */
  errors: string[];
}

/** テンプレート文字列をリテラルと参照の列にパースする。 */
export function parseTemplate(input: string): ParsedTemplate {
  const parts: ExprPart[] = [];
  const errors: string[] = [];
  let literal = "";
  let i = 0;

  const flushLiteral = (): void => {
    if (literal.length > 0) {
      parts.push({ type: "literal", text: literal });
      literal = "";
    }
  };

  while (i < input.length) {
    const ch = input[i];
    if (ch === "{") {
      const end = input.indexOf("}", i + 1);
      if (end === -1) {
        errors.push(`未閉じの '{' があります: "${input.slice(i)}"`);
        literal += input.slice(i);
        break;
      }
      flushLiteral();
      const inner = input.slice(i + 1, end).trim();
      if (inner === "") {
        errors.push("空の式 {} があります。");
      } else {
        const segments = inner.split(".").map((s) => s.trim());
        if (segments.some((s) => s === "")) {
          errors.push(`不正な式パスです: "{${inner}}"`);
        } else {
          parts.push({ type: "ref", root: segments[0], path: segments.slice(1), raw: inner });
        }
      }
      i = end + 1;
    } else if (ch === "}") {
      errors.push("対応しない '}' があります。");
      literal += ch;
      i += 1;
    } else {
      literal += ch;
      i += 1;
    }
  }
  flushLiteral();
  return { parts, errors };
}

/** テンプレート内の参照だけを取り出す（構文エラーは無視）。 */
export function templateRefs(input: string): RefExpr[] {
  return parseTemplate(input).parts.filter((p): p is RefExpr => p.type === "ref");
}

// ---- 条件式（visibleWhen 等）----------------------------------------------
// 文法（括弧なし・左結合）:
//   condition := andExpr ('||' andExpr)*
//   andExpr   := comparison ('&&' comparison)*
//   comparison:= operand OP operand         OP ∈ == != > < >= <=
//   operand   := ref | string | number | bool | null

export type CompareOp = "==" | "!=" | ">" | "<" | ">=" | "<=";

export type CondOperand =
  | { type: "ref"; root: string; path: string[]; raw: string }
  | { type: "literal"; value: string | number | boolean | null; raw: string };

export interface Comparison {
  type: "comparison";
  left: CondOperand;
  op: CompareOp;
  right: CondOperand;
}

export interface LogicalNode {
  type: "and" | "or";
  parts: ConditionNode[];
}

export type ConditionNode = Comparison | LogicalNode;

export interface ParsedCondition {
  ast?: ConditionNode;
  errors: string[];
  refs: RefExpr[];
}

interface Tok {
  t: "op" | "and" | "or" | "string" | "number" | "bool" | "null" | "ref";
  v: string;
}

const TWO_CHAR_OPS = new Set(["==", "!=", ">=", "<="]);

function tokenize(input: string): { tokens: Tok[]; errors: string[] } {
  const tokens: Tok[] = [];
  const errors: string[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    const two = input.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ t: "op", v: two });
      i += 2;
      continue;
    }
    if (two === "&&") {
      tokens.push({ t: "and", v: two });
      i += 2;
      continue;
    }
    if (two === "||") {
      tokens.push({ t: "or", v: two });
      i += 2;
      continue;
    }
    if (c === ">" || c === "<") {
      tokens.push({ t: "op", v: c });
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = input.indexOf(c, i + 1);
      if (end === -1) {
        errors.push(`未閉じの文字列: ${input.slice(i)}`);
        break;
      }
      tokens.push({ t: "string", v: input.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(input[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < input.length && /[0-9.]/.test(input[j])) j += 1;
      tokens.push({ t: "number", v: input.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_.]/.test(input[j])) j += 1;
      const word = input.slice(i, j);
      i = j;
      if (word === "true" || word === "false") tokens.push({ t: "bool", v: word });
      else if (word === "null") tokens.push({ t: "null", v: word });
      else tokens.push({ t: "ref", v: word });
      continue;
    }
    errors.push(`不正な文字: '${c}'`);
    i += 1;
  }
  return { tokens, errors };
}

function parseTokens(tokens: Tok[], errors: string[]): ConditionNode | undefined {
  let pos = 0;
  const peek = (): Tok | undefined => tokens[pos];
  const next = (): Tok | undefined => tokens[pos++];

  const parseOperand = (): CondOperand | undefined => {
    const tk = next();
    if (!tk) {
      errors.push("式が途中で終了しました。");
      return undefined;
    }
    switch (tk.t) {
      case "ref": {
        const segs = tk.v.split(".");
        return { type: "ref", root: segs[0], path: segs.slice(1), raw: tk.v };
      }
      case "string":
        return { type: "literal", value: tk.v, raw: `"${tk.v}"` };
      case "number":
        return { type: "literal", value: Number(tk.v), raw: tk.v };
      case "bool":
        return { type: "literal", value: tk.v === "true", raw: tk.v };
      case "null":
        return { type: "literal", value: null, raw: "null" };
      default:
        errors.push(`オペランドが必要ですが '${tk.v}' が来ました。`);
        return undefined;
    }
  };

  const parseComparison = (): ConditionNode | undefined => {
    const left = parseOperand();
    if (!left) return undefined;
    const opTok = peek();
    if (!opTok || opTok.t !== "op") {
      errors.push("比較演算子（== != > < >= <=）が必要です。");
      return undefined;
    }
    next();
    const right = parseOperand();
    if (!right) return undefined;
    return { type: "comparison", left, op: opTok.v as CompareOp, right };
  };

  const parseAnd = (): ConditionNode | undefined => {
    const first = parseComparison();
    if (!first) return undefined;
    const parts = [first];
    while (peek()?.t === "and") {
      next();
      const n = parseComparison();
      if (!n) return undefined;
      parts.push(n);
    }
    return parts.length === 1 ? first : { type: "and", parts };
  };

  const parseOr = (): ConditionNode | undefined => {
    const first = parseAnd();
    if (!first) return undefined;
    const parts = [first];
    while (peek()?.t === "or") {
      next();
      const n = parseAnd();
      if (!n) return undefined;
      parts.push(n);
    }
    return parts.length === 1 ? first : { type: "or", parts };
  };

  const ast = parseOr();
  if (ast && pos < tokens.length) {
    errors.push(`余分なトークン: '${tokens[pos].v}'`);
  }
  return ast;
}

function collectCondRefs(node: ConditionNode): RefExpr[] {
  const refs: RefExpr[] = [];
  const walk = (n: ConditionNode): void => {
    if (n.type === "comparison") {
      for (const op of [n.left, n.right]) {
        if (op.type === "ref") refs.push({ type: "ref", root: op.root, path: op.path, raw: op.raw });
      }
    } else {
      n.parts.forEach(walk);
    }
  };
  walk(node);
  return refs;
}

/** 条件式（visibleWhen 等）をパースし、AST・構文エラー・参照を返す。 */
export function parseCondition(input: string): ParsedCondition {
  const { tokens, errors } = tokenize(input);
  if (tokens.length === 0) {
    if (errors.length === 0) errors.push("空の条件式です。");
    return { ast: undefined, errors, refs: [] };
  }
  const ast = parseTokens(tokens, errors);
  return { ast, errors, refs: ast ? collectCondRefs(ast) : [] };
}
