/**
 * site.mjs — 静态网站生成模块
 * 输出：
 *   docs/index.html              当日新闻页（每次覆盖）
 *   docs/data/YYYY-MM-DD.json    每日归档数据
 */

import fs from "node:fs/promises";
import path from "node:path";

const DOCS_DIR = "docs";
const DATA_DIR = path.join(DOCS_DIR, "data");

function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** 生成单张文章卡片 HTML */
function articleCard(article, rank) {
  const score = Math.round(article.score);
  const time = article.pubDate.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const summary = escHtml(article.summary?.slice(0, 200) ?? "");
  const title = escHtml(article.title.replace(/\s+/g, " ").trim());
  const source = escHtml(article.sourceName);
  const link = article.link;
  const tags = (article.matchedKeywords ?? []).map(
    (k) => `<span class="tag">${escHtml(k)}</span>`
  ).join(" ");

  return `
  <article class="card">
    <div class="card-meta">
      <span class="rank">#${rank}</span>
      <span class="source">${source}</span>
      <span class="time">${time}</span>
      <span class="score" title="综合得分">⭐ ${score}</span>
    </div>
    <h2 class="card-title">
      <a href="${link}" target="_blank" rel="noopener">${title}</a>
    </h2>
    ${summary ? `<p class="card-summary">${summary}${article.summary?.length > 200 ? "…" : ""}</p>` : ""}
    ${tags ? `<div class="tags">${tags}</div>` : ""}
  </article>`.trim();
}

/** 生成完整 index.html */
function buildHtml(articles, dateYmd) {
  const cards = articles.map((a, i) => articleCard(a, i + 1)).join("\n\n");
  const total = articles.length;
  const generated = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daily News · ${escHtml(dateYmd)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #0f1117;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 15px;
      line-height: 1.6;
      min-height: 100vh;
    }

    header {
      background: #1a1d2e;
      border-bottom: 1px solid #2d3148;
      padding: 1.5rem 1rem;
      text-align: center;
    }
    header h1 { font-size: 1.6rem; color: #a78bfa; }
    header p  { color: #94a3b8; font-size: 0.85rem; margin-top: 0.3rem; }

    main {
      max-width: 780px;
      margin: 2rem auto;
      padding: 0 1rem;
    }

    .stats {
      color: #64748b;
      font-size: 0.82rem;
      margin-bottom: 1.5rem;
    }

    .card {
      background: #1a1d2e;
      border: 1px solid #2d3148;
      border-radius: 10px;
      padding: 1.1rem 1.3rem;
      margin-bottom: 1rem;
      transition: border-color 0.2s;
    }
    .card:hover { border-color: #6366f1; }

    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.78rem;
      color: #64748b;
      margin-bottom: 0.5rem;
    }
    .rank   { background: #312e81; color: #a5b4fc; padding: 1px 7px; border-radius: 4px; font-weight: 600; }
    .source { color: #818cf8; font-weight: 500; }
    .score  { margin-left: auto; color: #facc15; }

    .card-title { font-size: 1rem; font-weight: 600; margin-bottom: 0.4rem; }
    .card-title a { color: #e2e8f0; text-decoration: none; }
    .card-title a:hover { color: #a78bfa; }

    .card-summary { color: #94a3b8; font-size: 0.88rem; }

    .tags { margin-top: 0.6rem; }
    .tag  {
      display: inline-block;
      background: #1e293b;
      color: #7dd3fc;
      border: 1px solid #334155;
      font-size: 0.75rem;
      padding: 1px 8px;
      border-radius: 999px;
      margin-right: 4px;
    }

    footer {
      text-align: center;
      padding: 2rem 1rem;
      color: #334155;
      font-size: 0.8rem;
    }

    @media (max-width: 500px) {
      .card { padding: 0.9rem; }
      header h1 { font-size: 1.3rem; }
    }
  </style>
</head>
<body>
  <header>
    <h1>📰 Daily News</h1>
    <p>${escHtml(dateYmd)} &nbsp;·&nbsp; ${total} articles &nbsp;·&nbsp; Generated ${generated}</p>
  </header>

  <main>
    <p class="stats">按综合得分排序（新鲜度 + 来源权重 + 关键词匹配）</p>
    ${cards}
  </main>

  <footer>
    <p>Powered by <a href="https://github.com/williamchoi/DailyNewTelegram" style="color:#6366f1">DailyNewTelegram</a></p>
  </footer>
</body>
</html>`;
}

/**
 * 生成并写入静态网站文件
 * @param {Array}  rankedArticles  打分后的文章数组（全量）
 * @param {string} dateYmd         当日日期，如 "2026-02-23"
 */
export async function generateSite(rankedArticles, dateYmd) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  // 写 JSON 归档
  const jsonPath = path.join(DATA_DIR, `${dateYmd}.json`);
  const jsonData = rankedArticles.map((a) => ({
    rank: rankedArticles.indexOf(a) + 1,
    title: a.title,
    link: a.link,
    source: a.sourceName,
    summary: a.summary?.slice(0, 300) ?? "",
    pubDate: a.pubDate.toISOString(),
    score: Math.round(a.score),
    matchedKeywords: a.matchedKeywords ?? [],
  }));
  await fs.writeFile(jsonPath, JSON.stringify(jsonData, null, 2) + "\n", "utf8");
  console.log(`  ✓ 归档 JSON: ${jsonPath}`);

  // 写 index.html
  const html = buildHtml(rankedArticles, dateYmd);
  await fs.writeFile(path.join(DOCS_DIR, "index.html"), html, "utf8");
  console.log(`  ✓ 网站首页: docs/index.html  (${rankedArticles.length} 条文章)`);
}
