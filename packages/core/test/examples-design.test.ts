import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";

interface Mapping { target: string }
interface ScreenExample {
  screen: {
    design?: { images?: Array<{ url: string; mappings?: Mapping[] }> };
    layout?: { sections?: Array<{ fields?: string[]; items?: Array<{ field?: string; component?: string }> }> };
  };
}

const examples = [
  "audit/log.screen.yaml",
  "notifications/detail.screen.yaml",
  "notifications/edit.screen.yaml",
  "notifications/list.screen.yaml",
  "permissions/role-detail.screen.yaml",
  "permissions/role-list.screen.yaml",
  "users/edit.screen.yaml",
  "users/list.screen.yaml",
];

describe("example design references", () => {
  it.each(examples)("%s has local images and maps every laid-out Screen Element", (relativePath) => {
    const screenPath = resolve("examples/pages", relativePath);
    const example = load(readFileSync(screenPath, "utf8")) as ScreenExample;
    const images = example.screen.design?.images ?? [];
    expect(images.length, "design.images").toBeGreaterThan(0);

    for (const image of images) {
      expect(image.url).toMatch(/^wireframes\/.+\.svg$/);
      expect(existsSync(resolve("apps/viewer/public", image.url)), image.url).toBe(true);
    }

    const targets = images.flatMap((image) => image.mappings ?? []).map((mapping) => mapping.target);
    const elements = (example.screen.layout?.sections ?? []).flatMap((section) =>
      section.items?.map((item) => item.field ?? item.component).filter((item): item is string => !!item)
        ?? section.fields
        ?? [],
    );
    for (const element of elements) {
      expect(
        targets.some((target) => target === element || target.startsWith(`${element}.`)),
        `missing Design Mapping for ${element}`,
      ).toBe(true);
    }
  });
});
