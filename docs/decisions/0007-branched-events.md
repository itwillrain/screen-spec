# ADR 0007: first-match方式の分岐イベント

- ステータス: **Accepted**
- 日付: 2026-07-27

## Context

従来のeventは単一の`to`と処理しか持てず、画面の入力状態によって遷移先、API呼び出し、期待結果が変わる仕様を表現できなかった。単一guardだけでは直後に条件別結果が必要になる一方、条件の排他性を静的に完全判定することはできない。

## Decision

`specVersion: "0.1"`の後方互換な追加として、eventに順序付き`branches`を導入する。

- eventは従来のLinear Eventか、`branches`を持つBranched Eventのどちらかとし、結果定義の混在を禁止する。
- BranchはcamelCaseの`id`、`when`または`otherwise: true`、必須の`to`を持つ。
- `action`、`expects`、`onSuccess`、`onError`はBranchごとに定義できる。
- Branchは記述順に評価し、最初に一致したものだけを実行する。
- Fallback Branchは最大1件かつ最後に置く。
- 一致するBranchがなくFallback BranchもなければNo Matchとなり、遷移・API呼び出し・副作用は発生しない。
- `when`は既存の条件式語彙と実行前コンテキストを使う。API実行結果の分岐は`onError.cases`が担う。
- 権限はBranchではなくevent単位、UIの表示・有効状態はFieldの`visibleWhen`・`enabledWhen`で別途定義する。
- ViewerはBranchを状態ノードではなく条件付きedgeとして表示する。
- テスト生成はBranchごとの候補と、Fallbackがない場合のNo Match候補を生成する。

## Consequences

first-matchにより排他性証明は不要になるが、記述順が意味を持つ。安定したBranch IDを必須にすることで、挿入や並べ替えによって診断・テストIDが壊れることを避ける。自己遷移でも`to`を明示するため、状態維持と記述漏れを区別できる。
