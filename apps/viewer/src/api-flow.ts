import type { ApiBindingView, ScreenView } from "./screen-view"

export type ApiFlowStatus = "valid" | "invalid" | "unverifiable"

export interface ApiFlowMapping {
  source: string
  destination: string
  status: ApiFlowStatus
}

export interface ApiFlowView {
  key: string
  binding: ApiBindingView
  eventKeys: string[]
  endpoint: {
    method?: string
    path?: string
    summary?: string
    status: "resolved" | "unresolved"
  }
  request: ApiFlowMapping[]
  response: ApiFlowMapping[]
  issueCount: number
}

function requestStatus(binding: ApiBindingView, scope: string, key: string): ApiFlowStatus {
  const operation = binding.operation
  if (!operation) return "unverifiable"
  if (scope === "body") return operation.requestFields.includes(key) ? "valid" : "invalid"
  if (scope === "query" || scope === "path") {
    return operation.parameters.some((parameter) => parameter.in === scope && parameter.name === key)
      ? "valid"
      : "invalid"
  }
  return "unverifiable"
}

export function buildApiFlowViews(screen: ScreenView): ApiFlowView[] {
  return screen.apiBindings.map((binding) => {
    const eventKeys = screen.events
      .filter((event) => event.apiCall === binding.key || event.branches.some((branch) => branch.apiCall === binding.key))
      .map((event) => event.key)
    const request = binding.requestMappings.map((mapping) => ({
      source: mapping.expr,
      destination: `${mapping.scope}.${mapping.key}`,
      status: requestStatus(binding, mapping.scope, mapping.key),
    }))
    const response = binding.responseMappings.map((mapping) => ({
      source: mapping.expr,
      destination: mapping.target,
      status: mapping.pathStatus ?? "unverifiable",
    }))
    const mappingIssues = [...request, ...response].filter((mapping) => mapping.status === "invalid").length

    return {
      key: binding.key,
      binding,
      eventKeys,
      endpoint: {
        method: binding.operation?.method.toUpperCase(),
        path: binding.operation?.path,
        summary: binding.operation?.summary,
        status: binding.operation ? "resolved" : "unresolved",
      },
      request,
      response,
      issueCount: mappingIssues + (binding.operation ? 0 : 1),
    }
  })
}
