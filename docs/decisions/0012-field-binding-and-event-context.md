# ADR 0012 — Field型がBinding PropertyとEvent Contextを定める

- ステータス: **Accepted**
- 決定日: 2026-07-29

Componentを実装フレームワークのprops定義へ戻さず実装可能性を保つため、Binding先の第一propertyはField型ごとの標準語彙に限定する。全Fieldは`value`、`visible`、`enabled`を持ち、button/labelは`text`、select/radioは`options`と`loading`、listは`activeItem`と`loading`、tableは`rowKey`と`loading`を追加で持つ。ネストした部分入力は`value.*`だけを許可し、未知propertyはerrorとする。

Field操作が渡す値はFieldの`eventContext`へ名前と型を定義し、接続先Screen Eventでは`event.<name>`として参照する。Component専用Event Payloadは設けない。同じ`eventId`を共有するFieldは同じEvent Contextを提供する。

Effective Field Valueは実行時Bindingが定義済みならその値、未定義ならFieldの`default`を使う。`null`は明示値として扱いfallbackしない。固定`value`と`source`は排他的で、BindingがないpropertyはField定義を維持する。
