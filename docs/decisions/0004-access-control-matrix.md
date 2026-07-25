# ADR 0004 — 権限マトリクス（role×resource×operation）

- ステータス: **Accepted**
- 日付: 2026-07-25
- 関連: [ADR 0002](./0002-spec-coverage-retrospective.md) 優先度3

## コンテキスト

現行の `screen.permissions` と `field.permission` は、`access`、`fields`、`editRoles` が分散し、
ロール×項目×操作の許可を一意に導出しにくい。`full` と `readwrite` の差もテスト生成には曖昧である。

## 決定

新しい正規モデルとして `screen.accessControl.roles` を追加する。ロールごとに、画面の `view`、
フィールドの `view` / `edit`、eventの `execute` をbooleanで明示する。

```yaml
accessControl:
  roles:
    admin:
      screen: { view: true }
      fields:
        "*": { view: true, edit: true }
      events:
        "*": { execute: true }
    editor:
      screen: { view: true }
      fields:
        "*": { view: true, edit: false }
        name: { edit: true }
        email: { edit: true }
      events:
        edit: { execute: true }
        submit: { execute: true }
    viewer:
      screen: { view: true }
      fields:
        "*": { view: true, edit: false }
```

### 評価規則

1. 未指定の権限はdeny（`false`）とする。
2. `"*"` は同種resourceの既定値とする。
3. resource個別指定は `"*"` の各operationを上書きする。
4. fieldの `edit: true` は `view: true` を必要とする。継承後に満たさなければwarningとする。
5. 仕様は設計・テスト生成用であり、ランタイム認可を実行しない。

### 後方互換性

- 既存の `screen.permissions` と `field.permission` は引き続きSchemaで許可するが非推奨とする。
- `accessControl` と旧形式を同一画面で併用した場合、意味の衝突を避けるためwarningにする。
- 自動変換は行わない。旧 `full` / `readwrite` の意味がプロジェクトごとに曖昧なためである。

## 診断

core analyzerは次をwarningにする。

- matrixが未定義のfieldまたはeventを参照する。
- `accessControl` と旧形式を併用する。
- 継承後にfieldが `edit: true` かつ `view: false` になる。

## 採用理由

- role×resource×operationからテスト項目を直接生成できる。
- 権限のSSOTが画面直下の1か所になる。
- booleanなので許可・拒否が曖昧にならない。
- event実行権限も同じモデルで扱える。
- 旧仕様を壊さず段階移行できる。

## 実装順

1. JSON Schemaとcore analyzerへ追加する。
2. サンプル、テスト、公開リファレンスを更新する。
3. Viewerにrole別マトリクスを表示する。
4. 旧形式の移行ガイドを整備する。
