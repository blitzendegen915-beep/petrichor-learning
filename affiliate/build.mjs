#!/usr/bin/env node
// affiliate/build.mjs
// Zero-dependency static site generator for the affiliate blog.
// Usage: node affiliate/build.mjs
// Reads affiliate/content/*.md and writes the full site into dist/.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const AFFILIATE_DIR = __dirname;
const CONTENT_DIR = path.join(AFFILIATE_DIR, "content");
const STATIC_DIR = path.join(AFFILIATE_DIR, "static");
const DIST_DIR = path.join(ROOT, "dist");

// ---------------------------------------------------------------------------
// Config / links
// ---------------------------------------------------------------------------

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[build] Could not read ${filePath}: ${err.message}`);
    return fallback;
  }
}

const CONFIG = readJson(path.join(AFFILIATE_DIR, "site.config.json"), {
  siteName: "ペトリコール・ラーニング",
  baseUrl: "https://blitzendegen915-beep.github.io/petrichor-learning",
  blogPath: "",
  author: "ペトリコール・ラーニング編集部",
  description: "AI時代のスキル学習ガイド",
});

const LINKS = readJson(path.join(AFFILIATE_DIR, "links.json"), {});

const SITE_ROOT_URL = `${CONFIG.baseUrl}/`;
const BLOG_INDEX_URL = `${CONFIG.baseUrl}${CONFIG.blogPath}/`;
const BLOG_OUT_DIR = path.join(DIST_DIR, ...CONFIG.blogPath.split("/").filter(Boolean));

function articleUrl(slug) {
  return `${CONFIG.baseUrl}${CONFIG.blogPath}/${slug}/`;
}

// If affiliate/static/ogp.png exists it is copied to dist/static/ogp.png and
// referenced as the default OGP image site-wide; otherwise pages fall back
// to the previous (image-less) meta behavior.
const HAS_OGP_IMAGE = fs.existsSync(path.join(STATIC_DIR, "ogp.png"));
const OGP_IMAGE_URL = HAS_OGP_IMAGE ? `${CONFIG.baseUrl}/static/ogp.png` : null;
const HAS_FAVICON = fs.existsSync(path.join(STATIC_DIR, "favicon.svg"));

const PRIVACY_URL = `${CONFIG.baseUrl}${CONFIG.blogPath}/privacy/`;
const ABOUT_URL = `${CONFIG.baseUrl}${CONFIG.blogPath}/about/`;
const CONTACT_URL = `${CONFIG.baseUrl}${CONFIG.blogPath}/contact/`;
const CONTACT_EMAIL = "dar42508@gmail.com";

const DISCLOSURE_TEXT =
  "※本記事にはプロモーション(アフィリエイト広告)が含まれています。";

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

// ---------------------------------------------------------------------------
// Frontmatter parsing (YAML-lite, hand-rolled)
// ---------------------------------------------------------------------------

function stripQuotes(val) {
  const trimmed = val.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseTags(raw) {
  if (raw === undefined || raw === null || raw === "") return [];
  const trimmed = String(raw).trim();
  if (trimmed.startsWith("[")) {
    try {
      const jsonish = trimmed.replace(/'/g, '"');
      const parsed = JSON.parse(jsonish);
      if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean);
    } catch (err) {
      // fall through to comma-list handling below
    }
    return trimmed
      .replace(/^\[/, "")
      .replace(/\]$/, "")
      .split(",")
      .map((s) => stripQuotes(s.trim()))
      .filter(Boolean);
  }
  return trimmed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: raw };
  }
  const [, yamlBlock, body] = match;
  const data = {};
  for (const line of yamlBlock.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    data[key] = val;
  }
  data.tags = parseTags(data.tags);
  return { data, body };
}

// ---------------------------------------------------------------------------
// Affiliate CTA rendering
// ---------------------------------------------------------------------------

function renderCta(id, standalone) {
  const link = LINKS[id];
  if (!link) {
    console.warn(`[build] Unknown affiliate id in {{aff:${id}}} — skipping.`);
    return "";
  }
  const href = link.url && link.url.trim() ? link.url : link.official;
  if (!href) {
    console.warn(`[build] Affiliate id "${id}" has no url or official fallback — skipping.`);
    return "";
  }
  const label = escapeHtml(link.label || id);
  const btn = `<a class="aff-btn" href="${escapeHtml(href)}" rel="sponsored nofollow noopener" target="_blank">${label}</a>`;
  return standalone ? `<div class="aff-cta">${btn}</div>` : btn;
}

const AFF_RE = /\{\{aff:([\w-]+)\}\}/g;
const AFF_STANDALONE_RE = /^\{\{aff:([\w-]+)\}\}$/;

// ---------------------------------------------------------------------------
// Minimal markdown renderer
// ---------------------------------------------------------------------------

function renderInline(escapedText) {
  let out = escapedText;
  // inline code
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, txt) => `<strong>${txt}</strong>`);
  // links
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const external = /^https?:\/\//i.test(url);
    const rel = external ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${url}"${rel}>${text}</a>`;
  });
  // affiliate placeholders embedded mid-paragraph
  out = out.replace(AFF_RE, (_m, id) => renderCta(id, false));
  return out;
}

// 確認問題。記事側は次の形で書く。
//   Q: 設問
//   - 誤りの選択肢
//   * 正しい選択肢 | 正解時に出す解説
// 採点はブラウザ内で完結する。答えをHTMLに直接埋めるため、
// ソースを読めば正解は分かるが、学習用途なので割り切る。
function parseQuiz(raw) {
  const questions = [];
  let cur = null;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const q = t.match(/^Q\s*[:：]\s*(.+)$/);
    if (q) {
      cur = { q: q[1].trim(), options: [] };
      questions.push(cur);
      continue;
    }
    const o = t.match(/^([-*])\s+(.+)$/);
    if (o && cur) {
      const [text, explain = ""] = o[2].split("|").map((s) => s.trim());
      cur.options.push({ text, correct: o[1] === "*", explain });
    }
  }
  for (const item of questions) {
    if (item.options.length < 2) throw new Error(`確認問題の選択肢が足りません: ${item.q}`);
    if (!item.options.some((o) => o.correct)) throw new Error(`正解が指定されていません: ${item.q}`);
  }
  if (!questions.length) throw new Error("確認問題が空です");
  return questions;
}

function renderQuiz(raw) {
  const questions = parseQuiz(raw);
  const body = questions
    .map(
      (item, qi) => `
    <li class="qz-q">
      <p class="qz-text"><span class="qz-num">Q${qi + 1}</span>${renderInline(escapeHtml(item.q))}</p>
      <div class="qz-opts">
        ${item.options
          .map(
            (o, oi) =>
              `<button type="button" class="qz-opt" data-q="${qi}" data-o="${oi}" data-correct="${o.correct ? "1" : "0"}">${escapeHtml(o.text)}</button>`,
          )
          .join("\n        ")}
      </div>
      <p class="qz-explain" data-q="${qi}" hidden></p>
    </li>`,
    )
    .join("");

  // 解説は「正解です。」を除いた本体だけを持たせ、
  // 正誤に応じた前置きはブラウザ側で付ける(誤答時に「正解です」と出さないため)。
  const explains = questions.map((item) =>
    (item.options.find((o) => o.correct).explain || "").replace(/^正解です。\s*/, ""),
  );

  return `
<div class="qz" data-total="${questions.length}">
  <ol class="qz-list">${body}</ol>
  <p class="qz-score" hidden></p>
</div>
<script>
(function () {
  var root = document.currentScript.previousElementSibling;
  var explains = ${JSON.stringify(explains).replace(/</g, "\\u003c")};
  var total = Number(root.dataset.total);
  var answered = {};

  root.querySelectorAll(".qz-opt").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var qi = btn.dataset.q;
      if (answered[qi]) return;
      answered[qi] = true;

      var correct = btn.dataset.correct === "1";
      root.querySelectorAll('.qz-opt[data-q="' + qi + '"]').forEach(function (b) {
        b.disabled = true;
        if (b.dataset.correct === "1") b.classList.add("is-correct");
      });
      if (!correct) btn.classList.add("is-wrong");

      var ex = root.querySelector('.qz-explain[data-q="' + qi + '"]');
      ex.textContent =
        (correct ? "正解です。" : "惜しい。正解は色の付いた選択肢です。") + explains[qi];
      ex.hidden = false;

      if (Object.keys(answered).length === total) {
        var n = root.querySelectorAll(".qz-opt.is-correct:not(.is-wrong)").length;
        var wrong = root.querySelectorAll(".qz-opt.is-wrong").length;
        var score = root.querySelector(".qz-score");
        score.textContent = total - wrong + " / " + total + " 問正解";
        score.hidden = false;
      }
    });
  });
})();
</script>`;
}

function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const htmlParts = [];
  let i = 0;

  function flushParagraph(buf) {
    if (!buf.length) return;
    const joined = buf.join("<br>");
    htmlParts.push(`<p>${renderInline(joined)}</p>`);
  }

  let paragraphBuf = [];

  function flush() {
    flushParagraph(paragraphBuf);
    paragraphBuf = [];
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // fenced code block
    if (trimmed.startsWith("```")) {
      flush();
      const lang = trimmed.slice(3).trim().split(/\s+/)[0].toLowerCase();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      const rawBlock = codeLines.join("\n");
      if (lang === "quiz") {
        htmlParts.push(renderQuiz(rawBlock));
        continue;
      }
      htmlParts.push(`<pre><code>${escapeHtml(rawBlock)}</code></pre>`);
      continue;
    }

    // standalone affiliate placeholder
    if (AFF_STANDALONE_RE.test(trimmed)) {
      flush();
      const id = trimmed.match(AFF_STANDALONE_RE)[1];
      htmlParts.push(renderCta(id, true));
      i++;
      continue;
    }

    // GFM table: header row + separator row
    if (
      trimmed.startsWith("|") &&
      i + 1 < lines.length &&
      /^\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1].trim()) &&
      lines[i + 1].includes("-")
    ) {
      flush();
      const splitRow = (row) => {
        let cells = row.trim().split("|").map((c) => c.trim());
        if (cells.length && cells[0] === "") cells = cells.slice(1);
        if (cells.length && cells[cells.length - 1] === "") cells = cells.slice(0, -1);
        return cells;
      };
      const headers = splitRow(lines[i]);
      i += 2; // skip header + separator
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      const th = headers.map((h) => `<th>${renderInline(escapeHtml(h))}</th>`).join("");
      const trs = rows
        .map((r) => `<tr>${r.map((c) => `<td>${renderInline(escapeHtml(c))}</td>`).join("")}</tr>`)
        .join("");
      htmlParts.push(
        `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`
      );
      continue;
    }

    // horizontal rule
    if (/^-{3,}$/.test(trimmed)) {
      flush();
      htmlParts.push("<hr>");
      i++;
      continue;
    }

    // headings
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flush();
      const level = Math.max(headingMatch[1].length, 2); // body h1 demoted: page h1 is the frontmatter title
      htmlParts.push(`<h${level}>${renderInline(escapeHtml(headingMatch[2]))}</h${level}>`);
      i++;
      continue;
    }

    // blockquote
    if (trimmed.startsWith("> ")) {
      flush();
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const inner = quoteLines.map((l) => renderInline(escapeHtml(l))).join("<br>");
      htmlParts.push(`<blockquote><p>${inner}</p></blockquote>`);
      continue;
    }

    // unordered list
    if (/^-\s+/.test(trimmed)) {
      flush();
      const items = [];
      while (i < lines.length && /^-\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^-\s+/, ""));
        i++;
      }
      const li = items.map((it) => `<li>${renderInline(escapeHtml(it))}</li>`).join("");
      htmlParts.push(`<ul>${li}</ul>`);
      continue;
    }

    // ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      flush();
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      const li = items.map((it) => `<li>${renderInline(escapeHtml(it))}</li>`).join("");
      htmlParts.push(`<ol>${li}</ol>`);
      continue;
    }

    // blank line -> paragraph separator
    if (trimmed === "") {
      flush();
      i++;
      continue;
    }

    // plain paragraph line
    paragraphBuf.push(escapeHtml(line));
    i++;
  }

  flush();
  return htmlParts.join("\n");
}

// ---------------------------------------------------------------------------
// Sources / references section styling
// ---------------------------------------------------------------------------
// Detects an "## 参考リンク" heading in the rendered article HTML and wraps
// that section (heading + everything after it) in <section class="sources">
// so it can be styled distinctly (smaller type, top border, external-link
// affordance). A small post-processing step on already-rendered HTML rather
// than a markdown-parser change, since the section is just a normal h2 + list.

function wrapSourcesSection(html) {
  const headingRe = /<h2>[\s\S]*?<\/h2>/g;
  let match;
  let sourcesStart = -1;
  while ((match = headingRe.exec(html))) {
    if (match[0].includes("参考リンク")) {
      sourcesStart = match.index;
      break;
    }
  }
  if (sourcesStart === -1) return html;
  const before = html.slice(0, sourcesStart);
  const after = html.slice(sourcesStart);
  return `${before}<section class="sources">\n${after}\n</section>`;
}

// ---------------------------------------------------------------------------
// Per-article generated eyecatch (inline SVG, deterministic, zero assets)
// ---------------------------------------------------------------------------
// Every article gets a decorative abstract SVG derived from its slug (seeds
// the geometry so each article looks different) and category (drives the
// color scheme, reusing the same hue families as categoryChipClass so it
// stays on-brand). Colors are emitted as CSS custom properties so the same
// markup adapts correctly to light/dark automatically. No runtime JS.

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const EYECATCH_PALETTE = {
  "chip-edu": { main: "var(--eye-edu)", soft: "var(--eye-edu-soft)" },
  "chip-a": { main: "var(--eye-a)", soft: "var(--eye-a-soft)" },
  "chip-b": { main: "var(--eye-b)", soft: "var(--eye-b-soft)" },
  "chip-c": { main: "var(--eye-c)", soft: "var(--eye-c-soft)" },
  "chip-d": { main: "var(--eye-d)", soft: "var(--eye-d-soft)" },
  "chip-e": { main: "var(--eye-e)", soft: "var(--eye-e-soft)" },
};

function eyecatchPalette(category) {
  const cls = categoryChipClass(category);
  return EYECATCH_PALETTE[cls] || { main: "var(--accent)", soft: "var(--accent-soft)" };
}

function generateEyecatch(slug, category) {
  const rand = mulberry32(hashStr(slug));
  const { main, soft } = eyecatchPalette(category);
  const W = 600;
  const H = 200;
  const shapes = [`<rect width="${W}" height="${H}" fill="${soft}"/>`];
  const variant = Math.floor(rand() * 4);

  if (variant === 0) {
    // Layered translucent circles.
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const cx = (rand() * W).toFixed(1);
      const cy = (rand() * H).toFixed(1);
      const r = (30 + rand() * 90).toFixed(1);
      const op = (0.12 + rand() * 0.22).toFixed(2);
      shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${main}" fill-opacity="${op}"/>`);
    }
  } else if (variant === 1) {
    // Diagonal stripes plus a faint ring accent.
    const n = 5 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const x = (-100 + (i * (W + 200)) / n + rand() * 30).toFixed(1);
      const op = (0.08 + rand() * 0.18).toFixed(2);
      const sw = (6 + rand() * 18).toFixed(1);
      shapes.push(
        `<line x1="${x}" y1="-20" x2="${(Number(x) + 160).toFixed(1)}" y2="${H + 20}" stroke="${main}" stroke-width="${sw}" stroke-opacity="${op}"/>`
      );
    }
    const r = (70 + rand() * 60).toFixed(1);
    const cx = (rand() * W).toFixed(1);
    const cy = (rand() * H).toFixed(1);
    shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${main}" stroke-width="3" stroke-opacity="0.35"/>`);
  } else if (variant === 2) {
    // Scattered dot grid plus a large soft ring.
    const cols = 8;
    const rows = 4;
    const gap = W / cols;
    for (let cxi = 0; cxi < cols; cxi++) {
      for (let ryi = 0; ryi < rows; ryi++) {
        if (rand() > 0.55) continue;
        const cx = (gap * cxi + gap / 2 + (rand() - 0.5) * 10).toFixed(1);
        const cy = ((H / rows) * ryi + H / rows / 2 + (rand() - 0.5) * 10).toFixed(1);
        const r = (3 + rand() * 5).toFixed(1);
        shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${main}" fill-opacity="0.4"/>`);
      }
    }
    const r = (60 + rand() * 50).toFixed(1);
    shapes.push(
      `<circle cx="${(W * 0.78).toFixed(1)}" cy="${(H * 0.5).toFixed(1)}" r="${r}" fill="none" stroke="${main}" stroke-width="10" stroke-opacity="0.18"/>`
    );
  } else {
    // Concentric arcs.
    const cx = (rand() * W).toFixed(1);
    const cy = (H / 2 + (rand() - 0.5) * 40).toFixed(1);
    const n = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const r = (20 + i * (18 + rand() * 10)).toFixed(1);
      const op = Math.max(0.08, 0.35 - i * 0.05).toFixed(2);
      shapes.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${main}" stroke-width="2.5" stroke-opacity="${op}"/>`);
    }
  }

  // Occasional large decorative "AI" glyph tucked in a corner.
  if (rand() > 0.4) {
    const rightAligned = rand() > 0.5;
    const gx = rightAligned ? W - 34 : 34;
    const anchor = rightAligned ? "end" : "start";
    shapes.push(
      `<text x="${gx}" y="${H - 26}" text-anchor="${anchor}" font-family="'Space Grotesk','Zen Kaku Gothic New',sans-serif" font-weight="700" font-size="86" fill="${main}" fill-opacity="0.10">AI</text>`
    );
  }

  return `<svg class="eyecatch-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${shapes.join(
    ""
  )}</svg>`;
}

// ---------------------------------------------------------------------------
// Content loading
// ---------------------------------------------------------------------------

function loadArticles() {
  if (!fs.existsSync(CONTENT_DIR)) {
    console.warn(`[build] Content directory not found (${CONTENT_DIR}); building with 0 articles.`);
    return [];
  }
  const files = fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .sort();

  if (files.length === 0) {
    console.warn(`[build] No markdown files found in ${CONTENT_DIR}; building with 0 articles.`);
  }

  const articles = [];
  const seenSlugs = new Set();

  for (const file of files) {
    const fullPath = path.join(CONTENT_DIR, file);
    let raw;
    try {
      raw = fs.readFileSync(fullPath, "utf8");
    } catch (err) {
      console.warn(`[build] Skipping ${file}: could not read file (${err.message})`);
      continue;
    }
    const { data, body: rawBody } = parseFrontmatter(raw);
    const body = rawBody.replace(/^\s*# [^\n]*\r?\n/, "");

    if (!data.title || !data.slug) {
      console.warn(`[build] Skipping ${file}: missing required frontmatter (title/slug).`);
      continue;
    }
    if (seenSlugs.has(data.slug)) {
      console.warn(`[build] Skipping ${file}: duplicate slug "${data.slug}" (already used).`);
      continue;
    }
    seenSlugs.add(data.slug);

    const category = data.category || "AIツール";
    articles.push({
      title: data.title,
      description: data.description || "",
      slug: data.slug,
      date: data.date || "1970-01-01",
      category,
      tags: data.tags || [],
      bodyHtml: wrapSourcesSection(renderMarkdown(body)),
      eyecatchSvg: generateEyecatch(data.slug, category),
      sourceFile: file,
    });
  }

  articles.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return articles;
}

// ---------------------------------------------------------------------------
// HTML page shell (shared CSS, OGP, JSON-LD)
// ---------------------------------------------------------------------------

const SITE_CSS = `
:root {
  color-scheme: light dark;
  --bg: #f7f3ea;
  --surface: #ffffff;
  --surface-2: #efe8d8;
  --fg: #18140f;
  --muted: #6b6357;
  --accent: #ff4d23;
  --accent-fg: #17130d;
  --accent-soft: #ffe1d2;
  --edu: #0f8f72;
  --edu-fg: #ffffff;
  --edu-soft: #d7f2e9;
  --border: #e6dfcf;
  --code-bg: #efe7d6;
  --banner-bg: #fff1cf;
  --banner-fg: #6b4a00;
  --banner-border: #ecd79a;
  --header-bg: rgba(247, 243, 234, 0.86);
  --shadow: 0 10px 30px -12px rgba(24, 20, 15, 0.28);
  --measure: 68ch;
  --wide: 960px;
  --eye-edu: var(--edu);
  --eye-edu-soft: var(--edu-soft);
  --eye-a: #0b5e8c;
  --eye-a-soft: #dff0ff;
  --eye-b: #7a5400;
  --eye-b-soft: #fff0cf;
  --eye-c: #a3213f;
  --eye-c-soft: #ffe1e6;
  --eye-d: #4c6a1f;
  --eye-d-soft: #e6efd2;
  --eye-e: #7a4420;
  --eye-e-soft: #f0ded0;
  --font-display: "Space Grotesk", "Zen Kaku Gothic New", "Noto Sans JP", sans-serif;
  --font-body: "Zen Kaku Gothic New", "Noto Sans JP", "Hiragino Sans", "Yu Gothic", "Segoe UI", sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0c0d0b;
    --surface: #17191a;
    --surface-2: #1f2221;
    --fg: #f2ede2;
    --muted: #a29a8b;
    --accent: #ff7a4a;
    --accent-fg: #0c0d0b;
    --accent-soft: #3a2015;
    --edu: #2fe3ac;
    --edu-fg: #06231a;
    --edu-soft: #123328;
    --border: #2a2c2a;
    --code-bg: #1c1e1d;
    --banner-bg: #2c2308;
    --banner-fg: #f2d886;
    --banner-border: #4c3d10;
    --header-bg: rgba(12, 13, 11, 0.82);
    --shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.6);
    --eye-a: #7ecbff;
    --eye-a-soft: #10314a;
    --eye-b: #ffd873;
    --eye-b-soft: #3a2c05;
    --eye-c: #ff9db3;
    --eye-c-soft: #3a1420;
    --eye-d: #b7d67f;
    --eye-d-soft: #26310f;
    --eye-e: #e3b98a;
    --eye-e-soft: #3a2818;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
html { -webkit-text-size-adjust: 100%; }
body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-body);
  line-height: 1.9;
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
::selection { background: var(--accent); color: #fff; }
a { color: var(--accent); }
a:focus-visible, button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 3px;
  border-radius: 3px;
}
img { max-width: 100%; height: auto; display: block; }

.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--header-bg);
  backdrop-filter: saturate(160%) blur(14px);
  -webkit-backdrop-filter: saturate(160%) blur(14px);
  border-bottom: 1px solid var(--border);
  padding: 0.9rem 1.25rem;
}
.site-header .inner {
  max-width: var(--wide);
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  text-decoration: none;
  color: var(--fg);
  min-width: 0;
}
.brand-mark {
  flex-shrink: 0;
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--accent) 0%, var(--edu) 100%);
  transform: rotate(-8deg);
  box-shadow: var(--shadow);
}
.brand-text {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.18rem;
  letter-spacing: 0.01em;
  white-space: nowrap;
}
.site-header nav a {
  display: inline-block;
  text-decoration: none;
  color: var(--muted);
  margin-left: 0.5rem;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.42rem 0.95rem;
  border-radius: 999px;
  border: 1px solid transparent;
  transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
}
.site-header nav a:hover,
.site-header nav a:focus-visible {
  color: var(--accent);
  border-color: var(--border);
  background: var(--surface);
}

.disclosure-banner {
  max-width: var(--wide);
  margin: 1rem auto 0;
  padding: 0.65rem 1rem;
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  background: var(--banner-bg);
  color: var(--banner-fg);
  border: 1px solid var(--banner-border);
  border-radius: 10px;
  font-size: 0.82rem;
  line-height: 1.7;
}
.disclosure-badge {
  flex-shrink: 0;
  font-family: var(--font-display);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 0.18rem 0.5rem;
  border-radius: 999px;
  background: var(--banner-fg);
  color: var(--banner-bg);
  margin-top: 0.1rem;
}

main {
  max-width: var(--measure);
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}
main.wide { max-width: var(--wide); }

h1 {
  font-family: var(--font-display);
  font-size: clamp(1.55rem, 1.2rem + 1.4vw, 2.15rem);
  line-height: 1.45;
  font-weight: 700;
  letter-spacing: 0.005em;
  margin: 0.6rem 0 1.1rem;
}
article { counter-reset: h2count; }
h2 {
  font-family: var(--font-display);
  font-size: 1.4rem;
  font-weight: 700;
  line-height: 1.5;
  margin: 2.75rem 0 1.15rem;
  padding-left: 0.85rem;
  border-left: 4px solid var(--accent);
}
article h2::before {
  counter-increment: h2count;
  content: counter(h2count, decimal-leading-zero) " / ";
  color: var(--accent);
  opacity: 0.6;
  font-size: 0.75em;
  letter-spacing: 0.03em;
}
h3 {
  font-family: var(--font-display);
  font-size: 1.12rem;
  font-weight: 700;
  margin-top: 1.8rem;
}
p { margin: 0 0 1.15rem; }
ul, ol { margin: 0 0 1.2rem; padding-left: 1.5rem; }
li { margin-bottom: 0.5rem; }
ul > li::marker { color: var(--accent); }
ol > li::marker { color: var(--accent); font-family: var(--font-display); font-weight: 700; }
blockquote {
  position: relative;
  margin: 1.6rem 0;
  padding: 0.9rem 1.2rem 0.9rem 1.4rem;
  border-left: 4px solid var(--edu);
  color: var(--muted);
  background: var(--surface);
  border-radius: 0 10px 10px 0;
  font-style: italic;
}
blockquote p { margin: 0; }
code {
  background: var(--code-bg);
  padding: 0.15em 0.4em;
  border-radius: 4px;
  font-size: 0.9em;
}
.table-wrap {
  overflow-x: auto;
  margin: 1.4rem 0;
  border: 1px solid var(--border);
  border-radius: 10px;
}
.table-wrap table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
  line-height: 1.7;
}
.table-wrap th, .table-wrap td {
  padding: 0.6rem 0.9rem;
  text-align: left;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
.table-wrap td { white-space: normal; min-width: 8em; }
.table-wrap thead th {
  background: var(--card-bg);
  font-weight: 700;
  border-bottom: 2px solid var(--accent);
}
.table-wrap tbody tr:last-child td { border-bottom: none; }

pre {
  background: var(--code-bg);
  padding: 1rem;
  border-radius: 10px;
  overflow-x: auto;
}
pre code { background: none; padding: 0; }
hr { border: none; border-top: 1px solid var(--border); margin: 2.5rem 0; }

.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3em;
  font-family: var(--font-display);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  line-height: 1.4;
  white-space: nowrap;
}
.chip-tag { background: var(--surface-2); color: var(--muted); }
.chip-cat { font-weight: 700; }
.chip-edu { background: var(--edu-soft); color: var(--edu); }
.chip-a { background: #dff0ff; color: #0b5e8c; }
.chip-b { background: #fff0cf; color: #7a5400; }
.chip-c { background: #ffe1e6; color: #a3213f; }
.chip-d { background: #e6efd2; color: #4c6a1f; }
.chip-e { background: #f0ded0; color: #7a4420; }
@media (prefers-color-scheme: dark) {
  .chip-a { background: #10314a; color: #7ecbff; }
  .chip-b { background: #3a2c05; color: #ffd873; }
  .chip-c { background: #3a1420; color: #ff9db3; }
  .chip-d { background: #26310f; color: #b7d67f; }
  .chip-e { background: #3a2818; color: #e3b98a; }
}

.article-meta {
  color: var(--muted);
  font-size: 0.85rem;
  margin-bottom: 2rem;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.article-meta time { font-family: var(--font-display); font-weight: 600; }

.eyecatch-hero {
  width: 100%;
  height: clamp(120px, 26vw, 220px);
  max-height: 220px;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid var(--border);
  box-shadow: var(--shadow);
  margin: 0 0 2.2rem;
}

.sources {
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--border);
  font-size: 0.85rem;
  color: var(--muted);
}
.sources h2 {
  font-size: 1.05rem;
  margin: 0 0 1rem;
}
.sources ul { padding-left: 1.3rem; }
.sources li { margin-bottom: 0.5rem; }
.sources a {
  color: var(--muted);
  text-decoration: underline;
  text-decoration-color: var(--border);
  text-underline-offset: 0.15em;
}
.sources a:hover, .sources a:focus-visible { color: var(--accent); }
.sources a[target="_blank"]::after {
  content: "\\2197";
  display: inline-block;
  margin-left: 0.3em;
  font-size: 0.85em;
  opacity: 0.65;
}

.aff-cta {
  margin: 2rem 0;
  text-align: center;
}
.aff-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  background: var(--accent);
  color: var(--accent-fg) !important;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.02rem;
  letter-spacing: 0.01em;
  text-decoration: none;
  padding: 1rem 2.25rem;
  border-radius: 999px;
  box-shadow: var(--shadow);
  transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
}
.aff-btn::after { content: "\\2192"; transition: transform 0.18s ease; }
.aff-btn:hover, .aff-btn:focus-visible {
  transform: translateY(-3px);
  filter: brightness(1.05);
  box-shadow: 0 18px 34px -14px var(--accent);
}
.aff-btn:hover::after { transform: translateX(3px); }
.aff-btn:active { transform: translateY(-1px); }

.article-grid {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.25rem;
}
@media (min-width: 700px) {
  .article-grid { grid-template-columns: 1fr 1fr; }
}
.article-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
  overflow: hidden;
}
.article-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow);
  border-color: var(--accent);
}
.article-card .card-link {
  display: flex;
  flex-direction: column;
  text-decoration: none;
  color: var(--fg);
  height: 100%;
}
.card-eyecatch {
  width: 100%;
  height: 132px;
  overflow: hidden;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.card-eyecatch .eyecatch-svg,
.eyecatch-hero .eyecatch-svg {
  display: block;
  width: 100%;
  height: 100%;
}
.article-card:hover .card-eyecatch .eyecatch-svg { transform: scale(1.03); }
.card-eyecatch .eyecatch-svg { transition: transform 0.3s ease; }
.card-body {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 1.1rem 1.4rem 1.5rem;
  flex: 1;
}
.article-card .card-top {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
}
.article-card .card-date {
  font-family: var(--font-display);
  font-size: 0.78rem;
  color: var(--muted);
  font-weight: 600;
}
.article-card h2 {
  font-size: 1.15rem;
  border: none;
  padding: 0;
  margin: 0.2rem 0 0;
  line-height: 1.55;
}
.article-card h2::before { content: none; }
.article-card .desc {
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.75;
  margin: 0;
}
.empty-state {
  grid-column: 1 / -1;
  color: var(--muted);
  padding: 2rem 0;
}

.site-footer {
  border-top: 1px solid var(--border);
  margin-top: 4rem;
  padding: 2rem 1.25rem;
  color: var(--muted);
  font-size: 0.78rem;
}
.site-footer .inner { max-width: var(--wide); margin: 0 auto; }
.site-footer p { margin: 0.35rem 0; }
.site-footer a { color: var(--muted); }
.site-footer a:hover { color: var(--accent); }

/* --- コース --- */
.cs-progress {
  max-width: 760px; margin: 0 auto 2.5rem;
  padding: 1rem 1.15rem;
  border: 1px solid var(--border); border-radius: 10px;
  background: var(--surface);
}
.cs-bar { height: 8px; border-radius: 999px; background: var(--surface-2); overflow: hidden; }
.cs-bar-fill { height: 100%; background: var(--accent); transition: width 0.3s ease; }
.cs-progress-text { margin: 0.6rem 0 0; font-size: 0.85rem; font-weight: 700; }
.cs-reset {
  margin-top: 0.4rem; font: inherit; font-size: 0.76rem;
  background: none; border: none; padding: 0;
  color: var(--muted); text-decoration: underline; cursor: pointer;
}
.cs-chapter { max-width: 760px; margin: 0 auto 3rem; }
.cs-summary { color: var(--muted); margin-bottom: 1.2rem; }
.cs-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
.cs-item a {
  display: flex; align-items: center; gap: 0.9rem;
  padding: 0.9rem 1.1rem;
  border: 1px solid var(--border); border-radius: 10px;
  background: var(--surface);
  text-decoration: none; color: inherit;
}
.cs-item a:hover { border-color: var(--accent); }
.cs-n {
  flex-shrink: 0; width: 1.9rem; height: 1.9rem;
  display: grid; place-items: center; border-radius: 50%;
  background: var(--surface-2); color: var(--muted);
  font-family: var(--font-display); font-size: 0.85rem; font-weight: 700;
}
.cs-body { flex: 1; display: flex; flex-direction: column; gap: 0.15rem; }
.cs-title { font-weight: 700; }
.cs-meta { font-size: 0.76rem; color: var(--muted); }
.cs-check { flex-shrink: 0; width: 1.2rem; color: var(--accent); font-weight: 700; }
.cs-item.is-done .cs-n { background: var(--accent); color: #fff; }
.cs-item.is-done .cs-check::after { content: "✓"; }
.cs-note {
  max-width: 760px; margin: 0 auto; padding-bottom: 3rem;
  font-size: 0.8rem; color: var(--muted);
}

/* --- 各回 --- */
.lesson { max-width: 720px; margin: 0 auto; padding-top: 1.5rem; }
.ls-crumb { font-size: 0.82rem; margin-bottom: 0.5rem; }
.ls-meta { font-size: 0.8rem; color: var(--muted); margin-bottom: 2rem; }
.ls-done { margin: 3rem 0 1rem; text-align: center; }
.ls-done-btn {
  font: inherit; font-weight: 700;
  padding: 0.8rem 2rem;
  border: 2px solid var(--accent); border-radius: 999px;
  background: transparent; color: var(--accent); cursor: pointer;
}
.ls-done-btn.is-done { background: var(--accent); color: #fff; }
.ls-done-note { font-size: 0.75rem; color: var(--muted); margin-top: 0.5rem; }
.ls-nav {
  max-width: 720px; margin: 0 auto 4rem;
  display: flex; justify-content: space-between; gap: 1rem;
  font-size: 0.85rem;
}
.ls-nav a { max-width: 48%; }

/* --- 確認問題 --- */
.qz {
  border: 2px solid var(--border); border-radius: 10px;
  background: var(--surface); padding: 1.25rem; margin: 2rem 0;
}
.qz-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 1.8rem; }
.qz-text { font-weight: 700; margin: 0 0 0.7rem; }
.qz-num {
  display: inline-block; margin-right: 0.5rem;
  font-family: var(--font-display); color: var(--accent);
}
.qz-opts { display: grid; gap: 0.45rem; }
.qz-opt {
  font: inherit; text-align: left;
  padding: 0.6rem 0.9rem;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--bg); color: var(--fg); cursor: pointer;
}
.qz-opt:hover:not(:disabled) { border-color: var(--accent); }
.qz-opt:disabled { cursor: default; }
.qz-opt.is-correct { border-color: var(--accent); background: var(--accent-soft); font-weight: 700; }
.qz-opt.is-wrong { opacity: 0.55; text-decoration: line-through; }
.qz-explain {
  margin: 0.6rem 0 0; padding: 0.6rem 0.85rem;
  border-left: 3px solid var(--accent);
  background: var(--surface-2);
  font-size: 0.88rem; line-height: 1.8;
}
.qz-score {
  margin: 1.5rem 0 0; padding-top: 1rem;
  border-top: 1px solid var(--border);
  text-align: center; font-family: var(--font-display); font-weight: 700;
}

.policy-page { max-width: 720px; margin: 0 auto; padding: 2rem 0 4rem; }
.policy-page h1 { margin-bottom: 1.5rem; }
.policy-page h2 { margin-top: 2.2rem; font-size: 1.15rem; }
.policy-page p, .policy-page li { color: var(--muted); line-height: 1.9; }

.site-footer .footer-disclosure {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--fg);
}
`;

const CATEGORY_CHIP_PALETTE = ["chip-a", "chip-b", "chip-c", "chip-d", "chip-e"];

function categoryChipClass(category) {
  if (category === "AIをはじめて学ぶ") return "chip-edu";
  let hash = 0;
  for (let i = 0; i < String(category).length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_CHIP_PALETTE[hash % CATEGORY_CHIP_PALETTE.length];
}

// ---------------------------------------------------------------------------
// コース(eラーニング)
// ---------------------------------------------------------------------------

const COURSE_URL = `${CONFIG.baseUrl}${CONFIG.blogPath}/course/`;
const lessonUrl = (slug) => `${COURSE_URL}${slug}/`;

function loadCourse() {
  const meta = readJson(path.join(AFFILIATE_DIR, "course.json"), null);
  if (!meta) return null;
  const dir = path.join(AFFILIATE_DIR, "course");
  if (!fs.existsSync(dir)) return null;

  const lessons = new Map();
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const { data, body } = parseFrontmatter(raw);
    if (!data || !data.slug) throw new Error(`コース教材のfrontmatterが不正です: ${file}`);
    lessons.set(data.slug, {
      slug: data.slug,
      title: data.title,
      minutes: Number(data.minutes) || 5,
      bodyHtml: renderMarkdown(body),
    });
  }

  // course.json の並び順を正とし、全体を1本の連番に展開する。
  const ordered = [];
  for (const ch of meta.chapters) {
    for (const slug of ch.lessons) {
      const lesson = lessons.get(slug);
      if (!lesson) throw new Error(`course.json が存在しない教材を参照しています: ${slug}`);
      ordered.push({ ...lesson, chapter: ch });
    }
  }
  return { meta, ordered };
}

// 進捗はlocalStorageに保存する。アカウント不要で、静的サイトのまま完結する。
const COURSE_PROGRESS_JS = `
(function () {
  var KEY = "pl-course-done";
  window.plCourse = {
    read: function () {
      try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
    },
    write: function (v) {
      try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {}
    },
  };
})();
`;

function renderCourseIndex(course) {
  const { meta, ordered } = course;
  const chapters = meta.chapters
    .map((ch) => {
      const items = ch.lessons
        .map((slug, i) => {
          const l = ordered.find((x) => x.slug === slug);
          const n = ordered.indexOf(l) + 1;
          return `
        <li class="cs-item" data-slug="${escapeHtml(slug)}">
          <a href="${lessonUrl(slug)}">
            <span class="cs-n">${n}</span>
            <span class="cs-body">
              <span class="cs-title">${escapeHtml(l.title)}</span>
              <span class="cs-meta">約${l.minutes}分</span>
            </span>
            <span class="cs-check" aria-hidden="true"></span>
          </a>
        </li>`;
        })
        .join("");
      return `
    <section class="cs-chapter">
      <h2>${escapeHtml(ch.title)}</h2>
      <p class="cs-summary">${escapeHtml(ch.summary)}</p>
      <ol class="cs-list">${items}</ol>
    </section>`;
    })
    .join("");

  const body = `
<main>
  <section class="hero hero-sub">
    <h1>${escapeHtml(meta.title)}</h1>
    <p class="hero-lead">${escapeHtml(meta.lead)}</p>
  </section>

  <div class="cs-progress" id="cs-progress" hidden>
    <div class="cs-bar"><div class="cs-bar-fill" id="cs-bar-fill"></div></div>
    <p class="cs-progress-text" id="cs-progress-text"></p>
    <button type="button" class="cs-reset" id="cs-reset">進捗を消す</button>
  </div>

  ${chapters}

  <p class="cs-note">${escapeHtml(meta.note)}</p>
</main>`;

  const extraJs = `
${COURSE_PROGRESS_JS}
(function () {
  var done = window.plCourse.read();
  var items = document.querySelectorAll(".cs-item");
  var total = items.length, n = 0;
  items.forEach(function (li) {
    if (done[li.dataset.slug]) { li.classList.add("is-done"); n++; }
  });
  var wrap = document.getElementById("cs-progress");
  if (n > 0) {
    wrap.hidden = false;
    document.getElementById("cs-bar-fill").style.width = Math.round((n / total) * 100) + "%";
    document.getElementById("cs-progress-text").textContent = total + "回中 " + n + "回を完了";
  }
  document.getElementById("cs-reset").addEventListener("click", function () {
    window.plCourse.write({});
    location.reload();
  });
})();`;

  return pageShell({
    title: meta.title,
    description: meta.lead.slice(0, 120),
    canonical: COURSE_URL,
    ogType: "website",
    bodyHtml: body + `\n<script>${extraJs}</script>`,
    jsonLd: { "@context": "https://schema.org", "@type": "Course", name: meta.title, description: meta.lead, provider: { "@type": "Organization", name: CONFIG.siteName } },
    showDisclosure: false,
  });
}

function renderLessonPage(lesson, index, ordered) {
  const prev = index > 0 ? ordered[index - 1] : null;
  const next = index < ordered.length - 1 ? ordered[index + 1] : null;

  const nav = `
  <nav class="ls-nav">
    ${prev ? `<a class="ls-prev" href="${lessonUrl(prev.slug)}">← ${escapeHtml(prev.title)}</a>` : `<a class="ls-prev" href="${COURSE_URL}">← コース目次</a>`}
    ${next ? `<a class="ls-next" href="${lessonUrl(next.slug)}">${escapeHtml(next.title)} →</a>` : `<a class="ls-next" href="${COURSE_URL}">コース目次へ戻る →</a>`}
  </nav>`;

  const body = `
<main>
  <article class="lesson">
    <p class="ls-crumb"><a href="${COURSE_URL}">${escapeHtml(lesson.chapter.title)}</a></p>
    <h1>${escapeHtml(lesson.title)}</h1>
    <p class="ls-meta">第${index + 1}回 / 全${ordered.length}回　約${lesson.minutes}分</p>
    ${lesson.bodyHtml}

    <div class="ls-done">
      <button type="button" class="ls-done-btn" id="ls-done">この回を完了にする</button>
      <p class="ls-done-note">進捗はこのブラウザにのみ保存されます</p>
    </div>
  </article>
  ${nav}
</main>`;

  const extraJs = `
${COURSE_PROGRESS_JS}
(function () {
  var SLUG = ${JSON.stringify(lesson.slug)};
  var btn = document.getElementById("ls-done");
  function paint() {
    var done = window.plCourse.read();
    if (done[SLUG]) {
      btn.textContent = "完了ずみ（クリックで取り消す）";
      btn.classList.add("is-done");
    } else {
      btn.textContent = "この回を完了にする";
      btn.classList.remove("is-done");
    }
  }
  btn.addEventListener("click", function () {
    var done = window.plCourse.read();
    if (done[SLUG]) { delete done[SLUG]; } else { done[SLUG] = true; }
    window.plCourse.write(done);
    paint();
  });
  paint();
})();`;

  return pageShell({
    title: lesson.title,
    description: `${lesson.chapter.title}の第${index + 1}回。${lesson.title}について、確認問題つきで解説します。`,
    canonical: lessonUrl(lesson.slug),
    ogType: "article",
    bodyHtml: body + `\n<script>${extraJs}</script>`,
    jsonLd: { "@context": "https://schema.org", "@type": "LearningResource", name: lesson.title, url: lessonUrl(lesson.slug), isPartOf: { "@type": "Course", name: "生成AI 実践コース", url: COURSE_URL } },
    showDisclosure: lesson.bodyHtml.includes("aff-btn"),
  });
}

function renderPolicyPages() {
  const shell = (title, description, canonical, inner, type) =>
    pageShell({
      title,
      description,
      canonical,
      ogType: "website",
      bodyHtml: `\n<main>\n  <article class="policy-page">\n${inner}\n  </article>\n</main>`,
      jsonLd: { "@context": "https://schema.org", "@type": type, name: title, url: canonical },
      showDisclosure: false,
    });

  const privacy = shell(
    "プライバシーポリシー",
    `${CONFIG.siteName}のプライバシーポリシーです。Cookieの利用、アフィリエイトプログラム、外部サービスの利用について説明しています。`,
    PRIVACY_URL,
    `    <h1>プライバシーポリシー</h1>
    <p>${escapeHtml(CONFIG.siteName)}（以下「当サイト」）における、個人情報および利用者情報の取り扱いについて説明します。</p>

    <h2>アフィリエイトプログラムについて</h2>
    <p>当サイトは、アフィリエイトサービスプロバイダ(ASP)が提供する成果報酬型広告プログラムに参加しています。当サイトに掲載しているリンクの一部には、ASPを経由した広告リンクが含まれます。これらのリンクを利用者がクリックした場合、ASPおよび提携先企業によってCookie等を用いた計測が行われることがあります。</p>

    <h2>Cookieの利用について</h2>
    <p>Cookieとは、ウェブサイトが利用者のブラウザに送信し、端末に保存される情報です。当サイトでは、上記アフィリエイトプログラムの成果計測のためにCookieが利用される場合があります。また、将来的にアクセス解析ツールや第三者配信の広告サービスを導入する場合、これらのサービス提供者によってもCookieが利用されることがあります。その場合、収集される情報に個人を特定できる情報は含まれません。</p>
    <p>Cookieの利用を望まない場合は、ブラウザの設定で無効化することができます。無効化した場合、当サイトの一部機能が正しく動作しない可能性があります。</p>

    <h2>免責事項</h2>
    <p>当サイトの記事内容については正確性の確保に努めていますが、内容の正確性・完全性を保証するものではありません。掲載しているサービスの料金・カリキュラム等は変更される場合があるため、利用の際は必ず公式サイトで最新の情報をご確認ください。学習方法や進路の選択は最終的にご自身の判断で行っていただくものとし、当サイトの情報を利用したことによって生じた損害について、当サイトは一切の責任を負いません。</p>

    <h2>著作権について</h2>
    <p>当サイトに掲載している文章・画像等の著作権は、特に断りのない限り当サイトに帰属します。無断での転載・複製はお控えください。</p>

    <h2>プライバシーポリシーの変更について</h2>
    <p>当サイトは、法令の変更や運営方針の変更等にともない、本ポリシーの内容を予告なく変更することがあります。変更後の内容は、当ページに掲載した時点から効力を持つものとします。</p>

    <h2>お問い合わせ</h2>
    <p>当サイトの内容に関するお問い合わせは、<a href="${CONTACT_URL}">お問い合わせページ</a>をご確認ください。</p>`,
    "WebPage",
  );

  const about = shell(
    "運営者情報",
    `${CONFIG.siteName}の運営体制と編集方針について説明しています。`,
    ABOUT_URL,
    `    <h1>運営者情報</h1>

    <h2>サイトについて</h2>
    <p>${escapeHtml(CONFIG.siteName)}は、プログラミングとAIの学習について扱う情報サイトです。独学とスクールの選び方、学習の進め方、未経験からの転職といったテーマを取り上げています。</p>

    <h2>運営体制</h2>
    <p>当サイトは個人運営です。専属のライターや大規模な編集部を持つメディアではなく、運営者自身が調査・執筆・確認を行っています。</p>

    <h2>編集方針</h2>
    <p>学習方法や進路は、読者の時間とお金に直接関わるテーマです。そのため、公開前に次の点を確認する工程を設けています。</p>
    <ul>
      <li>出典を確認できない統計や調査結果を書いていないか</li>
      <li>断定的な効果保証や誇張表現を含んでいないか</li>
      <li>料金など変動する情報を、断定的に書いていないか</li>
    </ul>
    <p>特に料金やカリキュラムは各社の判断で随時変更されるため、記事内の情報が常に最新であるとは限りません。重要な判断をする際は、必ず公式サイトで最新の情報をご確認ください。</p>

    <h2>収益について</h2>
    <p>当サイトは、アフィリエイトによる成果報酬で運営されています。紹介しているサービスは調査したうえで掲載していますが、提携の有無が記事の評価内容を左右することはありません。詳細は<a href="${PRIVACY_URL}">プライバシーポリシー</a>をご覧ください。</p>

    <h2>お問い合わせ</h2>
    <p>サイトの内容に関するご意見・ご指摘は<a href="${CONTACT_URL}">お問い合わせページ</a>からお願いします。</p>`,
    "AboutPage",
  );

  const contact = shell(
    "お問い合わせ",
    `${CONFIG.siteName}へのお問い合わせ方法をご案内します。`,
    CONTACT_URL,
    `    <h1>お問い合わせ</h1>
    <p>記事の内容に関するご指摘、掲載しているサービスに関するお問い合わせ、その他ご意見がありましたら、以下のメールアドレスまでご連絡ください。</p>
    <p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
    <p>内容を確認のうえ、必要に応じて対応いたします。すべてのお問い合わせに返信をお約束するものではない点、あらかじめご了承ください。</p>`,
    "ContactPage",
  );

  return { privacy, about, contact };
}

function render404Page() {
  return pageShell({
    title: "ページが見つかりません",
    description: "お探しのページは見つかりませんでした。",
    canonical: `${CONFIG.baseUrl}/404.html`,
    ogType: "website",
    bodyHtml: `
<main>
  <article class="policy-page" style="text-align:center; padding-top:3rem;">
    <h1>ページが見つかりませんでした</h1>
    <p>お探しのページは移動したか、削除された可能性があります。URLをご確認いただくか、以下からお探しください。</p>
    <p style="margin-top:2rem;"><a class="aff-btn" href="${SITE_ROOT_URL}">トップページへ戻る</a></p>
  </article>
</main>`,
    jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: "ページが見つかりません" },
    showDisclosure: false,
  });
}

function pageShell({ title, description, canonical, ogType = "article", bodyHtml, jsonLd, showDisclosure = true }) {
  const fullTitle = `${title} | ${CONFIG.siteName}`;
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
${HAS_FAVICON ? `<link rel="icon" href="${CONFIG.baseUrl}/static/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${CONFIG.baseUrl}/static/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${CONFIG.baseUrl}/static/apple-touch-icon.png">
` : ""}<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="${escapeHtml(CONFIG.siteName)}">
${OGP_IMAGE_URL ? `<meta property="og:image" content="${OGP_IMAGE_URL}">\n` : ""}<meta name="twitter:card" content="${OGP_IMAGE_URL ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${OGP_IMAGE_URL ? `<meta name="twitter:image" content="${OGP_IMAGE_URL}">\n` : ""}<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@400;500;700;900&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<style>${SITE_CSS}</style>
</head>
<body>
<header class="site-header">
  <div class="inner">
    <a class="brand" href="${BLOG_INDEX_URL}">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-text">${escapeHtml(CONFIG.siteName)}</span>
    </a>
    <nav>
      <a href="${BLOG_INDEX_URL}">記事一覧</a>
      <a class="nav-cta" href="${COURSE_URL}">講座で学ぶ</a>
    </nav>
  </div>
</header>
${showDisclosure ? `<div class="disclosure-banner"><span class="disclosure-badge">PR</span><span>${DISCLOSURE_TEXT}</span></div>` : ""}
${bodyHtml}
<footer class="site-footer">
  <div class="inner">
    ${showDisclosure ? `<p class="footer-disclosure"><span class="disclosure-badge">PR</span><span>${DISCLOSURE_TEXT}</span></p>` : ""}
    <p>本サイトの情報は正確性に努めていますが、内容を保証するものではありません。掲載の商品・サービスの詳細は必ず公式サイトでご確認ください。</p>
    <p><a href="${ABOUT_URL}">運営者情報</a> ・ <a href="${CONTACT_URL}">お問い合わせ</a> ・ <a href="${PRIVACY_URL}">プライバシーポリシー</a></p>
    <p>&copy; ${new Date().getFullYear()} ${escapeHtml(CONFIG.siteName)}</p>
  </div>
</footer>
</body>
</html>
`;
}

function formatDateJa(dateStr) {
  return dateStr;
}

function renderArticlePage(article) {
  const url = articleUrl(article.slug);
  const tagsHtml = article.tags.length
    ? article.tags.map((t) => `<span class="chip chip-tag">${escapeHtml(t)}</span>`).join("")
    : "";
  const body = `
<main>
  <article>
    <h1>${escapeHtml(article.title)}</h1>
    <div class="article-meta">
      <time datetime="${escapeHtml(article.date)}">${escapeHtml(formatDateJa(article.date))}</time>
      <span class="chip chip-cat ${categoryChipClass(article.category)}">${escapeHtml(article.category)}</span>
      ${tagsHtml}
    </div>
    <div class="eyecatch-hero">${article.eyecatchSvg}</div>
    ${article.bodyHtml}
  </article>
</main>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    author: { "@type": "Organization", name: CONFIG.author },
    publisher: { "@type": "Organization", name: CONFIG.siteName },
    mainEntityOfPage: url,
  };

  return pageShell({
    title: article.title,
    description: article.description,
    canonical: url,
    ogType: "article",
    bodyHtml: body,
    jsonLd,
    showDisclosure: article.bodyHtml.includes("aff-btn"),
  });
}

function renderBlogIndex(articles) {
  const items = articles.length
    ? articles
        .map(
          (a) => `<li class="article-card">
        <a class="card-link" href="${articleUrl(a.slug)}">
          <div class="card-eyecatch">${a.eyecatchSvg}</div>
          <div class="card-body">
            <div class="card-top">
              <span class="chip chip-cat ${categoryChipClass(a.category)}">${escapeHtml(a.category)}</span>
              <time class="card-date" datetime="${escapeHtml(a.date)}">${escapeHtml(a.date)}</time>
            </div>
            <h2>${escapeHtml(a.title)}</h2>
            <p class="desc">${escapeHtml(a.description)}</p>
          </div>
        </a>
      </li>`
        )
        .join("\n")
    : `<li class="empty-state">まだ記事がありません。近日公開予定です。</li>`;

  const body = `
<main class="wide">
  <h1>記事一覧</h1>
  <ul class="article-grid">
    ${items}
  </ul>
</main>`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: CONFIG.siteName,
    url: BLOG_INDEX_URL,
    description: CONFIG.description,
  };

  return pageShell({
    title: "記事一覧",
    description: CONFIG.description,
    canonical: BLOG_INDEX_URL,
    ogType: "website",
    bodyHtml: body,
    jsonLd,
  });
}

// ---------------------------------------------------------------------------
// RSS / sitemap / robots
// ---------------------------------------------------------------------------

function toRfc822(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderFeed(articles) {
  const items = articles
    .map(
      (a) => `  <item>
    <title>${xmlEscape(a.title)}</title>
    <link>${xmlEscape(articleUrl(a.slug))}</link>
    <guid isPermaLink="true">${xmlEscape(articleUrl(a.slug))}</guid>
    <pubDate>${toRfc822(a.date)}</pubDate>
    <description>${xmlEscape(a.description)}</description>
    <category>${xmlEscape(a.category)}</category>
  </item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${xmlEscape(CONFIG.siteName)}</title>
  <link>${xmlEscape(BLOG_INDEX_URL)}</link>
  <description>${xmlEscape(CONFIG.description)}</description>
  <language>ja</language>
${items}
</channel>
</rss>
`;
}

function courseUrlsForSitemap() {
  const course = loadCourse();
  if (!course) return [];
  return [{ loc: COURSE_URL }, ...course.ordered.map((l) => ({ loc: lessonUrl(l.slug) }))];
}

function renderSitemap(articles) {
  const urls = [
    { loc: SITE_ROOT_URL },
    ...(BLOG_INDEX_URL !== SITE_ROOT_URL ? [{ loc: BLOG_INDEX_URL }] : []),
    { loc: PRIVACY_URL },
    { loc: ABOUT_URL },
    { loc: CONTACT_URL },
    ...(courseUrlsForSitemap() || []),
    ...articles.map((a) => ({ loc: articleUrl(a.slug), lastmod: a.date })),
  ];
  const entries = urls
    .map((u) => {
      const lastmod = u.lastmod ? `\n    <lastmod>${xmlEscape(u.lastmod)}</lastmod>` : "";
      return `  <url>\n    <loc>${xmlEscape(u.loc)}</loc>${lastmod}\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

function copyStaticFiles() {
  if (!fs.existsSync(STATIC_DIR)) return;
  const dest = path.join(DIST_DIR, "static");
  ensureDir(dest);
  fs.cpSync(STATIC_DIR, dest, { recursive: true });
}

function renderRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${CONFIG.baseUrl}/sitemap.xml
`;
}

// ---------------------------------------------------------------------------
// Main build
// ---------------------------------------------------------------------------

function build() {
  rmrf(DIST_DIR);
  ensureDir(DIST_DIR);

  const articles = loadArticles();

  for (const article of articles) {
    const outPath = path.join(BLOG_OUT_DIR, article.slug, "index.html");
    writeFile(outPath, renderArticlePage(article));
  }

  writeFile(path.join(BLOG_OUT_DIR, "index.html"), renderBlogIndex(articles));

  const course = loadCourse();
  if (course) {
    writeFile(path.join(BLOG_OUT_DIR, "course", "index.html"), renderCourseIndex(course));
    course.ordered.forEach((lesson, i) => {
      writeFile(
        path.join(BLOG_OUT_DIR, "course", lesson.slug, "index.html"),
        renderLessonPage(lesson, i, course.ordered),
      );
    });
    console.log(`[build] course: ${course.ordered.length} lesson(s)`);
  }

  const policy = renderPolicyPages();
  writeFile(path.join(BLOG_OUT_DIR, "privacy", "index.html"), policy.privacy);
  writeFile(path.join(BLOG_OUT_DIR, "about", "index.html"), policy.about);
  writeFile(path.join(BLOG_OUT_DIR, "contact", "index.html"), policy.contact);
  writeFile(path.join(DIST_DIR, "404.html"), render404Page());

  writeFile(path.join(BLOG_OUT_DIR, "feed.xml"), renderFeed(articles));
  writeFile(path.join(DIST_DIR, "sitemap.xml"), renderSitemap(articles));
  writeFile(path.join(DIST_DIR, "robots.txt"), renderRobots());
  copyStaticFiles();

  console.log(`[build] Done. ${articles.length} article(s) built. Output: ${DIST_DIR}`);
}

build();
