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
