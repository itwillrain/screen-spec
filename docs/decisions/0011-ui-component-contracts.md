# ADR 0011 — UI Component ContractとScreen Outline

- ステータス: **Accepted**
- 決定日: 2026-07-28

複数の表示要素と操作を一体として再利用するPagination、DataTable、Header、Sidebar、FooterをFieldへ押し込まず、正式なUI Componentとして扱う。UI Componentは取得元や実装フレームワークに依存せず、Inputs、Events、semantic parts、rules、derived values、accessibility、default/compact表示を完全なContractとして持つ。UI Component同士の合成、内部Fieldの公開、独自状態機械は導入しない。

ScreenはComponent Instanceを安定したIDで定義し、InputをScreen Data・API状態または固定値へ、Contract EventをScreen Eventへ明示的に接続する。Event Payloadは接続先Eventの実行中に参照できる。必須Input・必須Eventの未接続や型不整合はerror、accessibility未記載、未配置Instance、未使用Componentはwarningとする。

Layoutは入れ子にせず、平坦なSectionとregionを維持する。順序付きitemsへFieldとComponent Instanceを混在させ、Header、Sidebar、Body、Footerを定義順に表現する。ViewerはこれをScreen Outlineとして表示し、Instance詳細、Component Contract、Dependencyへ追跡する。UI Componentの変更影響はFieldではなくImpacted Component Instanceとして記録する。既存のlayout fieldsはv0.1の互換形式として受理する。
