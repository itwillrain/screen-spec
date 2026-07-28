# ADR 0010 — Component Usage GraphとViewer追跡

- ステータス: **Implemented**
- 決定日: 2026-07-28

Componentの利用関係は、解決後の文書URIとJSON Pointerから成るComponent Identityを基準に、Authored Specificationの`$ref`からComponent Usage Graphとして導出する。UsageはYAMLへ保存せず、Direct Usage、Component Dependency、Impacted Fieldを区別する。同名でもIdentityが異なれば別Componentであり、独自契約を持たないComponent Aliasは集計を分断するため禁止する。

Usageは参照箇所単位で記録し、ViewerではField単位に集約する。利用Field数、参照箇所数、Impacted Field数、直接依存数を混同しない。Field OriginがinlineでもValidationまたはOptions ComponentへのDirect Usageを持てる。Component定義は自身が記述した内容を主表示し、依存Componentを自動展開しない。

Project Analysisはmanifestに含まれるScreen文書とComponent文書を読み、プロジェクト全体のUsage Graphと未使用Component warningを生成する。単一ファイル検証はプロジェクト全体の未使用を判定しない。未使用Componentは有効な定義でありerrorにはしない。

Viewerは画面コンテキストを維持し、Field詳細と同じドロワー内でComponent詳細、依存先、現在画面と他画面の利用箇所を表示する。Component定義を第一目的とし、種別ごとの構造化表示を主、Authored YAMLを折りたたみの補助表示とする。Optionsは10件以下を全件表示し、10件を超える場合は検索可能な折りたたみ領域にする。依存Componentは定義内の該当位置と依存一覧から個別に開き、自動展開しない。

上部の指標はDirect Usage Count、Impacted Field Count、Dependency Countの3つに限定する。利用FieldはDirect Usageと依存経由を区別し、現在画面を常時表示、他画面を画面単位で折りたたむ。Component固有診断は定義直後に内容がある場合だけ表示する。Identityは短い文書名・種別・名前を主表示し、完全なURIとJSON Pointerはコピー可能にする。

パンくずはFieldから現在Componentまでの経路を表示し、戻る操作は1階層ずつ行う。共有URLには起点Fieldと現在Componentだけを保存し、経路はUsage Graph上の最短経路から復元する。Component名はbuttonで開き、見出しへのフォーカス移動、キーボード操作、全幅の狭幅表示を保証する。EscapeはComponent階層を1つ戻し、Field詳細ではドロワーを閉じる。独立したComponent Catalogは設けない。

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
