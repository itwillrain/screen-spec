# screen-spec

画面詳細設計書を記述する OpenAPI ライクな言語仕様（v0.1）と、その関連ツール。

- YAML を主な記述形式とし、JSON Schema（draft 2020-12）で検証できる
- `$ref` によるコンポーネント再利用（純粋参照・OpenAPI 互換）
- 特定の UI フレームワークに依存しない

## リポジトリ構成（npm workspaces モノレポ）

```
schema/                      JSON Schema（draft 2020-12）
packages/core/               パース・$ref 解決・2 段検証
packages/cli/                screen-spec CLI
apps/docs/                   言語仕様ドキュメントサイト（Blume）
examples/                    サンプル YAML
docs/spec/                   言語仕様メモ
```

## セットアップ

```bash
npm install
```

## 検証（CLI）

```bash
npm run validate examples/user-edit.screen.yaml
npm test
npm run typecheck
```

## ドキュメントサイト

言語仕様のドキュメントは [Blume](https://useblume.dev/) で構築しています。

```bash
npm run dev   --workspace @screen-spec/docs   # ローカルプレビュー
npm run build --workspace @screen-spec/docs   # 静的ビルド（apps/docs/dist）
```

## ステータス

M0＋M1 完了（スキーマ・core・CLI・サンプル・ドキュメントサイト）。
状態遷移（`states`/`events`）・API 連携（`apiBindings`）・Viewer は後続マイルストーン。
