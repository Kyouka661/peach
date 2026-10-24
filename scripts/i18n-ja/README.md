# Peach 日本語化

Peach の画面（フロントエンド）の中国語を、辞書を使って日本語に置き換えるスクリプトです。
ソースは直接編集せず、置き換えはビルドの直前に作業ツリーで行います。そのため、本家の更新を取り込んでもぶつかりません。

## ファイル

| ファイル | 役割 |
| --- | --- |
| `ja.json` | 辞書。キーが原文、値が訳文。`""` は未訳、`null` は「訳さない」 |
| `overrides.json` | ファイルごとの上書き。同じ原文でも場所で意味が違うとき（「关闭」が「閉じる」か「オフ」か）に使う。`原文@キー名` はオブジェクトのそのキーの値だけに効く |
| `html.json` | `web/index.html` の属性値とテキスト用の辞書 |
| `glossary.md` | 用語集と文体の決まり。翻訳と確認はこれに従う |
| `collect.mjs` | ソースから中国語の文字列リテラルと JSX テキストを拾う（コメントは対象外） |
| `extract.mjs` | 拾った原文を `ja.json` に取り込む。文脈は `build/strings.json` に出る |
| `merge.mjs` | 翻訳結果の JSON を `ja.json` に取り込む。`${...}` の欠落などを確かめる |
| `apply.mjs` | `ja.json` をソースに当てて置き換える |
| `review.mjs` | 文脈チェック用の資料（置換後のコード行と「原文 → 訳」の組）を `build/review/` に作る |

## 準備

- Node.js（`frontend/package.json` は 24 以上を求めますが、22 でも動きます）
- フロントエンドの依存（スクリプトが `oxc-parser` を使います）: `npm --prefix frontend ci`
- ソースから起動するときの Python 環境: `uv sync --locked --python 3.14`（uv 0.12.13 以上が必要）

`null` にしているのは、サーバーから届く値と照合している文字列です（品番バッジの「中字」、縦画面の絞り込み値など）。訳すと絞り込みや表示の分岐が動かなくなります。
アンインストールの確認でサーバーに送る「卸载 Peach」も、`overrides.json` で送信値だけ原文のままにしています。
`frontend/src/core/tags.ts` はタグ名の対応表なので、ファイルごと対象外です。

## 日本語版を作る

リポジトリのルートで実行します。

```bash
node scripts/i18n-ja/apply.mjs
```

```bash
npm --prefix frontend run build
```

`web/dist` が日本語版に置き換わります。あとは通常どおりトレイから起動します（PowerShell）。

```powershell
& .\.venv\Scripts\peach-tray.exe
```

コンソールで `peach serve` を直接実行する場合は、先に `$env:PYTHONIOENCODING = 'utf-8'` を設定してください。日本語版 Windows の既定の文字コード（cp932）では、サーバーが出す中国語のメッセージを表示できずに止まります。トレイから起動する場合は不要です。

## 本家の更新を取り込む

置き換えたソースを元に戻してから取り込みます。

```bash
git checkout -- frontend/src frontend/test frontend/e2e web/index.html web/dist
```

```bash
git fetch upstream
```

```bash
git merge upstream/master
```

新しく増えた原文を辞書に足します。未訳の件数が表示されるので、訳して `merge.mjs` で取り込みます。
文脈情報は `build/strings.json` に出るので、翻訳を頼むときはそれを一緒に渡します。

```bash
node scripts/i18n-ja/extract.mjs
```

訳を当てたら、文脈チェック用の資料を作って確認します（置換前に `units`、置換後に `chunks`）。

```bash
node scripts/i18n-ja/review.mjs units
```

```bash
node scripts/i18n-ja/apply.mjs
```

```bash
node scripts/i18n-ja/review.mjs chunks 10
```

## テストについて

置き換えた状態で `npm --prefix frontend test` を実行すると、約 380 件が失敗します。
テストが中国語の文言（「1,234 个符合 · 显示 8」のような完成文や、`aria-label^="媒体目录 "` のような前方一致）で要素や結果を探しているためです。
ロジックの確認は、置き換える前のソースでテストを実行してください。

## 対象外のもの

- サーバー（Python）から届くメッセージ（エラー、タスクの進行状況など）は中国語のまま
- 動画プレーヤー（Video.js）に組み込みの文言
- 外部サイトや取得したデータ（作品名・タグ名など）
