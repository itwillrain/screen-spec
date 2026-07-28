# ADR 0013 — Design Mappingの定義順からDesign Tourを導出する

- ステータス: **Accepted**
- 決定日: 2026-07-29

デザイン画像とScreen Elementsを別々に読む負荷を下げるため、各画像はField、Component Instance、またはComponent内部Fieldを一つ以上のDesign Regionへ対応付けるDesign Mappingを持てる。領域は画像の拡縮や表示幅に依存しない0から1の正規化矩形とし、同じ要素の複数箇所は一つのMapping内へまとめる。

Design Tour専用のstepや説明文は定義しない。画像の定義順、各画像内のMapping定義順をそのまま巡回順とし、表示名とIDは対象Screen Elementから導出する。Tourは一覧行へフォーカスし、詳細ドロワーは明示的な行選択時だけ開く。これにより通常の双方向リンクとチュートリアルの順序が乖離せず、将来EditorでMappingを並べ替えるだけでTourも更新できる。v0.1は矩形だけを扱い、polygon、OCR、自動紐付け、画像上での編集は対象外とする。
