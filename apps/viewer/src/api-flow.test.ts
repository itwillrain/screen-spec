import { describe, expect, it } from "vitest"
import { buildApiFlowViews } from "./api-flow"
import type { ScreenView } from "./screen-view"

describe("API Flow ViewModel", () => {
  it("EventからRequest、Endpoint、Response、Screen Dataまでを一つの流れにする", () => {
    const screen = {
      events: [
        { key: "save", apiCall: "updateUser", branches: [] },
        { key: "retry", branches: [{ id: "retry-server", apiCall: "updateUser" }] },
      ],
      apiBindings: [{
        key: "updateUser",
        operationId: "updateUser",
        specRef: "../../openapi/users.yaml",
        operation: {
          method: "PUT",
          path: "/users/{userId}",
          summary: "ユーザー更新",
          parameters: [{ in: "path", name: "userId", required: true }],
          requestFields: ["name"],
          responseFields: ["data.user"],
        },
        requestMappings: [
          { scope: "path", key: "userId", expr: "params.userId" },
          { scope: "body", key: "name", expr: "fields.name" },
        ],
        responseMappings: [
          { target: "data.user", expr: "data.user", pathStatus: "valid" },
        ],
      }],
    } as unknown as ScreenView

    expect(buildApiFlowViews(screen)).toEqual([expect.objectContaining({
      key: "updateUser",
      eventKeys: ["save", "retry"],
      endpoint: expect.objectContaining({ method: "PUT", path: "/users/{userId}" }),
      request: [
        { source: "params.userId", destination: "path.userId", status: "valid" },
        { source: "fields.name", destination: "body.name", status: "valid" },
      ],
      response: [
        { source: "data.user", destination: "data.user", status: "valid" },
      ],
      issueCount: 0,
    })])
  })

  it("OpenAPIとの差分と未解決Operationを利用者向け状態へ変換する", () => {
    const screen = {
      events: [],
      apiBindings: [
        {
          key: "searchUsers",
          operationId: "searchUsers",
          specRef: "users.yaml",
          operation: {
            method: "GET",
            path: "/users",
            parameters: [],
            requestFields: [],
            responseFields: [],
          },
          requestMappings: [{ scope: "query", key: "role", expr: "fields.role" }],
          responseMappings: [{ target: "data.users", expr: "missing.path", pathStatus: "invalid" }],
        },
        {
          key: "missing",
          operationId: "missing",
          specRef: "users.yaml",
          requestMappings: [],
          responseMappings: [],
        },
      ],
    } as unknown as ScreenView

    const [invalid, unresolved] = buildApiFlowViews(screen)
    expect(invalid.request[0].status).toBe("invalid")
    expect(invalid.response[0].status).toBe("invalid")
    expect(invalid.issueCount).toBe(2)
    expect(unresolved.endpoint.status).toBe("unresolved")
    expect(unresolved.issueCount).toBe(1)
  })
})
