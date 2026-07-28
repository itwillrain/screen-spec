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
`components`配下に名前付きで登録された、取得元に依存しない再利用可能な仕様定義。実際の参照回数ではなく、登録された再利用意図によってComponentとなる。
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

**UI Component**:
複数のFieldを名前付きでまとめた、取得元と実装に依存しない再利用可能なField集合。専用のInput、Event、semantic partは持たず、各Fieldが通常のField契約と`eventId`を持つ。
_Avoid_: Composite Field, Widget, React Component

**Component Instance**:
UI Componentを特定Screenへ配置し、内部Fieldの値・属性と`eventId`を画面固有のData・Eventへ接続した利用実体。
_Avoid_: Component Usage, Widget

**Screen Elements**:
Layoutの定義順にScreen直下のFieldとComponent Instance、その内部Fieldを並べた画面構造の読み取り表現。
_Avoid_: Field List（Component Instanceを含む場合）, Screen Outline

**Impacted Component Instance**:
UI Componentの変更によって影響を受ける、Screen上のComponent Instance。
_Avoid_: Impacted Field

**Screen Data**:
APIレスポンスから作られ、Fieldへ読み取り用データを供給する、画面に必要な最小Projection。
_Avoid_: Domain Model, View Model, Store

**Field Binding**:
Screen直下またはComponent Instance内のFieldの値・属性を、Screen Data、APIの実行状態、固定値のいずれかへ明示的に接続する画面固有の契約。
_Avoid_: Component Binding, Prop Binding

**Binding Property**:
Component Instance内のFieldへ接続できる標準属性。Field型が語彙を定め、任意の実装固有propsは含まない。
_Avoid_: Prop, Component Input

**Event Context**:
Field操作がEventへ渡し、Event実行中に`event.<name>`で参照できる名前付きの値。
_Avoid_: Component Event Payload, Props

**Effective Field Value**:
実行時Binding、Fieldの`default`の順で解決されるFieldの実効値。`null`は明示値でありfallbackを起こさない。
_Avoid_: Merged Props, Initial Props

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
デザインを参照しながらScreen Elementsと直接関連するEvent、Branch、API、診断を確認する、エンジニア向けの読み取り専用Viewer領域。
_Avoid_: Editor, Design preview
