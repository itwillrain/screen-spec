import { defineConfig } from "blume";

export default defineConfig({
  title: "screen-spec",
  description:
    "画面詳細設計書を記述する OpenAPI ライクな言語仕様（v0.1）のドキュメント。",
  github: {
    owner: "itwillrain",
    repo: "screen-spec",
    branch: "main",
    // モノレポ: リポジトリルートから docs プロジェクトまでのパス
    dir: "apps/docs",
  },
  navigation: {
    repo: true,
  },
});
