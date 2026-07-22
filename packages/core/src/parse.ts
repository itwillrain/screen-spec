import yaml from "js-yaml";

/**
 * YAML テキストを JS 値へパースする。
 * 決定 #1: 記述形式は YAML 主体。
 */
export function parseYaml(text: string): unknown {
  return yaml.load(text);
}
