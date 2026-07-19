#!/usr/bin/env node
// affiliate/generate-article.mjs
// Zero-dependency Node script: picks an uncovered topic and asks the
// Anthropic Messages API to write one affiliate blog article, then writes
// it to affiliate/content/<slug>.md.
//
// Usage: node affiliate/generate-article.mjs
// Requires: ANTHROPIC_API_KEY in the environment.
// Exits non-zero with a clear error message on API or validation failure.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const AFFILIATE_DIR = __dirname;
const CONTENT_DIR = path.join(AFFILIATE_DIR, "content");
const LINKS_PATH = path.join(AFFILIATE_DIR, "links.json");

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 3000;

function fail(message) {
  console.error(`[generate-article] ERROR: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Topic rotation list
// ---------------------------------------------------------------------------
// Each topic has a stable "key" used to detect whether it has already been
// covered (matched fuzzily against existing slugs), and a Japanese "topic"
// description handed to the model as the writing brief.

const TOPICS = [
  { key: "chatgpt-basics", topic: "ChatGPTの使い方入門:登録から基本操作まで" },
  { key: "claude-vs-chatgpt", topic: "ClaudeとChatGPTを徹底比較:どちらを選ぶべきか" },
  { key: "gemini-guide", topic: "Google Geminiの特徴と活用方法" },
  { key: "notion-ai-workflow", topic: "Notion AIで作業効率を劇的に上げる方法" },
  { key: "canva-design-tips", topic: "Canvaで初心者でもプロ級デザインを作るコツ" },
  { key: "midjourney-prompts", topic: "Midjourneyで理想の画像を生成するプロンプト術" },
  { key: "github-copilot-review", topic: "GitHub Copilotは開発者の生産性をどう変えるか" },
  { key: "perplexity-search", topic: "Perplexity AIで爆速リサーチを実現する方法" },
  { key: "chatgpt-vs-gemini", topic: "ChatGPTとGeminiの違いを徹底比較" },
  { key: "claude-writing", topic: "Claudeを使ったビジネス文章作成術" },
  { key: "ai-tool-comparison", topic: "主要AIチャットツール完全比較(ChatGPT・Claude・Gemini)" },
  { key: "notion-ai-vs-chatgpt", topic: "Notion AIとChatGPT、メモ・タスク管理で使うならどっち" },
  { key: "canva-vs-midjourney", topic: "CanvaとMidjourney、目的別の使い分け方" },
  { key: "github-copilot-setup", topic: "GitHub Copilotの導入方法と料金プラン解説" },
  { key: "perplexity-vs-google", topic: "Perplexity AIとGoogle検索、情報収集はどちらが速いか" },
  { key: "chatgpt-plus-worth-it", topic: "ChatGPT Plusは本当に必要か:無料版との違いを検証" },
  { key: "claude-coding", topic: "Claudeでコーディングを効率化する実践テクニック" },
  { key: "gemini-vs-claude", topic: "GeminiとClaude、長文読解・要約で強いのはどちら" },
  { key: "midjourney-vs-canva-design", topic: "AIデザインツール比較:MidjourneyとCanvaの活用シーン" },
  { key: "ai-tools-for-business", topic: "中小企業が導入すべきAIツールまとめ" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (err) {
    return fallback;
  }
}

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function existingSlugs() {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  const slugs = [];
  for (const file of fs.readdirSync(CONTENT_DIR)) {
    if (!file.toLowerCase().endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(CONTENT_DIR, file), "utf8");
    const m = raw.match(/^slug:\s*(.+)$/m);
    if (m) slugs.push(m[1].trim());
    else slugs.push(path.basename(file, ".md"));
  }
  return slugs;
}

function isTopicCovered(key, slugs) {
  return slugs.some((slug) => slug === key || slug.includes(key) || key.includes(slug));
}

function pickTopics(count) {
  const slugs = existingSlugs();
  let available = TOPICS.filter((t) => !isTopicCovered(t.key, slugs));
  if (available.length === 0) {
    // All topics have been used at least once — allow re-rotation.
    available = TOPICS.slice();
  }
  // Shuffle a copy and take `count` distinct topics.
  const shuffled = available.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

const AFFILIATE_IDS = Object.keys(readJson(LINKS_PATH, {}));

function buildSystemPrompt() {
  return `あなたは日本語のAIツール比較ブログのプロライターです。
アフィリエイトブログ記事を1本、Markdown形式で出力してください。

出力は以下のフロントマター形式を含む完全なMarkdownのみとし、それ以外の説明文やコードフェンスは一切含めないでください。

---
title: 記事タイトル
description: 120文字程度のSEOを意識した説明文
slug: lowercase-ascii-hyphens形式のスラッグ
date: YYYY-MM-DD
category: カテゴリ名(例: 比較, 使い方, レビュー)
tags: ["タグ1", "タグ2"]
---

本文(Markdown)

要件:
- 本文は1200〜2000文字程度の日本語(句読点含む)。
- 見出し(##, ###)、箇条書き、必要に応じて表現豊かな段落を使い、読みやすく構成すること。
- 本文中の自然な流れの中に、アフィリエイト誘導のプレースホルダーを1〜2箇所挿入すること。書式は {{aff:ID}} で、IDは次のいずれかを使用: ${AFFILIATE_IDS.join(", ")}。
- {{aff:ID}} は独立した行に置くか、文中に自然に挿入する。
- タイトルと説明文はSEOを意識し、検索されやすいキーワードを含めること。
- slugは英小文字とハイフンのみで構成すること(日本語や記号、大文字は使用不可)。
- dateは今日の日付(${todayIso()})を使用すること。
- 出力は上記のフロントマター付きMarkdownのみ。前後に余計な文章やコードフェンス(\`\`\`)を付けないこと。`;
}

function buildUserPrompt(topicText) {
  return `次のトピックについて記事を書いてください: 「${topicText}」`;
}

// ---------------------------------------------------------------------------
// Frontmatter validation (minimal, mirrors build.mjs's parser expectations)
// ---------------------------------------------------------------------------

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const [, yamlBlock, body] = match;
  const data = {};
  for (const line of yamlBlock.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    data[key] = val;
  }
  return { data, body };
}

function validateArticle(markdown, usedSlugs) {
  const parsed = parseFrontmatter(markdown);
  if (!parsed) return { ok: false, reason: "No valid frontmatter block found." };
  const { data, body } = parsed;
  if (!data.title) return { ok: false, reason: "Missing title in frontmatter." };
  if (!data.slug) return { ok: false, reason: "Missing slug in frontmatter." };
  if (!/^[a-z0-9-]+$/.test(data.slug)) {
    return { ok: false, reason: `Slug "${data.slug}" is not lowercase-ascii-hyphens.` };
  }
  if (usedSlugs.includes(data.slug)) {
    return { ok: false, reason: `Slug "${data.slug}" collides with an existing article.` };
  }
  if (!body || body.trim().length < 100) {
    return { ok: false, reason: "Article body looks too short or empty." };
  }
  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// Anthropic API call
// ---------------------------------------------------------------------------

async function callAnthropic(apiKey, systemPrompt, userPrompt) {
  let response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
  } catch (err) {
    fail(`Network error calling Anthropic API: ${err.message}`);
  }

  const rawBody = await response.text();
  if (!response.ok) {
    fail(
      `Anthropic API returned HTTP ${response.status}: ${rawBody.slice(0, 500)}`
    );
  }

  let json;
  try {
    json = JSON.parse(rawBody);
  } catch (err) {
    fail(`Could not parse Anthropic API response as JSON: ${err.message}`);
  }

  const textBlock = Array.isArray(json.content)
    ? json.content.find((b) => b.type === "text")
    : null;

  if (!textBlock || typeof textBlock.text !== "string" || !textBlock.text.trim()) {
    fail("Anthropic API response did not contain a text content block.");
  }

  return textBlock.text;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    fail("ANTHROPIC_API_KEY is not set in the environment.");
  }

  fs.mkdirSync(CONTENT_DIR, { recursive: true });

  const slugsBefore = existingSlugs();
  const [topicA, topicB] = pickTopics(2);
  if (!topicA) {
    fail("No topics available to generate an article for.");
  }

  const attempts = [topicA, topicB].filter(Boolean);
  let lastReason = "";

  for (let i = 0; i < attempts.length; i++) {
    const topic = attempts[i];
    console.log(`[generate-article] Attempt ${i + 1}: topic "${topic.key}" — ${topic.topic}`);

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(topic.topic);
    const markdown = await callAnthropic(apiKey, systemPrompt, userPrompt);

    const validation = validateArticle(markdown, slugsBefore);
    if (!validation.ok) {
      lastReason = validation.reason;
      console.warn(`[generate-article] Validation failed: ${validation.reason}`);
      continue;
    }

    const outPath = path.join(CONTENT_DIR, `${validation.data.slug}.md`);
    fs.writeFileSync(outPath, markdown.trim() + "\n", "utf8");
    console.log(`[generate-article] Wrote ${outPath}`);
    console.log(`[generate-article] Title: ${validation.data.title}`);
    return;
  }

  fail(`Failed to generate a valid article after ${attempts.length} attempt(s). Last reason: ${lastReason}`);
}

main().catch((err) => {
  fail(err && err.stack ? err.stack : String(err));
});
