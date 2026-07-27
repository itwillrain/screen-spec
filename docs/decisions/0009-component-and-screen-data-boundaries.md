# ADR 0009 — ComponentとScreen Dataの境界

- ステータス: **Accepted**（実装済み）
- 決定日: 2026-07-28

Componentは`components`配下に登録された、取得元に依存しない完全な仕様契約とする。同じ意味とUI契約を持つComponentは取得元が異なっても再利用できるが、意味または確定仕様が異なる場合は別Componentとして明示する。継承・差分合成は契約を分散させるため採用せず、既存の`compose`は互換期間を設けず削除する。`$ref`は完全な純粋参照だけを担う。

APIとFieldの間には読み取り用のScreen Dataを置き、`API Binding → Screen Data → Field Binding`の順で接続する。Screen DataはAPIモデル全体の複製ではなく、画面が必要とする最小ProjectionをJSON Schemaのサブセットで宣言する。最初の対応範囲は、各Screen Dataをちょうど1つのAPIレスポンスから作り、`fieldBindings`で動的Optionsへ明示Mappingする経路に限定する。供給元が0件または複数の場合はerrorとする。

FieldのvalueはField自身の標準状態として扱い、`fieldBindings`はOptionsやloadingなど追加Inputだけを扱う。静的Options Componentと動的Optionsは分離し、未選択案内はOptionsへ混ぜず`placeholder`で表す。Field単位のloadingは`api.<bindingId>.loading`から供給し、loading中はFieldを無効化しつつ既存Optionsを保持する。

API response mappingの格納先は`fields.<fieldId>`と`data.<dataId>`で明示する。既存の裸のField IDは互換形式として受理する。動的Optionsのitem mappingはドット区切りのプロパティパスに限定し、式や変換ロジックは持たせない。Field型が標準Input Contractを定めるため、Componentごとの`inputs`宣言は導入しない。

契約不成立が仕様だけで確定する参照・型・Mapping不整合はerrorとし、OpenAPIの2xx JSONレスポンスに存在しないproperty pathもerrorとする。レスポンススキーマを取得・解釈できない場合や未使用定義はwarningとする。Viewerは当面Component Catalogを設けず、Field詳細でComponent由来、API、Screen Data、Mapping、loading sourceを一続きで表示する。

## 今回扱わないもの

- 複数sourceの合成、computed値、文字列結合、条件変換
- FieldからScreen Dataへの書き戻し
- キャッシュ、ページング、retry、progress、Field固有のerror UI
- 独自Component Input ContractとComponent Catalog
