---
name: affiliate-status
description: アフィリエイトサイトの記事数・未設定リンク・ビルド健全性を点検する
---

# affiliate-status

このスキルは、アフィリエイトブログの現状を点検し、オーナーに報告するための手順です。

## 手順

1. **記事数の集計**
   - `affiliate/content/*.md` の件数を数える。
   - 各ファイルの frontmatter を読み、`title` / `slug` / `date` / `category` が揃っているか確認する。欠けているファイルがあれば一覧にする(build.mjs はそれらをスキップし警告を出す)。
   - 日付の新しいものから並べ、直近の更新頻度(直近7日・30日で何本追加されたか)を把握する。

2. **未収益化リンクの確認**
   - `affiliate/links.json` を読み、各エントリの `url` フィールドが空文字列 `""` のものを「未収益化(アフィリエイトURL未設定)」としてリストアップする。
   - `official` のみが設定されている状態は、公式サイトへのリンクとしては機能するが、アフィリエイト報酬は発生しないことを明記する。

3. **ビルド健全性の確認**
   - `node affiliate/build.mjs` を実行する。
   - 出力ログを確認し、以下を報告する:
     - ビルドが成功したか(exit code 0)
     - 生成された記事数("N article(s) built")
     - 警告メッセージ(`[build] Skipping ...`, `Unknown affiliate id ...` など)の有無と内容
   - `dist/index.html`, `dist/feed.xml`, `dist/sitemap.xml`, `dist/robots.txt` が生成されているか確認する。

4. **レポート作成**
   - 以下の形式で簡潔にまとめて報告する:
     - 記事数(公開数・欠陥ファイル数)
     - 未収益化リンクの一覧(id と label)
     - ビルド結果(成功/失敗、警告件数と概要)
     - 次のアクション提案(例: 「chatgpt, claude の2件が未収益化です。ASP登録後に affiliate/links.json の url を更新してください」)

## 注意事項

- このスキルは読み取りとビルド確認のみを行う。`affiliate/content/` や `affiliate/links.json` の内容を書き換えない(ユーザーから明示的に依頼された場合を除く)。
- `dist/` はビルド確認用の一時出力として扱い、コミットしない。
