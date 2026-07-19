---
name: seo-check
description: sitemap・robots・canonical・OGP・メタ情報の整合性を点検する
---

# seo-check

## 点検項目(すべて dist/ をビルドしてから)

1. **sitemap.xml**: 記事数+1(トップ)のURL数があるか、全URLが `https://blitzendegen915-beep.github.io/petrichot/` 配下か、lastmodが妥当か
2. **robots.txt**: `Allow: /` と `Sitemap:` 行があるか
3. **各ページのメタ**(サンプル3ページで確認):
   - `<title>` が「記事タイトル | AIツールの透視図」形式
   - meta description がfrontmatterのdescriptionと一致
   - canonical URLが正しい(末尾スラッシュあり)
   - og:image が `dist/static/ogp.png` を指している(存在も確認)
   - google-site-verification タグが残っている(消すとSearch Console所有権が外れる)
4. **JSON-LD**: 記事ページにArticle、トップにWebSiteがあるか(`grep 'application/ld+json'`)
5. **h1の一意性**: 各記事ページでh1が1個(`grep -c '<h1'`)
6. **description長**: frontmatterのdescriptionが80〜110字に収まっているか(全記事をスクリプトで集計)

## 出力

問題のあった項目だけを一覧化して報告。ゼロなら「全項目OK」と一言。修正が必要な場合は修正内容を提示し、ユーザー確認またはCLAUDE.mdの鉄則に従って対応。

## 補足

- Search Consoleの画面(インデックス状況・サイトマップ取得状態)はユーザーにしか見えない。必要ならスクリーンショットを依頼する
- Googleのクロールは新規サイトで数日〜数週間かかるのが正常。ファイルが正しければ「待ち」が正解のことが多い
