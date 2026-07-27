# ADR 0008: 読み取り専用Field Review Workspace

- ステータス: **Accepted**
- 日付: 2026-07-27

## Context

Viewerの項目表は仕様全体を一覧できる一方、デザイン参照が別タブにあり、FieldからEvent・Branch・API・診断を追うにはタブ間を行き来する必要があった。仕様からUIを仮描画する案やPM・顧客向けの簡易表示も検討したが、M6では実装前レビューを行うエンジニアの導線へ範囲を絞る。

## Decision

「項目」タブをField Review Workspaceとし、左にデザイン参照、右にField一覧と選択Fieldの詳細を置く。Field詳細では直接関連するEvent、Branch、API、診断を一段だけ追跡できる。選択対象はURL、ペイン幅やズームは端末ローカルに保持する。

Viewerは読み取り専用を維持する。YAML編集、デザイン注釈、画像座標とFieldの連動、Figma埋め込み、UI仮描画、PM・顧客向け表示はM6に含めず、将来のEditorまたは別マイルストーンとして扱う。既存のデザイン専用タブは廃止する。

## Consequences

Fieldレビューの一覧性と関係追跡を両立できる一方、デザインとFieldの対応は目視確認に留まる。編集機能を別境界に保つことで、Viewerの共有・閲覧用途を複雑化させない。
