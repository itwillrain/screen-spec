# screen-spec

画面詳細設計書を記述する OpenAPI ライクな言語仕様と、その Viewer を開発するプロジェクト。

## 運用ルール

- **`.knowledge` は Obsidian（`Projects/screen-spec`）をマウントした外部知識領域**。
  Git の一部ではなく、`git add` / `commit` / `push` してはならない。
- **秘密情報（トークン・鍵・パスワード等）をファイルに保存・出力・表示しない。**
- **大きな変更・削除・commit・push は、実行前に必ずユーザーへ確認する。**
- **正式な設計判断は `docs/decisions/` に保存する**
  （検討途中のメモは `.knowledge` 側、確定事項はリポジトリ内 `docs/decisions/`）。

## 設計判断の二層運用

- `.knowledge/`（Obsidian・commit禁止）: 検討途中のメモ・スクラッチ。
- `docs/decisions/`（リポジトリ・共有される正式記録）: 確定した設計判断。
- `.knowledge` から `docs/decisions/` への昇格は、内容を個別に確認してから行う。

## プロジェクト構成（npm workspaces モノレポ）

- `packages/core` … パース・`$ref` 解決（async/loader 注入）・2 段検証。
  主エントリはブラウザ安全（fs 非依存）。fs 依存は `@screen-spec/core/node` に隔離。
  スキーマは `schema/screen.schema.json` を JSON import でインライン化（バンドル可能）。
- `packages/cli` … `screen-spec validate`（`@screen-spec/core/node` を使用）
- `apps/docs` … 言語仕様ドキュメントサイト（Blume）。`npm run dev --workspace @screen-spec/docs`
- `apps/viewer` … 画面詳細設計書ビューア（React+Vite の client SPA・Swagger UI 型）。
  spec を fetch しブラウザで解決。`VIEWER_BASE` で Pages サブパスを切替。
- `schema/` … JSON Schema（draft 2020-12）
- 依存メモ: vitest は vite@5、Blume/viewer は vite@8 が必要。ルートに vite@8、`overrides` で
  vitest のみ vite@5 に固定してある（これを崩すと Blume/viewer のビルドが壊れる）。
- GitHub Pages: deploy workflow が docs（ルート）と viewer（`/viewer/`）を1アーティファクトに統合。
