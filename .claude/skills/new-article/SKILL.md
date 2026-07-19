---
name: new-article
description: 「ペトリコール・ラーニング」に新規記事を1本追加してビルド・公開する。トピックを引数で指定可能
---

# new-article

`affiliate/content/` に記事を1本追加し、ビルド確認して公開する手順。引数でトピック指定があればそれを使い、なければ既存記事と重複しないトピックを選ぶ。

## 記事の方向性

AI・プログラミング学習がテーマ。category は 学習ロードマップ/スクール比較/キャリア のいずれか。`affiliate/links.json` の既存IDから1〜2個選び、`{{aff:ID}}` を紹介直後やまとめ前など自然な位置に**単独行**で挿入。

- スクールの具体的な料金額は断定しない(「公式サイトで最新料金を確認」と誘導)
- 「必ず転職できる/稼げる」等の保証表現は厳禁。挫折や限界の話も正直に書く(信頼が資産)

## frontmatter スキーマ(厳守)

```
---
title: 記事タイトル(30字前後)
description: メタディスクリプション(80〜110字)
slug: lowercase-ascii-hyphens
date: YYYY-MM-DD(今日)
category: カテゴリ名
tags: [タグ1, タグ2, タグ3]
---
```

## 本文ルール

- 1500〜2500字の自然な日本語。導入 → `##` 見出し数個 → 箇条書き活用 → `## まとめ`。
- **本文に `#`(h1)を書かない**(タイトルはテンプレートが出す。書いてもビルドが降格/除去するが、最初から書かない)。
- 比較にはGFM表(`| a | b |` + 区切り行)が使える(ビルドが変換)。
- 誇大表現・断定的な収益/効果保証は禁止。料金・モデル名などは断定を避け「2026年時点」等でぼかす。
- 記事末尾に必ず `## 参考リンク`(2〜4個)。**URLは承認済みリストのみ(捏造厳禁)**:
  techacademy.jp, prog-8.com, dotinstall.com, www.udemy.com, schoo.jp, openai.com/chatgpt/, claude.ai, github.com/features/copilot, www.anthropic.com, www.soumu.go.jp/johotsusintokei/whitepaper/, www.mext.go.jp, www.ipa.go.jp

## ビルド・公開

1. `node affiliate/build.mjs` — エラー・警告ゼロ、記事数+1を確認。
2. **`git reset --hard` は使わない**(未pushの作業を破壊しうる)。`git add` は新規記事ファイルのみ。
3. commit(`auto: 新規記事「<タイトル>」を追加`)→ `git push origin main`。
4. push後1〜2分で `git ls-remote origin gh-pages` のハッシュが変わればデプロイ成功。
