# ADR 0010 — Component Usage GraphとViewer追跡

- ステータス: **Accepted**（実装待ち）
- 決定日: 2026-07-28

Componentの利用関係は、解決後の文書URIとJSON Pointerから成るComponent Identityを基準に、Authored Specificationの`$ref`からComponent Usage Graphとして導出する。UsageはYAMLへ保存せず、Direct Usage、Component Dependency、Impacted Fieldを区別する。同名でもIdentityが異なれば別Componentであり、独自契約を持たないComponent Aliasは集計を分断するため禁止する。

Usageは参照箇所単位で記録し、ViewerではField単位に集約する。利用Field数、参照箇所数、Impacted Field数、直接依存数を混同しない。Field OriginがinlineでもValidationまたはOptions ComponentへのDirect Usageを持てる。Component Contractは自身が記述した内容を主表示し、依存Componentを自動展開しない。

Project Analysisはmanifestに含まれるScreen文書とComponent文書を読み、プロジェクト全体のUsage Graphと未使用Component warningを生成する。単一ファイル検証はプロジェクト全体の未使用を判定しない。未使用Componentは有効な定義でありerrorにはしない。

Viewerは画面コンテキストを維持し、Field詳細と同じドロワー内でComponent詳細、依存先、現在画面と他画面の利用箇所を表示する。パンくず、戻る操作、URL共有、他画面の対象Fieldへの遷移を提供するが、独立したComponent Catalogは設けない。Component名はbuttonで開き、見出しへのフォーカス移動、キーボード操作、全幅の狭幅表示を保証する。

## 正式な種別と指標

- Field Component / Validation Component / Options Component
- Direct Usage Count / Impacted Field Count / Dependency Count
- Field Origin / Validation Usage / Options Usage

## 今回扱わないもの

- Component CatalogとComponent編集
- 継承、合成、Component Alias
- Usage統計の永続化
- Reactなど実装フレームワーク固有の情報
- Componentの自動統合と意味的な重複判定
