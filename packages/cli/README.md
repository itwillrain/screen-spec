# @screen-spec/cli

@screen-spec/core を使って Screen Specification を検証し、テスト項目候補を出力する CLI です。

## Install

```sh
npm install --save-dev @screen-spec/cli
```

## Usage

```sh
npx screen-spec validate specs/pages/users/edit.screen.yaml
npx screen-spec testgen specs/pages/users/edit.screen.yaml --format markdown
```

複数の screen / testData を validate に渡すと、画面間遷移や fixture の横断診断も実行します。
