import { describe, expect, it } from 'vitest'
import { buildScreenView } from './screen-view'

const spec = `specVersion: "0.1"
screen:
  id: review
  name: Review
  fields:
    role:
      label: Role
      type: select
      options:
        - { value: admin, label: Administrator }
      visibleWhen: fields.missing == true
`

describe('Field Review Workspace view model', () => {
  it('Fieldのoptionsと構造化診断を保持する', async () => {
    const view = await buildScreenView('https://example.test/review.yaml', async () => spec)
    expect(view.fields[0].options).toEqual([{ value: 'admin', label: 'Administrator' }])
    expect(view.diagnostics.some((diagnostic) => diagnostic.severity === 'warning' && diagnostic.path.endsWith('/role'))).toBe(true)
  })

  it("動的Optionsの供給元とOpenAPI path照合状態を保持する", async () => {
    const dynamicSpec = `specVersion: "0.1"
screen:
  id: dynamic
  name: Dynamic
  fields:
    role: { label: Role, type: select }
  data:
    roles:
      schema:
        type: array
        items:
          type: object
          properties:
            id: { type: string }
            name: { type: string }
  fieldBindings:
    role:
      options:
        source: data.roles
        item: { value: id, label: name }
      loading: { source: api.getRoles.loading }
  apiBindings:
    getRoles:
      openapi: { operationId: getRoles, specRef: ./api.yaml }
      response:
        mapping:
          data.roles: data.roles`;
    const api = `openapi: 3.1.0
info: { title: API, version: 1.0.0 }
paths:
  /roles:
    get:
      operationId: getRoles
      responses:
        "200":
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: object
                    properties:
                      roles:
                        type: array
                        items:
                          type: object
                          properties:
                            id: { type: string }
                            name: { type: string }`;
    const view = await buildScreenView("https://example.test/dynamic.yaml", async (uri) => uri.endsWith("/api.yaml") ? api : dynamicSpec)
    expect(view.valid).toBe(true)
    expect(view.apiBindings[0].responseMappings).toEqual([{ target: "data.roles", expr: "data.roles", pathStatus: "valid" }])
    expect(view.screenData).toEqual([{ key: "roles", producers: [{ apiBinding: "getRoles", responsePath: "data.roles", pathStatus: "valid" }] }])
    expect(view.fields[0].binding?.options).toEqual({
      source: "data.roles", valuePath: "id", labelPath: "name",
      apiBinding: "getRoles", responsePath: "data.roles", pathStatus: "valid",
    })
  })
})


describe("UI Component Screen Elements view model", () => {
  it("Instance Bindingと定義順itemsを保持する", async () => {
    const screen = `specVersion: "0.1"
screen:
  id: users
  name: Users
  layout:
    sections:
      - id: results
        items:
          - field: keyword
          - component: pagination
        fields: [keyword]
  fields:
    keyword: { label: Keyword, type: text }
  ui:
    pagination:
      component: { $ref: "./common.yaml#/components/ui/Pagination" }
      bindings:
        pageNumbers.value: { value: 1 }
      events:
        pageChange: changePage
  states:
    loaded: { initial: true }
  events:
    changePage: { trigger: { component: pagination, event: pageChange }, from: loaded, to: loaded }
`;
    const common = `specVersion: "0.1"
components:
  ui:
    Pagination:
      name: Pagination
      fields:
        pageNumbers: { label: Page numbers, type: list, eventId: pageChange, eventContext: { page: { type: integer } } }
`;
    const view = await buildScreenView("https://example.test/users.yaml", async (uri) => uri.endsWith("/common.yaml") ? common : screen)
    expect(view.valid).toBe(true)
    expect(view.uiInstances[0]).toMatchObject({ key: "pagination", componentRef: "./common.yaml#/components/ui/Pagination", bindings: [{ target: "pageNumbers.value", value: 1 }], events: [{ fieldEvent: "pageChange", screenEvent: "changePage" }] })
    expect(view.layout?.sections[0].items).toEqual([{ kind: "field", key: "keyword" }, { kind: "component", key: "pagination" }])
    expect(view.events[0].trigger).toBe("pagination.pageChange")
    expect(view.events[0].context).toEqual([{ name: "page", type: "integer" }])
  })
})
