import type { Diagnostic } from "./analyze.js";

export type ComponentKind = "field" | "validation" | "options" | "ui";
export type ComponentUsageLocation = "field-origin" | "validation" | "options" | "ui-instance";
export interface ProjectSpecDocument { uri: string; document: unknown }
export interface ComponentDefinition { id: string; uri: string; pointer: string; name: string; kind: ComponentKind; contract: unknown }
export interface ComponentUsage { componentId: string; sourceUri: string; sourcePath: string; location: ComponentUsageLocation; screenId?: string; fieldId?: string; instanceId?: string; referrerComponentId?: string }
export interface ComponentImpact { componentId: string; screenId: string; fieldId: string }
export interface ComponentInstanceImpact { componentId: string; screenId: string; instanceId: string }
export interface ComponentUsageGraph { components: ComponentDefinition[]; usages: ComponentUsage[]; impacts: ComponentImpact[]; instanceImpacts: ComponentInstanceImpact[]; diagnostics: Diagnostic[] }

const KIND_BY_GROUP: Record<string, ComponentKind> = { fields: "field", validations: "validation", options: "options", ui: "ui" };
function record(value: unknown): Record<string, unknown> | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function escapePointer(value: string): string { return value.replaceAll("~", "~0").replaceAll("/", "~1") }
function componentTarget(ref: string, sourceUri: string): { id: string; location: ComponentUsageLocation } | undefined {
  const target = new URL(ref, sourceUri);
  const match = target.hash.match(/^#(\/components\/(fields|validations|options|ui)\/[^/]+)$/);
  if (!match) return undefined;
  const location = match[2] === "fields" ? "field-origin" : match[2] === "validations" ? "validation" : match[2] === "options" ? "options" : "ui-instance";
  target.hash = "";
  return { id: `${target.href}#${match[1]}`, location };
}
function refsIn(value: unknown, sourceUri: string, sourcePath: string, context: Omit<ComponentUsage, "componentId" | "sourceUri" | "sourcePath" | "location">): ComponentUsage[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => refsIn(item, sourceUri, `${sourcePath}/${index}`, context));
  const object = record(value);
  if (!object) return [];
  if (typeof object.$ref === "string") {
    const target = componentTarget(object.$ref, sourceUri);
    return target ? [{ componentId: target.id, sourceUri, sourcePath, location: target.location, ...context }] : [];
  }
  return Object.entries(object).flatMap(([key, item]) => refsIn(item, sourceUri, `${sourcePath}/${escapePointer(key)}`, context));
}

export function buildComponentUsageGraph(documents: ProjectSpecDocument[]): ComponentUsageGraph {
  const components: ComponentDefinition[] = [], usages: ComponentUsage[] = [], diagnostics: Diagnostic[] = [];
  for (const { uri, document } of documents) {
    const root = record(document), groups = record(root?.components);
    for (const [group, kind] of Object.entries(KIND_BY_GROUP)) {
      const definitions = record(groups?.[group]);
      for (const [name, contract] of Object.entries(definitions ?? {})) {
        const pointer = `/components/${group}/${escapePointer(name)}`, id = `${uri.split("#")[0]}#${pointer}`;
        components.push({ id, uri: uri.split("#")[0], pointer, name, kind, contract });
        const contractRecord = record(contract);
        if (contractRecord && Object.keys(contractRecord).length === 1 && typeof contractRecord.$ref === "string") diagnostics.push({ severity: "error", code: "component-alias", message: `Component "${name}" は別Componentのaliasにできません。`, where: `${uri}${pointer}` });
        usages.push(...refsIn(contract, uri, pointer, { referrerComponentId: id }));
      }
    }
    const screen = record(root?.screen), screenId = typeof screen?.id === "string" ? screen.id : undefined, fields = record(screen?.fields);
    if (screenId) for (const [fieldId, field] of Object.entries(fields ?? {})) usages.push(...refsIn(field, uri, `/screen/fields/${escapePointer(fieldId)}`, { screenId, fieldId }));
    const instances = record(screen?.ui);
    if (screenId) for (const [instanceId, instance] of Object.entries(instances ?? {})) usages.push(...refsIn(instance, uri, `/screen/ui/${escapePointer(instanceId)}`, { screenId, instanceId }));
  }
  const outgoing = new Map<string, string[]>();
  for (const usage of usages) if (usage.referrerComponentId) outgoing.set(usage.referrerComponentId, [...(outgoing.get(usage.referrerComponentId) ?? []), usage.componentId]);
  const impacts: ComponentImpact[] = [], impactKeys = new Set<string>();
  for (const usage of usages.filter((item) => item.screenId && item.fieldId)) {
    const pending = [usage.componentId], visited = new Set<string>();
    while (pending.length) {
      const componentId = pending.pop()!;
      if (visited.has(componentId)) continue;
      visited.add(componentId);
      const key = `${componentId}\0${usage.screenId}\0${usage.fieldId}`;
      if (!impactKeys.has(key)) { impactKeys.add(key); impacts.push({ componentId, screenId: usage.screenId!, fieldId: usage.fieldId! }); }
      pending.push(...(outgoing.get(componentId) ?? []));
    }
  }
  const instanceImpacts: ComponentInstanceImpact[] = [], instanceImpactKeys = new Set<string>();
  for (const usage of usages.filter((item) => item.screenId && item.instanceId)) {
    const pending = [usage.componentId], visited = new Set<string>();
    while (pending.length) {
      const componentId = pending.pop()!;
      if (visited.has(componentId)) continue;
      visited.add(componentId);
      const key = `${componentId}\0${usage.screenId}\0${usage.instanceId}`;
      if (!instanceImpactKeys.has(key)) { instanceImpactKeys.add(key); instanceImpacts.push({ componentId, screenId: usage.screenId!, instanceId: usage.instanceId! }); }
      pending.push(...(outgoing.get(componentId) ?? []));
    }
  }
  const definedIds = new Set(components.map((component) => component.id));
  for (const usage of usages) if (!definedIds.has(usage.componentId)) diagnostics.push({ severity: "warning", code: "unknown-component", message: `参照先Componentがプロジェクト文書に含まれていません: ${usage.componentId}`, where: `${usage.sourceUri}${usage.sourcePath}` });
  for (const component of components) if (!impacts.some((impact) => impact.componentId === component.id) && !instanceImpacts.some((impact) => impact.componentId === component.id)) diagnostics.push({ severity: "warning", code: "unused-component", message: `Component "${component.name}" はどのFieldまたはComponent Instanceにも到達しません。`, where: component.id });
  return { components, usages, impacts, instanceImpacts, diagnostics };
}
