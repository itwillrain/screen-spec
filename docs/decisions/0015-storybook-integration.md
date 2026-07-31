# 0015 — Storybook連携の検討方針

ステータス: **Proposed（後で検討）**

## 背景

Storybookは、実装されたUIの状態、操作、アクセシビリティを実行可能な例として確認する場所に向いている。screen-specのScreen Specificationは実装非依存の契約であり、Viewerはその契約を読むための場所であるため、両者を同じデータとして扱うと責務が混ざる。

一方で、画面仕様に対応するStoryが存在するか、どのState・Field・Eventを実装例で確認できるかは、規模が大きくなったときに有用な診断になる。

## 方針

将来Storybook連携を導入する場合も、`@screen-spec/core`をReactやStorybookへ依存させず、別パッケージ（候補: `@screen-spec/storybook`）として実装する。screen-specを正本とし、Storybookは実装例とインタラクションテストを担う境界を維持する。

最初の連携候補は次の範囲に限定する。

1. Storyの`parameters.screenSpec`またはサイドカーの対応表で、`screenId`、`stateId`、`fieldIds`、`eventIds`を明示する。
2. Storyの対応状況を検査し、未対応のState・Field・Eventをカバレッジ診断として出す。
3. ViewerとStorybookの該当Storyを相互に開けるリンクを提供する。
4. 必要性が確認できた段階で、Storybookのaddon/panelとして診断を表示する。

## 採用しないこと

- YAMLから全Storyを自動生成する。状態、権限、API結果、バリデーションの組み合わせでStoryが爆発し、実装の意図を隠すため。
- coreの仕様からReactコンポーネントやStorybook固有のimport pathを参照する。契約の実装依存を招くため。
- Storybook用フィクスチャを仕様の別の正本にする。テストデータと仕様の不一致を検出しにくくするため。

## 未決事項

- Story IDと`screenId/stateId`の命名規約をどこで定義するか。
- Storyの粒度をScreen全体、State、Field、Eventのどこまで求めるか。
- Storybook側のfixtureとscreen-specのtestDataをどのように共有するか。
- ViewerとStorybookを同一サイトに配置できない場合のリンク形式。

当面はスキーマ変更やStorybook依存の導入を行わず、実装規模と運用課題が明確になった時点でこのADRを更新する。
