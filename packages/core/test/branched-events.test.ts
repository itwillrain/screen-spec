import { describe, expect, it } from "vitest";
import { analyzeScreen, generateTestItems, validateSpec, type DocumentLoader } from "../src/index.js";

const loader: DocumentLoader = () => { throw new Error("no external refs"); };
const base = `specVersion: "0.1"
screen:
  id: branched
  name: Branched
  fields:
    role: { label: Role, type: select }
  states:
    viewing: { initial: true }
    editing: {}
  events:
    edit:
      from: viewing
`;

describe("分岐イベント", () => {
  it("順序付き分岐と末尾fallbackは妥当", async () => {
    const result = await validateSpec(`${base}      branches:\n        - { id: editable, when: 'fields.role != "viewer"', to: editing }\n        - { id: readOnly, otherwise: true, to: viewing }\n`, "https://ex.test/screen.yaml", loader);
    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("branchesと線形結果は併用不可", async () => {
    const result = await validateSpec(`${base}      to: editing\n      branches:\n        - { id: editable, when: 'fields.role != "viewer"', to: editing }\n`, "https://ex.test/screen.yaml", loader);
    expect(result.valid).toBe(false);
  });

  it("重複IDと末尾以外のfallbackを診断", () => {
    const diags = analyzeScreen({
      states: { viewing: { initial: true }, editing: {} },
      events: { edit: { from: "viewing", branches: [
        { id: "same", otherwise: true, to: "viewing" },
        { id: "same", when: "fields.role == 'admin'", to: "editing" },
      ] } },
      fields: { role: {} },
    });
    expect(diags.some((d) => d.code === "duplicate-branch-id")).toBe(true);
    expect(diags.some((d) => d.code === "fallback-branch-not-last")).toBe(true);
  });

  it("分岐候補とfallbackなしのNo Match候補を生成", () => {
    const items = generateTestItems({ states: { a: {}, b: {} }, events: { go: {
      from: "a", trigger: "click", branches: [{ id: "allowed", when: "fields.ok == true", to: "b" }],
    } } });
    expect(items.some((item) => item.id === "event.go.branch.allowed" && item.expected.includes("state=b"))).toBe(true);
    expect(items.some((item) => item.id === "event.go.noMatch" && item.expected.includes("API呼び出しなし"))).toBe(true);
  });
});
