# ADR 0003 — event の期待結果と API エラー挙動

- ステータス: **Proposed**
- 日付: 2026-07-25
- 関連: [ADR 0002](./0002-spec-coverage-retrospective.md) 優先度2

## コンテキスト

現行の event は `from` / `to` と `onSuccess` / `onError` の遷移先を表現できるが、
テスト項目の期待結果や API エラーごとの画面挙動・メッセージを形式化できない。
そのため、遷移テストは生成できても「何を確認すべきか」が不足する。

## 提案

### 1. 期待結果は各結果分岐に置く

`expects` は1か所へ集約せず、即時遷移はevent直下、成功・失敗は各分岐の直下へ置く。
既存の event との後方互換性を保つため、すべて任意とする。

```yaml
events:
  submit:
    from: editing
    to: submitting
    action: { apiCall: updateUser }
    expects:
      state: submitting
    onSuccess:
      to: viewing
      navigate: user-list
      expects:
        message:
          kind: success
          text: 更新しました
    onError:
      to: error
      expects:
        message:
          kind: error
          text: 更新に失敗しました
```

`expects` の最小語彙は次とする。

| キー | 型 | 意味 |
|---|---|---|
| `state` | string | 結果時点の状態。指定時は同じ分岐の `to` と一致必須 |
| `navigate` | string | 遷移先画面ID。指定時は同じ分岐の `navigate` と一致必須 |
| `message` | object | 表示メッセージ。`kind` と `text` を持つ |
| `fields` | map | フィールドごとの期待値または状態 |

フィールド期待値は初期段階では `value`、`visible`、`enabled` のみを扱う。
動的な値は既存の式構文を再利用し、任意コードやスクリプトは許可しない。

### 2. API エラー条件は `onError.cases` に置く

API固有の結果分岐であるため、HTTP条件を `apiBinding` ではなく、それを呼び出すevent側に置く。
`apiBinding` は引き続きAPI操作とデータマッピングのSSOTとし、画面挙動を持たせない。

```yaml
onError:
  to: error
  cases:
    - when:
        status: 400
        code: VALIDATION_ERROR
      to: editing
      expects:
        message:
          kind: error
          text: 入力内容を確認してください
    - when:
        status: 409
      to: conflict
      expects:
        message:
          kind: warning
          text: 他のユーザーにより更新されています
  expects:
    message:
      kind: error
      text: 更新に失敗しました
```

- `cases` は記述順に評価する。
- `when.status` はHTTPステータス、`when.code` はAPIの業務エラーコードを表す。
- caseに一致しない場合は `onError` 直下の `to` / `expects` を既定結果とする。
- 同一条件や到達不能なcaseはcore analyzerでwarningにする。

### 3. 責務を分離する

- JSON Schema: 構造、必須項目、プリミティブ型を検証する。
- core analyzer: state・field・screen参照、`to`と`expects.state`の一致を検証する。
- テスト生成: eventの各分岐とerror caseを1件以上のテスト候補へ展開する。
- Viewer: 分岐、条件、期待結果を読み取り専用で表示する。

## 採用理由

- 期待結果を実際の結果分岐の近くに置ける。
- API定義と画面挙動の責務が混ざらない。
- 既存仕様は変更なしで引き続き有効。
- 条件式や実行コードを導入せず、テスト生成に必要な情報を構造化できる。

## 代替案

### event直下に期待結果を集約する

成功・失敗・エラーcaseとの対応が間接的になるため採用しない。

### `apiBinding` にエラー時の画面挙動を置く

同じAPIを異なる画面やeventから利用する場合にUI挙動が衝突するため採用しない。

### 自由形式のアサーション式を採用する

実装依存・実行環境依存になり、安全な静的解析と安定したテスト生成が難しいため採用しない。

## 未決事項

1. `expects.fields.*.value` でリテラルと式をどう区別するか。
2. メッセージを直書きするか、将来のi18n向けに `key` も許可するか。
3. `when.code` の参照先をOpenAPI拡張で形式化するか。
4. `cases` の優先順位と重複条件をwarningまたはerrorのどちらにするか。

## 実装順

1. 本ADRの未決事項を確定し、ステータスをAcceptedへ変更する。
2. JSON Schemaと型相当の構造を追加する。
3. core analyzerに参照・整合性チェックを追加する。
4. サンプルとテストを追加する。
5. Viewerと公開ドキュメントへ表示を追加する。
