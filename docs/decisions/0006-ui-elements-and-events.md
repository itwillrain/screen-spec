# ADR 0006: UI要素とイベントの連携

- Status: Accepted
- Date: 2026-07-27

## Context

従来の`fields`は入力項目の型だけを持ち、ボタン、説明ラベルなど画面上の非入力要素を登録できなかった。また、画面に表示する文言と、その要素から発火する`events`の関係を機械的に追跡できなかった。

## Decision

`fields`を入力値だけでなく、画面を構成するUI要素のマップとして扱う。

- `Field.type`へ`button`と`label`を追加する。
- `Field.text`を追加し、UI要素に表示する文言を記述する。
- `Field.eventId`を追加し、同じ画面の`events`キーを参照する。
- 従来の`label`は全typeで必須とし、設計上の名称およびアクセシブルな名称として扱う。
- event側の`target`には対象となるfieldキーを記述する。
- `eventId`が未定義のeventを指す場合、または参照先eventの`target`とfieldキーが一致しない場合はwarningとする。
- `text`と`eventId`は後方互換のため任意とする。既存の入力fieldは変更不要である。

## Example

```yaml
fields:
  helpText:
    label: 入力案内
    type: label
    text: 必須項目を入力してください。
  submitButton:
    label: 保存ボタン
    type: button
    text: 保存する
    eventId: submit

events:
  submit:
    trigger: click
    target: submitButton
    from: editing
    to: submitting
```

## Consequences

Viewerは項目表に`text`と`eventId`を表示する。layout、accessControl、`$ref`、表示条件は既存fieldと同じ仕組みを再利用できる。一方、入力値を参照する式やAPI mappingで非入力要素を指定することはスキーマ上は可能なままであり、必要になった段階で値を持つtypeの区別を追加検討する。
