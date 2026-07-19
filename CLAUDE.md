# ペトリコール・ラーニング — 運営ルール

AI・プログラミング学習のロードマップとスクール比較のブログ(ペトリコール事業)。GitHub Pagesで公開。
公開URL: https://blitzendegen915-beep.github.io/petrichor-learning/

## 構成

- `affiliate/content/*.md` — 記事(frontmatter+Markdown)。これがコンテンツの本体
- `affiliate/links.json` — アフィリエイトリンク台帳(`{{aff:ID}}`で記事から参照)
- `affiliate/build.mjs` — 依存ゼロのSSG。`node affiliate/build.mjs` で `dist/` に全ページ生成
- `affiliate/static/` — OGP画像などの静的ファイル(dist/static/へコピーされる)
- `.github/workflows/deploy-pages.yml` — mainへのpushでビルド→gh-pagesブランチへデプロイ

## 鉄則

1. **`git reset --hard` 禁止** — 未pushの作業(レビュー待ち修正など)が存在しうる。origin/mainへの追従はfetch+merge/rebaseで
2. **`git add` は変更したファイルだけ個別指定** — `git add -A` は保留中の変更を巻き込む
3. push後のデプロイ確認は `git ls-remote origin gh-pages` のハッシュ変化で見る(1〜2分)
4. 記事の出典URLは new-article スキル内の承認済みリストのみ。**URLの捏造は厳禁**
5. 全記事に広告(`{{aff:ID}}`)を入れる方針(2026-07-19オーナー指示。教育記事も例外なし)
6. 誇大表現・断定的な収益/効果保証は書かない。料金・モデル名は「2026年時点」等でぼかす
7. 外部サイトへのcurl/fetchはこのコンテナからはほぼ遮断されている。サイト表示確認は `file:///workspace/petrichor-learning/dist/` をヘッドレスChromium(/opt/pw-browsers/chromium)で開く

## skills(.claude/skills/)

- `new-article` — 記事追加の全規約(タイプ判定・frontmatter・広告・参考リンク・公開手順)
- `update-article` — 既存記事の更新・リライト
- `add-aff-link` — 新しいASP案件の登録
- `affiliate-status` / `weekly-report` — 点検・運営レポート
- `fact-check` — 料金等の断定記述の洗い出し
- `visual-check` — スクリーンショット表示検証
- `seo-check` — sitemap/OGP/メタ情報の整合性点検
- `fix-deploy` — デプロイ失敗時の復旧手順
