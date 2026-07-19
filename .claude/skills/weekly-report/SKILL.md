---
name: weekly-report
description: ブログの運営状況を総点検し、ユーザー向けレポートを作成する(記事数推移・カテゴリバランス・リンク状態・デプロイ健全性)
---

# weekly-report

## 収集する情報

1. **記事統計**: `affiliate/content/*.md` の総数、直近7日/30日の追加数(frontmatterのdate集計)、カテゴリ別内訳(教育記事比率が1/3前後か)
2. **収益化状態**: `affiliate/links.json` でurlが入っているID(=収益リンク)と空のID(=公式リンクのみ)を分類。収益リンクが記事何本で使われているかを `grep -l '{{aff:<id>}}' affiliate/content/` で集計
3. **ビルド健全性**: `node affiliate/build.mjs` を実行し、警告(スキップ記事・不明ID)ゼロを確認
4. **デプロイ状態**: `git ls-remote origin gh-pages` と直近のmainコミットの対応、`git log --oneline -5` で最近の更新履歴
5. **自動生成の稼働**: `git log --oneline --grep='auto:' -5` で定期実行が動いているか(週3回のペースで増えているか)

## 出力

Markdownレポートにまとめ、SendUserFileで送る。構成: サマリー(1段落) → 記事統計表 → 収益化リンク稼働表 → 問題があれば「要対応」セクション(なければ「問題なし」と明記)。

## 注意

- 問題が見つかったら報告だけでなく、修正案も添える(修正の実行はユーザー確認後)
- アクセス数・収益額はこの環境からは取得不可(Search Console/A8の画面はユーザーしか見られない)。レポートに「取得不能項目」として明記し、ユーザーに画面確認を促す
