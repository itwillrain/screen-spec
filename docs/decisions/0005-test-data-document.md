# ADR 0005 — テストデータ（前提データ／フィクスチャ）の置き場所

- ステータス: **Accepted**（ADR 0002 優先度5）
- 日付: 2026-07-25
- 関連: [ADR 0002](./0002-spec-coverage-retrospective.md)

## コンテキスト
テスト項目書を生成するには「前提データ（編集画面＝既存ユーザーが存在 等）」「期待される初期表示」が要る。
これを画面仕様（`screen`）に混ぜると画面が肥大化し、関心が混ざる。

## 決定（案B：別ドキュメント種別）
画面を **参照する別ドキュメント種別** `testData` を追加する。screen-spec は「画面」に集中し、
テストの前提・期待はこの別ファイルに分離する。

- ルート文書は `screen` / `components` / **`testData`** のいずれか。
- `testData.screen`：対象画面の id。
- `testData.fixtures[]`：`id`（camelCase）、`description`、`params`（path/query の前提値）、
  `given`（前提データ＝API/DB 状態など自由構造）、`expected.fields`（初期表示の期待値）。

```yaml
specVersion: "0.1"
testData:
  screen: user-edit
  fixtures:
    - id: existingEditor
      description: 編集対象の既存ユーザー（editor）
      params: { userId: u-001 }
      given:
        user: { id: u-001, name: 田中太郎, role: editor }
      expected:
        fields: { name: 田中太郎, role: editor }
```

## 検証方針
- スキーマで構造を検証。`fixtures[].id` の重複は **error**。
- `testData.screen` の存在や `expected.fields` のフィールド整合は**複数文書横断**が要るため、
  当面は screen-spec 単体では検査せず、将来 `analyzeProject` 相当で対応する（未実装）。

## 帰結
- 画面仕様は純粋に保たれ、テストデータは差し替え／複数セットを持てる。
- 受け入れ条件（AC）や業務ルールはさらに別ソース（BDD 等）に委ねてよい（本 ADR の対象外）。
