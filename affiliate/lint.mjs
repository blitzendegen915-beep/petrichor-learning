#!/usr/bin/env node
// affiliate/lint.mjs
// 記事の機械的チェック。捏造・規約違反のうち、判断を要さないものを確定的に検出する。
//
//   node affiliate/lint.mjs              全記事をチェック
//   node affiliate/lint.mjs path.md ...  指定ファイルのみ
//
// 終了コード: ERROR が1件でもあれば 1(公開を止める)、WARN のみなら 0。
//
// 設計方針:
//   ERROR = 機械的に「違反」と断定できるもの。修正必須。
//   WARN  = 機械では正否を判定できないが、捏造が起きやすい箇所。人/上位モデルが目視する。
// LLMは外部の事実を検証できない(参考リンクの文書名が実在するか等は判定不能)。
// そこで「検証できない種類の記述をそもそも書かせない」方向でルール化している。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT_DIR = path.join(__dirname, "content");
const LINKS_PATH = path.join(__dirname, "links.json");

// 内部リンクの判定に使う自サイトのURL。site.config.json から読む。
// このサイトは github.io のサブパス配信なので、ホスト名だけでは判定できない。
const SITE_BASE = JSON.parse(
  fs.readFileSync(path.join(__dirname, "site.config.json"), "utf8"),
).baseUrl.replace(/\/$/, "");

// 記事の出典として書いてよい外部URL。ここに無いURLはエラー。
// 追加するときは、実在を確認してから足すこと。
const ALLOWED_URL_PREFIXES = [
  // AIツール
  "https://openai.com/",
  "https://chatgpt.com/",
  "https://claude.ai/",
  "https://www.anthropic.com/",
  "https://gemini.google.com/",
  "https://blog.google/technology/ai/",
  "https://github.com/features/copilot",
  // 学習サービス(links.json に載せている公式サイト)
  "https://techacademy.jp/",
  "https://prog-8.com/",
  "https://dotinstall.com/",
  "https://www.udemy.com/",
  "https://schoo.jp/",
  // 公的機関
  "https://www.mext.go.jp/",
  "https://www.ipa.go.jp/",
  "https://www.soumu.go.jp/johotsusintokei/whitepaper/",
  "https://www.mhlw.go.jp/",
];

// 断定的・誇大な表現。文脈を問わず不適切なものだけを入れる。
const BANNED = [
  "誰でも簡単",
  "圧倒的",
  "最強",
  "劇的に",
  "完全無料",
  "無制限に使え",
  "必ず稼げ",
  "確実に稼げ",
  "誰でも稼げ",
  "収益を保証",
  "効果を保証",
  "100%安全",
  "100%正確",
  "絶対に安全",
  "誰でも成功",
];

// 文脈次第で許容されるが、多用すると誇大になる表現。
const SOFT = ["大幅に", "劇的", "一瞬で", "簡単に稼", "すぐに稼"];

// 出典を第三者に帰属させる記述。調査・統計・レポートの実在をこちらで確認できないため、
// 「〇〇の調査によると」の形は一律禁止する。実在する組織名を使った捏造は最も害が大きい。
const ATTRIBUTION_PATTERNS = [
  /([^\s、。]{2,20})の(調査|統計|レポート|報告書|データ|試算|分析)(に)?(よると|よれば|では)/g,
  /(調査|統計|レポート|報告書)(に)?(よると|よれば)/g,
  /(による|によれば)調査/g,
];

// 実在する調査会社・官公庁の名前。承認済みURLの出典として引く以外の言及は捏造リスクが高い。
const RESEARCH_ORGS = [
  "Gartner", "ガートナー", "IDC", "Forrester", "フォレスター",
  "McKinsey", "マッキンゼー", "Statista", "PwC", "デロイト", "Deloitte",
  "野村総研", "矢野経済", "MM総研",
];

// 成果を約束する表現。景品表示法・特定商取引法の観点でも避ける。
const GUARANTEE_PATTERNS = [
  /確実な(業務改善|成果|効果|収益)/g,
  /確実に(実現|達成|改善|稼|回収)/g,
  /必ず(実現|達成|成功|稼)/g,
  /保証(します|されます|付き)/g,
  /間違いなく(成功|改善|稼)/g,
];

// 捏造が集中する数値パターン。実在確認ができないので必ず目視する。
const NUMERIC_PATTERNS = [
  { re: /\d+\s*%/g, label: "パーセント" },
  { re: /\d[\d,]*\s*円/g, label: "金額(円)" },
  { re: /\$\s*\d/g, label: "金額(ドル)" },
  { re: /\d+\s*ドル/g, label: "金額(ドル)" },
  { re: /\d+\s*倍/g, label: "倍率" },
  { re: /\d+\s*秒(で|以内|程度|ほど)/g, label: "所要時間(秒)" },
  { re: /\d+\s*分(で|に短縮|以内|程度|ほど)/g, label: "所要時間(分)" },
  { re: /\d+\s*時間(で|に短縮|削減|の削減)/g, label: "所要時間(時間)" },
  { re: /\d+\s*(日|週|ヶ月|か月|年)(で|以内)(完了|回収|実現|達成)/g, label: "期間の約束" },
  { re: /\d+\s*ページ(以上|以下|程度|ほど)/g, label: "分量(ページ)" },
  { re: /\d+\s*(人|社|件|万人)(以上|の企業|が利用)/g, label: "規模・実績" },
  { re: /\d+\s*割(以上|以下|程度|ほど|近く|強|弱)?/g, label: "割合" },
  { re: /約\s*\d/g, label: "概数" },
  { re: /数(十|百|千)\s*(時間|分|万円|円|%|パーセント)/g, label: "漠然とした規模" },
];

// 全角の数字と記号は \d や % にマッチせず、検出を素通りしてしまう。
// 1文字を1文字に置き換えるだけなので、文字位置(=行番号の算出)はずれない。
function normalizeForNumericScan(text) {
  return text
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/％/g, "%")
    .replace(/＄/g, "$")
    .replace(/，/g, ",");
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: null, body: raw, fmLines: 0 };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    data[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { data, body: m[2], fmLines: m[1].split(/\r?\n/).length + 2 };
}

function lintFile(file, links) {
  const raw = fs.readFileSync(file, "utf8");
  const base = path.basename(file, ".md");
  const errors = [];
  const warns = [];
  const { data, body, fmLines } = parseFrontmatter(raw);
  const lineOf = (idx) => raw.slice(0, idx).split("\n").length;

  if (!data) {
    errors.push([1, "frontmatterが見つからない"]);
    return { file, errors, warns };
  }

  // --- frontmatter ---
  for (const key of ["title", "description", "slug", "date", "category", "tags"]) {
    if (!data[key]) errors.push([1, `frontmatterに ${key} がない`]);
  }
  if (data.slug && data.slug !== base) {
    errors.push([1, `slug(${data.slug})とファイル名(${base})が一致しない`]);
  }
  if (data.slug && !/^[a-z0-9-]+$/.test(data.slug)) {
    errors.push([1, `slugに使えない文字がある: ${data.slug}`]);
  }
  if (data.date && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
    errors.push([1, `dateの形式が不正: ${data.date}`]);
  }
  if (data.description) {
    const n = data.description.length;
    if (n < 60 || n > 140) warns.push([1, `descriptionが${n}字(推奨60〜140字)`]);
  }

  // --- 本文構造 ---
  const bodyLines = body.split("\n");
  bodyLines.forEach((line, i) => {
    if (/^#\s/.test(line)) {
      errors.push([fmLines + i + 1, "本文にh1(#)がある。タイトルはテンプレートが出す"]);
    }
  });
  if (!/^##\s*参考リンク\s*$/m.test(body)) {
    errors.push([1, "「## 参考リンク」セクションがない"]);
  }
  // 図(```svg)やコードブロックの中身は読み物としての分量ではないので数えない
  const prose = body.replace(/^```[\s\S]*?^```/gm, "");
  const bodyChars = prose.replace(/\s/g, "").length;
  if (bodyChars < 1200) warns.push([1, `本文が${bodyChars}字と短い(目安1500〜2500字)`]);
  if (bodyChars > 3500) warns.push([1, `本文が${bodyChars}字と長い(目安1500〜2500字)`]);

  // --- 広告プレースホルダ ---
  const affIds = [...raw.matchAll(/\{\{aff:([\w-]+)\}\}/g)];
  if (affIds.length === 0) {
    warns.push([1, "{{aff:ID}}が1つもない(全記事に広告を入れる方針)"]);
  }
  for (const m of affIds) {
    if (!links[m[1]]) {
      errors.push([lineOf(m.index), `links.jsonに存在しないID: {{aff:${m[1]}}}`]);
    }
  }

  // --- URL ---
  for (const m of raw.matchAll(/\]\((https?:\/\/[^)]+)\)/g)) {
    const url = m[1];
    const line = lineOf(m.index);
    if (url.startsWith(SITE_BASE)) {
      // 内部リンク: 記事の実在を確認(タグ/カテゴリ/トップは対象外)
      const rest = url.slice(SITE_BASE.length).replace(/^\//, "").replace(/\/$/, "");
      if (rest && /^[a-z0-9-]+$/.test(rest) && !fs.existsSync(path.join(CONTENT_DIR, `${rest}.md`))) {
        errors.push([line, `内部リンク先の記事が存在しない: ${rest}`]);
      }
      continue;
    }
    if (!ALLOWED_URL_PREFIXES.some((p) => url.startsWith(p))) {
      errors.push([line, `許可リストにない外部URL: ${url}`]);
    }
  }

  // --- 参考リンクの文書名捏造 ---
  // 「〇〇白書」のような文書名は実在確認ができない。サイト名のみ書かせる。
  const refIdx = body.search(/^##\s*参考リンク\s*$/m);
  if (refIdx !== -1) {
    const refBlock = body.slice(refIdx);
    for (const m of refBlock.matchAll(/^\s*[-*]\s*\[([^\]]+)\]/gm)) {
      if (/[「『]/.test(m[1])) {
        errors.push([
          fmLines + body.slice(0, refIdx + m.index).split("\n").length,
          `参考リンクに文書名らしき記述がある(実在確認できないため禁止): ${m[1]}`,
        ]);
      }
    }
  }

  // --- 禁止表現 ---
  for (const word of BANNED) {
    let idx = raw.indexOf(word);
    while (idx !== -1) {
      errors.push([lineOf(idx), `禁止表現: ${word}`]);
      idx = raw.indexOf(word, idx + 1);
    }
  }
  for (const word of SOFT) {
    const idx = raw.indexOf(word);
    if (idx !== -1) warns.push([lineOf(idx), `要検討の表現: ${word}`]);
  }

  // --- 第三者への出典帰属(捏造の温床) ---
  for (const re of ATTRIBUTION_PATTERNS) {
    for (const m of body.matchAll(re)) {
      errors.push([
        fmLines + body.slice(0, m.index).split("\n").length,
        `出典を第三者に帰属させる記述は禁止(実在確認ができない): 「${m[0]}」`,
      ]);
    }
  }
  for (const org of RESEARCH_ORGS) {
    const idx = body.indexOf(org);
    if (idx !== -1) {
      errors.push([
        fmLines + body.slice(0, idx).split("\n").length,
        `調査会社・シンクタンク名の言及は禁止(統計の捏造につながる): ${org}`,
      ]);
    }
  }

  // --- 成果の保証 ---
  for (const re of GUARANTEE_PATTERNS) {
    for (const m of body.matchAll(re)) {
      errors.push([
        fmLines + body.slice(0, m.index).split("\n").length,
        `成果を約束する表現は禁止: 「${m[0]}」`,
      ]);
    }
  }

  // --- 見出しの個数宣言と実際の項目数 ---
  for (const m of body.matchAll(/^#{2,3}\s*.*?(\d+)\s*つ.*$/gm)) {
    const declared = Number(m[1]);
    const after = body.slice(m.index + m[0].length);
    const section = after.split(/^#{2,3}\s/m)[0];
    const bullets = (section.match(/^\s*[-*]\s/gm) || []).length;
    const numbered = (section.match(/^\s*\*\*\d+\./gm) || []).length
      + (section.match(/^\s*\d+\.\s/gm) || []).length;
    const count = Math.max(bullets, numbered);
    if (count > 0 && count !== declared) {
      warns.push([
        fmLines + body.slice(0, m.index).split("\n").length,
        `見出しは「${declared}つ」だが項目が${count}個ある`,
      ]);
    }
  }

  // --- 数値(捏造多発地帯) ---
  const hits = [];
  const scanBody = normalizeForNumericScan(body);
  for (const { re, label } of NUMERIC_PATTERNS) {
    for (const m of scanBody.matchAll(re)) {
      hits.push({ line: fmLines + scanBody.slice(0, m.index).split("\n").length, label, text: m[0].trim() });
    }
  }
  if (hits.length) {
    const shown = hits.slice(0, 8).map((h) => `L${h.line}:${h.text}(${h.label})`).join(" ");
    warns.push([
      hits[0].line,
      `要事実確認の数値が${hits.length}件: ${shown}${hits.length > 8 ? " …" : ""}`,
    ]);
  }

  return { file, errors, warns };
}

function main() {
  const links = JSON.parse(fs.readFileSync(LINKS_PATH, "utf8"));
  const args = process.argv.slice(2);
  const files = args.length
    ? args
    : fs.readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md")).map((f) => path.join(CONTENT_DIR, f));

  let nErr = 0;
  let nWarn = 0;
  for (const file of files) {
    const { errors, warns } = lintFile(file, links);
    if (!errors.length && !warns.length) continue;
    console.log(`\n${path.relative(process.cwd(), file)}`);
    for (const [line, msg] of errors.sort((a, b) => a[0] - b[0])) {
      console.log(`  ERROR L${line}: ${msg}`);
    }
    for (const [line, msg] of warns.sort((a, b) => a[0] - b[0])) {
      console.log(`  WARN  L${line}: ${msg}`);
    }
    nErr += errors.length;
    nWarn += warns.length;
  }

  console.log(
    `\n[lint] ${files.length}件をチェック — エラー ${nErr} / 警告 ${nWarn}`
  );
  if (nErr) {
    console.log("[lint] ERRORは公開前に必ず修正すること。");
    process.exit(1);
  }
  if (nWarn) {
    console.log("[lint] WARNは機械では判定できない。数値・表現を目視で確認すること。");
  }
}

main();
