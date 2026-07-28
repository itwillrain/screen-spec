import yaml from "js-yaml";

/**
 * YAML テキストを JS 値へパースする。
 * 決定 #1: 記述形式は YAML 主体。
 */
export function parseYaml(text: string): unknown {
  return yaml.load(text);
}

export function stringifyYaml(value: unknown): string {
  return yaml.dump(value, { noRefs: true, lineWidth: 100, sortKeys: false });
}
