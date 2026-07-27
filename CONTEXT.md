# screen-spec Domain Language

screen-specは、画面の構造、状態、振る舞い、外部連携を実装非依存の契約として記述するための言語である。

## Language

**Screen Specification**:
ひとつの画面の構造と振る舞いを定義する文書。画面実装そのものではない。
_Avoid_: Screen definition, UI config

**Field**:
入力欄、ボタン、ラベルを含む、画面を構成する識別可能なUI要素。
_Avoid_: Input（入力要素だけを指す場合を除く）

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
