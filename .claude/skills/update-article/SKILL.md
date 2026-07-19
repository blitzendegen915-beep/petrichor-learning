---
name: update-article
description: 既存記事をリライト・更新する(情報の陳腐化対応、fact-check反映、加筆)。slugを引数で指定
---

# update-article

## 手順

1. 対象記事 `affiliate/content/<slug>.md` を読む
2. 更新内容を適用(指示された修正、fact-checkリストの反映、加筆など)。以下は維持:
   - frontmatterスキーマ(titleを変える場合はslugは変えない — URL維持のため)
   - 記事の基本構成、`{{aff:ID}}`(位置の調整はOK、削除はユーザー指示がある時のみ)
   - `## 参考リンク`(承認済みURLリストのみ。new-articleスキル参照)
3. **frontmatterのdateを更新日に変える**(sitemapのlastmodに反映され、再クロールを促す)
4. `node affiliate/build.mjs` で警告ゼロを確認
5. 該当ファイルのみ `git add` → commit(`update: 「<タイトル>」を更新(<理由>)`)→ push

## リライトの原則

- 断定を弱める方向は自由にやってよい(「〜です」→「2026年時点では〜とされています」)
- 断定を強める・新しい事実を足す場合は、承認済みリストの公式ソースで確認できる内容だけにする
- 文体・トーンは既存記事に合わせる(教育記事はやさしい言葉)
