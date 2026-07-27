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
  type ProjectTestData,
} from "./analyze.js";
export {
  findOperation,
  hasResponsePath,
  type OpenApiOperation,
  type OpenApiParameter,
} from "./openapi.js";
export {
  buildComponentUsageGraph,
  type ComponentDefinition,
  type ComponentImpact,
  type ComponentKind,
  type ComponentUsage,
  type ComponentUsageGraph,
  type ComponentUsageLocation,
  type ProjectSpecDocument,
} from "./component-usage.js";
export {
  VALIDATION_RULES,
  isKnownRule,
  type ValidationRuleSpec,
  type RuleValueKind,
} from "./validation-rules.js";
export {
  generateTestItems,
  testItemsToMarkdown,
  testItemsToCsv,
  type TestItem,
  type TestCategory,
} from "./testgen.js";
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
