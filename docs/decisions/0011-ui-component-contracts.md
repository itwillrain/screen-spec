# ADR 0011 — UI Componentは名前付きField集合とする

- ステータス: **Accepted**
- 決定日: 2026-07-28
- 更新日: 2026-07-29

Pagination、DataTable、Header、Sidebar、Footerのように、複数の画面要素をまとめて再利用する単位をUI Componentとする。UI Componentは`name`、任意の`description`、`fields`だけを持つ。内部要素はScreen直下と同じField契約を使用し、操作は各Fieldの`eventId`で表す。UI Component専用のInputs、Events、semantic parts、rules、derived valuesは持たない。

ScreenはComponent Instanceを安定したIDで定義する。`bindings`は`fieldId`または`fieldId.property`を対象に、Screen Data、API状態、固定値を接続する。`events`は内部Fieldに定義された`eventId`をScreen Eventへ接続する。Binding先の先頭FieldがComponentに存在しない場合、内部Fieldに存在しないEventを接続した場合、接続先Screen Eventが存在しない場合はerrorとする。

Layoutは入れ子にせず、平坦なSectionとregionを維持する。順序付き`items`へScreen直下のFieldとComponent Instanceを混在させる。ViewerはComponent Instanceを開閉可能なチャンクとして表示し、内部Fieldを`instanceId.fieldId`の通常のField行へフラットに展開する。内部Fieldを選択すると、そのFieldの定義、Binding、Event Mappingを表示する。ComponentやDependencyをパンくず状にネスト表示しない。

専用のInput/Event/part定義は責務を精密に表現できる一方、Fieldと同じ情報を別概念で二重定義し、記述・検証・Viewerの理解コストを増やすため採用しない。UI Component同士の合成、継承、独自状態機械も導入しない。UI Componentの変更影響はImpacted Component Instanceとして記録する。既存の`layout.sections[].fields`はv0.1の互換形式として受理する。
