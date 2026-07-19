# アフィリエイトブログ運用マニュアル

## アーキテクチャ概要

このシステムは、`affiliate/content/` に置かれたMarkdown記事(フロントマター付き)を `affiliate/build.mjs`(依存ライブラリ0のNode.jsスクリプト)が読み込み、`dist/` 配下に静的HTMLサイト(記事詳細ページ・記事一覧・RSSフィード・サイトマップ)を生成し、既存のルートアプリ(index.html等)と合わせて GitHub Pages(`https://blitzendegen915-beep.github.io/petrichot/`、ブログは `/blog` 以下)へデプロイする、という構成です。記事は `.github/workflows/auto-article.yml` が毎日UTC 21:00(日本時間 朝6:00)に `affiliate/generate-article.mjs` を実行し、Anthropic API(Claude Haiku)で自動生成・コミットします。デプロイは `.github/workflows/deploy-pages.yml` が `main` ブランチへのプッシュをトリガーに `affiliate/build.mjs` を実行し、GitHub Pages に公開します。

## 自動化の仕組み

1. **毎日の記事自動生成**(`auto-article.yml`, cron `0 21 * * *`)
   - `ANTHROPIC_API_KEY` が Secrets に設定されていない場合はスキップ通知を出して正常終了します(エラーにはなりません)。
   - 設定されている場合、`affiliate/generate-article.mjs` が既存記事と重複しないトピックを選び、Claude Haiku で1記事分のMarkdownを生成し、`affiliate/content/<slug>.md` として保存します。
   - 新規ファイルがあれば `affiliate-bot` の名前で自動コミット・`main` へプッシュします(変更がなければ何もしません)。
2. **サイトのデプロイ**(`deploy-pages.yml`, `main` へのプッシュ / 手動実行)
   - `node affiliate/build.mjs` でルートアプリ + 全記事をビルドし、`dist/` を GitHub Pages にアップロード・デプロイします。
   - 記事が0件でもビルドは成功します(空のブログ一覧ページが生成されます)。

これにより、`ANTHROPIC_API_KEY` を設定してリポジトリを放置するだけで、毎日新しい記事が追加され、自動的にサイトへ反映されます。

## オーナーが手動で行う必要がある作業(この3つだけ)

自動化できない・オーナーの認証情報や外部サービス登録が必要な作業は、以下の3つのみです。

### (a) リポジトリの Secrets に `ANTHROPIC_API_KEY` を追加する

1. Anthropic Console (https://console.anthropic.com/) でAPIキーを発行する。
2. GitHubリポジトリの **Settings → Secrets and variables → Actions → New repository secret** を開く。
3. Name: `ANTHROPIC_API_KEY`、Value: 発行したAPIキーを入力して保存する。
4. これで `auto-article.yml` が毎日記事を自動生成するようになります(未設定の間はスキップされ続けます)。

### (b) ASP に登録し、取得したアフィリエイトURLを `affiliate/links.json` に貼る

1. A8.net、もしもアフィリエイト、バリューコマース等のASP(アフィリエイトサービスプロバイダ)に登録する。
2. 各AIツール(ChatGPT, Claude, Gemini, Notion AI, Canva, Midjourney, GitHub Copilot, Perplexity など)の提携プログラムを探し、審査を通過してアフィリエイトリンクを取得する。
3. `affiliate/links.json` を開き、該当する id の `"url"` フィールドに取得したアフィリエイトURLを貼り付ける(現在は空文字列 `""` になっており、`"official"` の公式サイトURLがフォールバックとして使われています)。
   ```json
   "chatgpt": {
     "label": "ChatGPT 公式サイトはこちら",
     "url": "https://your-affiliate-link.example.com/...",
     "official": "https://chatgpt.com/"
   }
   ```
4. `url` を設定した時点から、そのIDを使った `{{aff:chatgpt}}` プレースホルダーは自動的にアフィリエイトURLへのリンクに切り替わります(次回ビルド以降)。

### (c) Google Search Console でプロパティ登録し、sitemap.xml を送信する

1. Google Search Console (https://search.google.com/search-console) にアクセスし、`https://blitzendegen915-beep.github.io/petrichot/` をプロパティとして登録する(所有権の確認が必要です)。
2. 登録後、左メニューの「サイトマップ」から以下のURLを送信する:
   ```
   https://blitzendegen915-beep.github.io/petrichot/sitemap.xml
   ```
3. これにより検索エンジンのクロール・インデックス登録が促進されます。

## トピックの追加方法

`affiliate/generate-article.mjs` の先頭付近にある `TOPICS` 配列に、`{ key: "一意のキー", topic: "日本語のトピック説明" }` の形式でエントリを追加してください。`key` は既存記事のスラッグと照合して「カバー済みかどうか」を判定するために使われるため、生成される記事のスラッグに近い英単語ハイフン区切りにしてください。

新しいアフィリエイト先(ツール)を追加する場合は、`affiliate/links.json` に新しい id を追加し、`generate-article.mjs` の `TOPICS` にもそのツールに関するトピックを追加してください。

## ローカルでビルドを実行する方法

Node.js 18以上が必要です。

```sh
node affiliate/build.mjs
```

- `affiliate/content/*.md` を読み込み、`dist/` にサイト一式(ルートアプリ + ブログ)を生成します。
- 記事が1件もなくても正常終了します。
- 記事を1本手動で生成したい場合は `ANTHROPIC_API_KEY` を環境変数に設定した上で以下を実行してください:
  ```sh
  ANTHROPIC_API_KEY=sk-ant-... node affiliate/generate-article.mjs
  ```
- 生成・ビルド結果を確認したら、`dist/` はGitHub Actionsが自動生成するためコミット不要です。
