// ブラウザ安全な主エントリ（node:fs に依存しない）。
// Node 専用の fs ローダー・validateDocument は "@screen-spec/core/node" を参照。
export { parseYaml } from "./parse.js";
export { resolveRefs, findResidualRefs, RefError, type DocumentLoader } from "./resolve.js";
export {
  validateSpec,
  type ValidateResult,
  type ValidationIssue,
  type ValidationStage,
} from "./validate.js";
export {
  analyzeScreen,
  analyzeProject,
  analyzeTestData,
  type Diagnostic,
  type DiagnosticSeverity,
  type ProjectScreen,
} from "./analyze.js";
export {
  findOperation,
  type OpenApiOperation,
  type OpenApiParameter,
} from "./openapi.js";
export {
  VALIDATION_RULES,
  isKnownRule,
  type ValidationRuleSpec,
  type RuleValueKind,
} from "./validation-rules.js";
export {
  parseTemplate,
  templateRefs,
  parseCondition,
  type ParsedTemplate,
  type ExprPart,
  type RefExpr,
  type LiteralExpr,
  type ParsedCondition,
  type ConditionNode,
  type Comparison,
  type CompareOp,
  type CondOperand,
} from "./expr.js";
