# ADR 0011 — 役割別Componentと機能別Pageの配置

- ステータス: **Implemented**
- 決定日: 2026-07-30

Screen Specificationは`pages/<feature>/`、再利用契約は`components/<kind>.yaml`へ配置する。大規模化したときに単一の`common.yaml`が変更競合と探索コストの中心になるため、Validation、Field、Options、UI Componentを文書種別ごとに分割する。`pages`配下の機能名はファイル探索上の配置であり、業務分類を表すScreen GroupやURL階層とは独立する。

Viewerのmanifestはディレクトリを再帰探索し、ルートからの相対URLを保持する。`$ref`は参照元文書を基準に解決し、Component間の依存も外部参照として明示する。OpenAPI文書とtestDataはそれぞれ`openapi/`と`fixtures/`へ分離する。
