import { useMemo } from "react"
import { buildApiFlowViews, type ApiFlowMapping, type ApiFlowStatus } from "./api-flow"
import type { ScreenView } from "./screen-view"
import "./api-flow.css"

interface Props {
  screen: ScreenView
  selectedApi?: string
  onOpenEvent: (eventId: string) => void
}

export function ApiTab({ screen, selectedApi, onOpenEvent }: Props) {
  const flows = useMemo(() => buildApiFlowViews(screen), [screen])
  const diagnostics = screen.diagnostics.filter((item) => item.stage === "openapi" || item.path.includes("/apiBindings/") || item.message.includes("Screen Data"))
  const eventCount = new Set(flows.flatMap((flow) => flow.eventKeys)).size
  const issueCount = flows.reduce((total, flow) => total + flow.issueCount, 0)

  return (
    <section className="api-workspace" aria-labelledby="api-workspace-title">
      <header className="api-overview">
        <div>
          <p className="eyebrow">Data flow</p>
          <h2 id="api-workspace-title">API連携の全体像</h2>
          <p className="muted">Eventを起点に、送信する値とレスポンスの反映先を左から右へ追えます。</p>
        </div>
        <dl className="api-stats" aria-label="API連携サマリー">
          <div><dt>Endpoint</dt><dd>{flows.length}</dd></div>
          <div><dt>Event</dt><dd>{eventCount}</dd></div>
          <div><dt>Screen Data</dt><dd>{screen.screenData.length}</dd></div>
          <div className={issueCount ? "has-issues" : ""}><dt>要確認</dt><dd>{issueCount}</dd></div>
        </dl>
      </header>

      {diagnostics.length ? (
        <details className="api-diagnostics">
          <summary>診断を確認する <span className="badge badge-warning">{diagnostics.length}</span></summary>
          <ul className="diagnostic-list">
            {diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.path}:${index}`}>
                <span className={`badge ${diagnostic.severity === "error" ? "badge-ng" : "badge-warning"}`}>{diagnostic.severity}</span>
                {" "}{diagnostic.message}
                <small><code>{diagnostic.path}</code></small>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="api-flow-list">
        {flows.map((flow) => {
          const binding = flow.binding
          const operation = binding.operation
          return (
            <article
              key={flow.key}
              className={selectedApi === flow.key ? "api-flow-card selected-api" : "api-flow-card"}
              data-api-binding={flow.key}
              tabIndex={-1}
              aria-labelledby={`api-flow-${flow.key}`}
            >
              <header className="api-flow-head">
                <div>
                  <p className="eyebrow">API Binding · <code>{flow.key}</code></p>
                  <h3 id={`api-flow-${flow.key}`}>
                    {flow.endpoint.method ? <span className={`method method-${flow.endpoint.method.toLowerCase()}`}>{flow.endpoint.method}</span> : null}
                    <code>{flow.endpoint.path ?? binding.operationId}</code>
                  </h3>
                  <p>{flow.endpoint.summary ?? (flow.endpoint.status === "unresolved" ? "OpenAPI Operationを解決できません" : "")}</p>
                </div>
                {flow.issueCount
                  ? <span className="api-health api-health-issue">要確認 {flow.issueCount}</span>
                  : <span className="api-health api-health-ok">✓ 整合</span>}
              </header>

              <div className="api-flow" aria-label={`${flow.key}のデータフロー`}>
                <section className="api-flow-stage api-flow-trigger">
                  <StageTitle number="1" label="起点Event" />
                  {flow.eventKeys.length
                    ? <div className="api-event-list">{flow.eventKeys.map((eventKey) => <button key={eventKey} type="button" className="api-event-chip" onClick={() => onOpenEvent(eventKey)}><code>{eventKey}</code><span aria-hidden="true">↗</span></button>)}</div>
                    : <p className="api-empty">Eventからの利用なし</p>}
                </section>
                <FlowArrow />
                <section className="api-flow-stage">
                  <StageTitle number="2" label="Request" hint="画面の値 → APIへ" />
                  <ApiMappingList mappings={flow.request} empty="送信Mappingなし" />
                </section>
                <FlowArrow />
                <section className="api-flow-stage api-flow-endpoint">
                  <StageTitle number="3" label="Endpoint" />
                  {flow.endpoint.status === "resolved"
                    ? <><span className={`method method-${flow.endpoint.method?.toLowerCase()}`}>{flow.endpoint.method}</span><code className="api-endpoint-path">{flow.endpoint.path}</code></>
                    : <span className="badge badge-ng">未解決</span>}
                </section>
                <FlowArrow />
                <section className="api-flow-stage">
                  <StageTitle number="4" label="Response" hint="APIから → Screen Data" />
                  <ApiMappingList mappings={flow.response} empty="反映Mappingなし" />
                </section>
              </div>

              <details className="api-contract-details">
                <summary>OpenAPI契約と外部ツール</summary>
                <dl>
                  <div><dt>operationId</dt><dd><code>{binding.operationId}</code></dd></div>
                  <div><dt>specRef</dt><dd><code>{binding.specRef}</code></dd></div>
                  {operation?.parameters.length ? <div><dt>parameters</dt><dd>{operation.parameters.map((parameter) => <code key={`${parameter.in}:${parameter.name}`} className="op-param">{parameter.in}:{parameter.name}{parameter.required ? "*" : ""}</code>)}</dd></div> : null}
                  {operation ? <div><dt>response paths</dt><dd><code>{operation.responseFields.join(", ") || "—"}</code></dd></div> : null}
                </dl>
                {binding.specUrl ? <p className="op-links"><a href={`https://redocly.github.io/redoc/?url=${encodeURIComponent(binding.specUrl)}#operation/${binding.operationId}`} target="_blank" rel="noreferrer">Redoc ↗</a><a href={`https://petstore.swagger.io/?url=${encodeURIComponent(binding.specUrl)}`} target="_blank" rel="noreferrer">Swagger UI ↗</a><a href={binding.specUrl} target="_blank" rel="noreferrer">Raw OpenAPI ↗</a></p> : null}
              </details>
            </article>
          )
        })}
      </div>

      {screen.screenData.length ? (
        <section className="api-data-coverage" aria-labelledby="api-data-title">
          <div><p className="eyebrow">Destination</p><h3 id="api-data-title">Screen Dataの供給状況</h3></div>
          <ul>{screen.screenData.map((data) => <li key={data.key}><div><code>data.{data.key}</code>{data.description ? <span>{data.description}</span> : null}</div>{data.producers.length ? <span className="api-health api-health-ok">✓ {data.producers.length} API</span> : <span className="api-health api-health-issue">供給元なし</span>}</li>)}</ul>
        </section>
      ) : null}
    </section>
  )
}

function StageTitle({ number, label, hint }: { number: string; label: string; hint?: string }) {
  return <header className="api-stage-title"><span aria-hidden="true">{number}</span><div><h4>{label}</h4>{hint ? <p>{hint}</p> : null}</div></header>
}

function FlowArrow() {
  return <span className="api-flow-arrow" aria-hidden="true">→</span>
}

function ApiMappingList({ mappings, empty }: { mappings: ApiFlowMapping[]; empty: string }) {
  if (mappings.length === 0) return <p className="api-empty">{empty}</p>
  return <ul className="api-mapping-list">{mappings.map((mapping, index) => <li key={`${mapping.source}:${mapping.destination}:${index}`}><div><code>{mapping.source}</code><span aria-hidden="true">→</span><code>{mapping.destination}</code></div><MappingStatus status={mapping.status} /></li>)}</ul>
}

function MappingStatus({ status }: { status: ApiFlowStatus }) {
  if (status === "valid") return <span className="api-mapping-status is-valid"><span aria-hidden="true">✓</span> 確認済み</span>
  if (status === "invalid") return <span className="api-mapping-status is-invalid"><span aria-hidden="true">!</span> OpenAPIと不一致</span>
  return <span className="api-mapping-status is-unknown"><span aria-hidden="true">?</span> 未検証</span>
}
