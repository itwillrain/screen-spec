# @screen-spec/core

screen-spec の YAML 仕様を、OpenAPI と同じようにアプリケーションや検証ツールから扱うためのコアライブラリです。YAML のパース、相対 $ref の解決、JSON Schema・意味解析・OpenAPI mapping の検証を提供します。

## Install

```sh
npm install @screen-spec/core
```

## Browser / bundler

ブラウザ安全な API はメインエントリから利用できます。外部参照の取得方法はローダーとして注入します。

```ts
import { parseYaml, validateSpec } from "@screen-spec/core"

const raw = await fetch("/specs/users/edit.screen.yaml").then((response) => response.text())
const result = await validateSpec(raw, new URL("/specs/users/edit.screen.yaml", location.href).href, async (uri) =>
  fetch(uri).then((response) => response.text()),
)

if (!result.valid) console.error(result.issues)
const document = parseYaml(raw)
```

## Node.js

Node 専用 API は `/node` サブパスから利用します。

```ts
import { validateDocument, resolveDocument } from "@screen-spec/core/node"

const result = await validateDocument("./specs/pages/users/edit.screen.yaml")
const resolved = await resolveDocument("./specs/pages/users/edit.screen.yaml")

if (!result.valid) process.exitCode = 1
```

## JSON Schema

OpenAPI の schema 配布と同じように、検証環境へ JSON Schema 自体を渡せます。

```ts
import schema from "@screen-spec/core/schema" with { type: "json" }

console.log(schema.$schema)
```

このパッケージは画面を描画・実行しません。Screen Specification の契約を読み込み、検証し、解決済み文書を利用者へ渡す境界です。
