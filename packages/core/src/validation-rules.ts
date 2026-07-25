// バリデーションルールの形式化（ADR 0002・優先度1）。
// 既知ルールの語彙と value の型を定義し、テスト項目（境界値・同値分割）の
// 自動導出と実装の意味論を安定させる。未知ルールは許容するが analyzer が warning を出す。

/** value の受け取り方。 */
export type RuleValueKind = "none" | "integer" | "number" | "string" | "array";

export interface ValidationRuleSpec {
  /** value の種類 */
  value: RuleValueKind;
  /** 対象の想定（テスト導出のヒント） */
  applies: "string" | "number" | "date" | "any";
  description: string;
}

/** 既知のバリデーションルール語彙。 */
export const VALIDATION_RULES: Record<string, ValidationRuleSpec> = {
  required: { value: "none", applies: "any", description: "必須（空でない）" },
  minLength: { value: "integer", applies: "string", description: "最小文字数" },
  maxLength: { value: "integer", applies: "string", description: "最大文字数" },
  pattern: { value: "string", applies: "string", description: "正規表現に一致" },
  email: { value: "none", applies: "string", description: "メール形式" },
  url: { value: "none", applies: "string", description: "URL 形式" },
  enum: { value: "array", applies: "any", description: "許可値のいずれか" },
  min: { value: "number", applies: "number", description: "最小値" },
  max: { value: "number", applies: "number", description: "最大値" },
  step: { value: "number", applies: "number", description: "刻み" },
  minDate: { value: "string", applies: "date", description: "最小日付" },
  maxDate: { value: "string", applies: "date", description: "最大日付" },
};

/** 既知ルールか。 */
export function isKnownRule(rule: string): boolean {
  return Object.prototype.hasOwnProperty.call(VALIDATION_RULES, rule);
}
