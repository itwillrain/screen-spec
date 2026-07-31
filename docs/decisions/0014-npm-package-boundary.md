# ADR 0014 — npmパッケージの公開境界

- ステータス: **Accepted**
- 決定日: 2026-08-01

## コンテキスト

screen-specをOpenAPIのようにアプリケーションや検証ツールから利用するには、リポジトリのTypeScriptソースを直接参照せず、npmで安定した実行ファイル・型定義・JSON Schemaを配布する必要がある。一方、ViewerはReactとMermaidを含む閲覧アプリであり、仕様を読むランタイムへ混ぜると依存と責務が大きくなる。

## 決定

1. **@screen-spec/core**を公開ランタイムとする。メインエントリはブラウザ安全なparse・resolve・validate・analyze APIを提供する。
2. Nodeのfsを使うloaderは**@screen-spec/core/node**へ分離する。外部参照の取得境界を保ち、browser/bundlerへNode依存を混入させない。
3. JSON Schemaは**@screen-spec/core/schema**から配布する。canonicalなroot schemaをcoreのbuild前に同期し、packaged artifactへ含める。
4. CLIは**@screen-spec/cli**としてcoreから分離する。CLIは実行ファイルとtestgen/validateの導線を提供し、Viewer・React・Mermaidには依存しない。
5. 配布形式はESM + TypeScript declarationとする。仕様文書のauthoring formatは引き続きYAMLを正とし、npm packageは画面を描画・実行しない。
6. root workspaceはprivateのままとし、coreとCLIを同じversionで個別にpublishする。

## 利用例

~~~ts
import { validateDocument, resolveDocument } from "@screen-spec/core/node"

const result = await validateDocument("./specs/pages/users/edit.screen.yaml")
const resolved = await resolveDocument("./specs/pages/users/edit.screen.yaml")
~~~

## 結果

- package consumerはdistのJSと宣言ファイルだけを参照でき、リポジトリ構成やtsxを必要としない。
- browser利用者はDocumentLoaderを注入してfetchなどの取得方法を選べる。
- coreとCLIのversionを同期する運用が必要になる。
- CommonJS配布、UI自動生成、Viewerのコンポーネント配布は別の設計判断とする。
