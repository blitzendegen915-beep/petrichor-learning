---
name: add-aff-link
description: A8等で承認された新しいアフィリエイト案件をlinks.jsonに登録し、紹介記事を作る
---

# add-aff-link

ユーザーから渡されたアフィリエイトリンク(A8の `px.a8.net/...` 形式等)をサイトに組み込む手順。

## 登録前の判断(必ずやる)

- **サイト趣旨(AIツール+学生向けAIリテラシー)に合う案件か確認**。無関係な物販・金融・美容系は登録せず、理由を添えてユーザーに確認する。
- メンタルヘルス等のセンシティブ領域は、未成年読者がいるサイト特性を踏まえ慎重に(基本は見送り提案)。

## 手順

1. `affiliate/links.json` に新IDを追加:
   ```json
   "new-id": { "label": "ツール名 公式サイトはこちら", "url": "<A8リンク>", "official": "" }
   ```
   - IDは英小文字ハイフン。urlにアフィリエイトリンク、officialは不明なら空でよい(url優先で使われる)。
2. 紹介記事を new-article スキルの規約で作成し、`{{aff:new-id}}` を挿入(1記事1〜2個)。
3. `node affiliate/build.mjs` 後、`grep -l 'a8mat' dist/*/index.html` で新リンクがCTA化されたことを確認。
4. links.json と新記事のみ add → commit → push。

## 注意

- リンクURLは一字も変えずそのまま使う(パラメータが報酬計測に使われる)。
- 教育記事(AIをはじめて学ぶ)には絶対に入れない。
