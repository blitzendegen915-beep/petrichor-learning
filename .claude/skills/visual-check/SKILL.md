---
name: visual-check
description: サイトをPC幅・モバイル390px幅でスクリーンショットし、レイアウト崩れ・横スクロールを点検する
---

# visual-check

ビルド済みサイトの表示をヘッドレスChromiumで検証する。

## 前提

- `node affiliate/build.mjs` でdist/を最新化しておく。
- playwright-core はscratchpadに `npm install playwright-core` 済みのはず(なければ入れる)。Chromium実行パスは `/opt/pw-browsers/chromium`。
- このコンテナからは外部サイト(github.io)に接続できないため、**必ず `file:///workspace/petrichot/dist/...` のローカルファイルを開く**。

## 手順(スクリプト例)

```js
import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [name, w, h] of [['pc', 1280, 900], ['mobile', 390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto('file:///workspace/petrichot/dist/index.html');
  await p.waitForTimeout(800);
  await p.screenshot({ path: `check-${name}.png`, fullPage: false });
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  console.log(name, 'horizontal overflow:', overflow);
}
await b.close();
```

## チェック項目

- 横スクロール(overflow)が両幅でfalseであること
- 記事ページ: h1が1つ、表がはみ出していない、アイキャッチ表示、PR表記(広告記事のみ)、参考リンクの↗表示
- ダークモードは `newPage({ colorScheme: 'dark' })` で確認
- スクリーンショットはSendUserFileでユーザーに送る
