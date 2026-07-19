---
name: fix-deploy
description: サイトのデプロイが失敗・停止した時の診断と復旧手順
---

# fix-deploy

## 診断フロー

1. **mainとgh-pagesの対応確認**: `git -C /workspace/petrichot ls-remote origin` — mainのハッシュが進んでいるのにgh-pagesが古いままなら、デプロイが走っていないか失敗している
2. **Actions実行状況**: `mcp__github__actions_list` (method: list_workflow_runs, branch: main, per_page: 3) で最新runのstatus/conclusionを見る
3. **失敗時のログ**: conclusion=failureなら `list_workflow_jobs` でどのstepが落ちたか特定 → `mcp__github__get_job_logs` (failed_only) で原因を読む

## よくある原因と対処

- **ビルドエラー**: 記事のfrontmatter不備や本文の構文問題。ローカルで `node affiliate/build.mjs` を再現→修正→push
- **Pages無効化**: gh-pagesブランチはあるのにサイトが404 → ユーザーにSettings→Pages(Deploy from a branch / gh-pages / root)の再設定を依頼(この操作は管理者のみ可能)
- **権限エラー(Resource not accessible)**: workflowのpermissions不足。deploy-pages.ymlの`permissions: contents: write`を確認
- **何も起きていない**: workflowファイルの構文エラーの可能性。`actions_list` (list_workflows) でworkflowが認識されているか確認

## 制約

- このコンテナから github.io への直接アクセスは遮断されている。「サイトが見えるか」の最終確認はユーザーに依頼するか、gh-pagesブランチの中身(get_file_contents)で代替する
- 修正をpushする時は該当ファイルのみadd(CLAUDE.mdの鉄則参照)
