---
version: "1.1"
name: screen-spec-viewer
description: 画面詳細設計書を開発者・設計者・QAが検証するための、高密度で静かな技術ドキュメントUI。
---

# screen-spec Viewer Design System

## 適用範囲

この文書はViewerの実装が満たす設計契約である。本文の規則は必須、`ROADMAP`は将来候補を表す。未指定の事項はWeb標準とWCAG 2.2 AAを優先する。

## 原則

screen-spec Viewerはマーケティングサイトではなく、仕様を読み、関係を追い、矛盾を見つける作業画面である。情報の判別性、仕様間の関係、長時間の読みやすさ、キーボードとモバイル操作を装飾より優先する。個性はコード表現、参照元、実効値、未解決、診断、mapping方向を一貫して区別するscreen-spec固有の視覚文法で作る。

## レイアウト

- Desktopは256pxのsticky sidebarと`minmax(0, 1fr)`のmain。main最大幅1280px、左右余白32px。
- 1024px以下では余白24px、API等の2列構造を必要に応じて1列へ落とす。
- 768px以下では上部アプリバー＋開閉ナビ、本文余白12–16px、タブは1行横スクロール。
- モバイルで情報を削除しない。表は横スクロール、比較表は先頭列sticky、layoutは1列。
- タッチ環境の操作対象は最低44×44px。ポインター環境でもWCAG 2.2のTarget Size要件と十分な間隔を満たす。
- 200%ズームおよび320 CSS px幅で主要情報と操作を失わず、400%ズームでも読み取りと主要操作を維持する。図は読めない大きさへ縮小せずpan/scroll可能にする。

## 色とトークン

Light:

- canvas `#F7F8FA`、sidebar `#F1F3F6`
- surface-1 `#FFFFFF`、surface-2 `#FCFCFD`、surface-3 `#F3F5F8`
- ink `#171A21`、muted `#5E6573`、subtle `#858C99`
- border `#DDE1E8`、border-strong `#C7CDD8`
- primary `#4F46E5`、hover `#4338CA`、focus `#818CF8`
- success `#15803D`、warning `#A16207`、danger `#B42318`、info `#2563EB`
- code-surface `#111827`、code-ink `#E5E7EB`

Dark:

- canvas `#0D1117`、sidebar `#0A0E14`
- surface-1 `#141A23`、surface-2 `#19212C`、surface-3 `#202A36`
- ink `#F2F5F8`、muted `#B6BEC9`、subtle `#8993A1`
- border `#2B3441`、border-strong `#3A4656`
- primary `#8B93FF`、hover `#A5ABFF`、focus `#A5B4FC`
- success `#4ADE80`、warning `#FACC15`、danger `#FB7185`、info `#60A5FA`
- code-surface `#080B10`、code-ink `#E6EDF3`

Primaryは選択、link、focus、主要操作に限定する。状態色は意味を持つ箇所だけに使い、文字かiconを併用する。階層はshadowよりsurfaceと1px borderで作る。

## タイポグラフィ

- UI: `system-ui, sans-serif`
- Code: `"JetBrains Mono", "SFMono-Regular", Consolas, monospace`
- Page title 28px/600、section 20px/600、subsection 16px/600
- Body 14px/400/1.6、compact 13px/400/1.5、caption 12px/400
- Button/label 13px/500、code 13px/400/1.55
- ID、field key、route、式、operationId、state名だけをmonoにする。

## ナビゲーション

- SidebarはViewer名、検索、概要、画面一覧の順。選択は背景、左indicator、weightで示す。
- エラーは記号だけでなくseverity、件数とlabelを示し、検索結果0件を明示する。
- タブは下線型。`tablist`/`tab`/`tabpanel`を関連付け、左右矢印で移動可能にする。
- モバイルは開閉ナビと横スクロールタブを使い、選択後にナビを閉じる。

## フォーム項目と状態

- 項目はlabel/key、type/required/default、validation、visible/enabled条件、layout、由来の順に読む。
- 条件式と長い値はcode表示し、折り返しまたは詳細展開を提供する。
- Valid、Warning、Error、Deprecated、Required、許可/拒否/未定義は文字でも示す。
- badgeは短い状態・分類だけに使う。inputは高さ36px、touch環境44px、6px radius、2px focus ring。

## 画面遷移図とAPI

- 図は現在画面、遷移先、未解決画面を区別し、凡例と構造化された代替listを持つ。
- ROADMAP: 大規模な図へZoom/Fit/全画面操作を追加する。
- Mermaidはlight/darkに同期し、描画失敗時は同じ情報をlistでも示す。
- APIはoperation単位のcardとし、method/path、operationId、参照元、request、response、診断を並べる。
- HTTP methodは文字を必須とし色は補助にする。request/responseはdesktop 2列、mobile 1列。
- mappingの方向を明示し、不一致は該当行の近くに出す。

## ダークモード

- `system`/`light`/`dark`を選択でき、初期値はsystem、選択はlocalStorageへ保存する。
- `color-scheme`、form、scrollbar、Mermaid、Raw YAML、method、badgeを同期する。
- 純黒と純白の大面積対比を避け、surface段階とborderで奥行きを作る。

## スペーシングと形状

- 4px基準。4/8/12/16/24/32/48pxを使う。
- radiusはbadge 4px、input/button 6px、card/table 8px、diagram 12px。pillは状態badgeのみ。
- sticky navigationだけ弱いshadowを許可し、hoverで要素を大きく持ち上げない。

## アクセシビリティ

- WCAG 2.2 AA。通常文字4.5:1、大きな文字3:1以上。UIコンポーネント、focus indicator、意味を持つ図形は隣接色に対して3:1以上。
- 全操作要素に`focus-visible`、44px touch target、skip linkを提供する。
- sidebar、tabs、main、diagram controlに名前を付け、tableはcaptionまたは見出しと関連付ける。
- 色だけで状態を伝えず、icon-only controlにはaccessible nameを付ける。
- 読み上げ順と視覚順を一致させ、`prefers-reduced-motion`とforced colorsを尊重する。
- 200%ズーム、文字間隔変更、画面の向き変更でも情報と操作を失わない。
- loading、検索結果、診断件数など必要な非同期更新をlive regionで通知する。

## Do

- 情報密度を高く、視覚ノイズを低くする。
- ID、条件式、API mappingをmonoで明確にし、診断を対象の近くに置く。
- 色、icon、文字を併用し、表の比較可能性を維持する。
- borderとsurfaceで階層を作り、light/darkで意味を維持する。

## Don't

- 他ブランドのlogo、固有font、配色をcopyしない。
- 巨大見出し、意味のないgradient/glow、過剰なcard/pill/shadowを使わない。
- `!`、`?`、check、色だけで診断を伝えない。
- モバイルで列や仕様情報を削除しない。図を読めないサイズまで縮小しない。
- hoverだけに情報を置かない。
