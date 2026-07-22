# screen-spec 言語仕様（v0.1・ドラフト）

画面詳細設計書を記述する OpenAPI ライクな YAML 言語。本書は M0/M1 で実装済みの範囲を記す。
確定した設計判断の根拠は運用上 `.knowledge`（Obsidian）で検討し、正式版は `docs/decisions/` に昇格する。

## ドキュメントの種類

すべてのドキュメントは `specVersion: "0.1"` を必須で持ち、次のいずれかを含む。

- **画面ドキュメント**: `screen` を持つ。
- **共通コンポーネントドキュメント**: `components` を持つ（例: `common.yaml`）。

## 命名規則（決定 #9）

| 対象 | 規則 | 例 |
|---|---|---|
| `components.*` の定義名 | PascalCase | `EmailField`, `Required` |
| コレクションのキー（`fields` 等） | camelCase | `email`, `firstName` |
| `screen.id` | kebab-case | `user-edit` |

## コレクションはマップ（決定 #5, #6）

`fields` などは配列＋`id` ではなく**マップ**。キーが識別子、**YAML 記述順が表示順**。

## `$ref`（決定 #2, #3, #8）

- コンポーネント再利用は `$ref` で行う（v0.1 から必須機能）。
- **純粋参照**: `$ref` を持つオブジェクトに兄弟キーを書けない（マージ・上書き不可）。
- バリエーションは上書きではなく別コンポーネントとして定義する（決定 #4）。
- 参照形式: 内部 `#/components/...`、外部 `./common.yaml#/components/...`。
- v0.1 では**ローカル相対パスのみ**。`http(s)://` や絶対パスは不可。

```yaml
# 純粋参照（OK）
email:
  $ref: "./common.yaml#/components/fields/EmailField"

# 兄弟キー併記（NG: 検証エラー）
email:
  $ref: "./common.yaml#/components/fields/EmailField"
  label: 上書き
```

## 検証（決定 #7）

`screen-spec validate <file>` は次の2段で検証する。

1. **raw**: パース直後の文書をスキーマ検証（`$ref` は純粋参照として許容）。
2. **resolve**: 全 `$ref` を解決（純粋性・ローカル相対・循環などを担保）。
3. **resolved**: 解決済みの正規化文書を同スキーマで再検証（参照先の型ミスマッチを検出）。

## v0.1 で表現できる要素

- `screen`: `id`, `name`, `description`, `route`, `permissions`, `fields`
- `field`: `label`, `type`, `required`, `validations`, `options`, `permission`
- `validation`: `rule`, `value`, `message`
- `option`: `value`, `label`
- `permission`: `role`, `access`, `fields`, `editRoles`
- `components`: `validations`, `fields`, `options`

## 未実装（後続マイルストーン）

- `states` / `events` / `transitions`（状態遷移・案C: M3）
- `apiBindings`（OpenAPI 連携・案B: M4）
- Viewer（M2 以降）
- `compose`（allOf 相当・予約のみ、決定 #12）

## 使い方

```bash
npm install
npm run validate examples/user-edit.screen.yaml
npm test
```
