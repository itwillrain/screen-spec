# screen-spec

[![CI](https://github.com/itwillrain/screen-spec/actions/workflows/ci.yml/badge.svg)](https://github.com/itwillrain/screen-spec/actions/workflows/ci.yml)

画面詳細設計書を記述する OpenAPI ライクな言語仕様と、その関連ツール。

- YAML を主な記述形式とし、JSON Schema（draft 2020-12）で検証できる
- `$ref` によるコンポーネント再利用（純粋参照・OpenAPI 互換）
- 特定の UI フレームワークに依存しない

## リポジトリ構成（npm workspaces モノレポ）

```
schema/                      JSON Schema（draft 2020-12）
packages/core/               パース・$ref 解決（async/loader 注入）・2 段検証
packages/cli/                screen-spec CLI
apps/docs/                   言語仕様ドキュメントサイト（Blume）
apps/viewer/                 画面詳細設計書ビューア（React SPA・Swagger UI 型）
examples/                    サンプル YAML
docs/spec/                   言語仕様メモ
```

`@screen-spec/core` はブラウザ安全な主エントリ（`parseYaml` / `resolveRefs` / `validateSpec`）と、
Node 専用エントリ `@screen-spec/core/node`（`validateDocument` など fs 依存）に分かれる。
`$ref` 解決はローダー注入式（Node=fs / ブラウザ=fetch）で環境非依存。

## セットアップ

```bash
npm install
```

## 検証（CLI）

```bash
npm run validate examples/user-edit.screen.yaml
npm run testgen -- examples/user-edit.screen.yaml --test-data examples/user-edit.fixtures.yaml --format markdown
npm run testgen -- examples/user-edit.screen.yaml --test-data examples/user-edit.fixtures.yaml --format csv --output user-edit-tests.csv
npm test
npm run typecheck
```

## ドキュメントサイト

言語仕様のドキュメントは [Blume](https://useblume.dev/) で構築しています。

```bash
npm run dev   --workspace @screen-spec/docs   # ローカルプレビュー
npm run build --workspace @screen-spec/docs   # 静的ビルド（apps/docs/dist）
```

## ビューア（Swagger UI 型）

設計書を閲覧するクライアント SPA。ブラウザが spec(YAML) を fetch し、その場で `$ref` 解決・検証して表示する。
複数画面（`*.screen.yaml`）を一覧し、各画面の項目・状態遷移図・API 連携、および**画面間遷移図**を表示する。

```bash
npm run dev   --workspace @screen-spec/viewer   # ローカルプレビュー
npm run build --workspace @screen-spec/viewer   # 静的ビルド（apps/viewer/dist）
```

GitHub Pages では docs をルート、viewer を `/screen-spec/viewer/` に配置（deploy workflow が統合）。

## ステータス（v0.1）

- ✅ M1: スキーマ・core・CLI・`$ref`・2 段検証
- ✅ M2: Viewer（Swagger UI 型・クライアント解決）
- ✅ M3: `states` / `events` / `transitions`（状態機械解析・Mermaid 図）
- ✅ M4: `apiBindings`（OpenAPI 参照＋項目マッピング）
- ✅ M5: 複数画面対応・画面間遷移可視化
- ✅ バリデーション語彙の形式化（既知ルール＋型付き値、未知ルールは warning）
- ✅ event の期待結果（`expects`）と API エラー挙動の形式化・Viewer表示
- ✅ 権限マトリクス（role×field×operation）の形式化・Viewer表示
- ✅ フィールド既定値・`enabledWhen`、テストデータ文書
- ✅ 画面仕様・テストデータからのテスト項目候補生成・Viewer表示
- ✅ テスト項目のMarkdown/CSV出力（core・CLI・Viewer）
- ⬜ 今後: `compose`、複数画面の横断検証
