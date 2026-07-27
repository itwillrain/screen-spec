# screen-spec Domain Language

screen-specは、画面の構造、状態、振る舞い、外部連携を実装非依存の契約として記述するための言語である。

## Language

**Screen Specification**:
ひとつの画面の構造と振る舞いを定義する文書。画面実装そのものではない。
_Avoid_: Screen definition, UI config

**Field**:
入力欄、ボタン、ラベルを含む、画面を構成する識別可能なUI要素。
_Avoid_: Input（入力要素だけを指す場合を除く）

**Component**:
`components`配下に名前付きで登録された、取得元に依存しない再利用可能な完全な仕様契約。実際の参照回数ではなく、登録された再利用意図によってComponentとなる。
_Avoid_: Template, Base Component, React Component

**Component Identity**:
Componentを一意に識別する、解決後の文書URIとJSON Pointerの組。表示名が同じでもIdentityが異なれば別Componentである。
_Avoid_: Component Name（表示名だけで同一性を表す場合）

**Direct Usage**:
Screen SpecificationまたはComponentが、記述上の`$ref`でComponentを直接参照する一つの参照箇所。
_Avoid_: Usage（Component Dependencyや変更影響を含む曖昧な用法）

**Component Dependency**:
Component自身の契約内に記述されたDirect Usageによる、Component間の依存関係。
_Avoid_: Composition, Inheritance

**Impacted Field**:
Direct UsageとComponent Dependencyを辿った結果、Componentの変更影響を受けるField。
_Avoid_: Direct Usage

**Component Usage Graph**:
Authored Specificationの`$ref`から導出される、Component Identity、Direct Usage、Component Dependency、Impacted Fieldのプロジェクト全体の関係。
_Avoid_: Component Registry, Component Catalog

**Screen Data**:
APIレスポンスから作られ、Fieldへ読み取り用データを供給する、画面に必要な最小Projection。
_Avoid_: Domain Model, View Model, Store

**Field Binding**:
Screen DataまたはAPIの実行状態を、Field型が定める追加Inputへ明示的に接続する画面固有の契約。
_Avoid_: Component Binding, Prop Binding

**Event**:
画面上の契機と、それによる状態変化・処理・期待結果をまとめた振る舞いの単位。
_Avoid_: Action（event内の副作用定義と区別する）

**Linear Event**:
単一の遷移結果を持つevent。
_Avoid_: Simple event

**Branched Event**:
実行前条件を記述順に評価し、最初に一致したBranchの結果を実行するevent。
_Avoid_: Conditional event, guarded event

**Branch**:
安定したID、実行前条件、遷移先、処理、期待結果を持つBranched Event内の分岐。
_Avoid_: Case（Error Caseと区別する）, Guard

**Fallback Branch**:
先行Branchが一致しなかった場合に選択される、`otherwise`を持つ最後のBranch。
_Avoid_: Default case, else case

**No Match**:
Fallback Branchがなく、どのBranchの条件にも一致しないためeventが実行されない結果。
_Avoid_: Error, failure

**Error Case**:
API実行後のHTTP statusやエラーコードに応じた`onError`内の分岐。実行前のBranchとは異なる。
_Avoid_: Branch

**Field Review Workspace**:
デザインを参照しながらFieldと直接関連するEvent、Branch、API、診断を確認する、エンジニア向けの読み取り専用Viewer領域。
_Avoid_: Editor, Design preview
