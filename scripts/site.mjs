/**
 * site.mjs — 静态网站生成模块
 *
 * 输出：
 *   docs/data/YYYY-MM-DD.json   每日文章归档
 *   docs/data/dates.json        所有已存档日期列表（供前端读取）
 *   docs/index.html             单页应用（仅首次或模板变化时覆盖）
 */

import fs from "node:fs/promises";
import path from "node:path";

const DOCS_DIR = "docs";
const DATA_DIR = path.join(DOCS_DIR, "data");

// ─── 写入每日数据 ─────────────────────────────────────────────────────────────

export async function generateSite(rankedArticles, dateYmd) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  // 1. 写当日 JSON 归档
  const jsonPath = path.join(DATA_DIR, `${dateYmd}.json`);
  const jsonData = rankedArticles.map((a, i) => ({
    rank: i + 1,
    title: a.title,
    link: a.link,
    source: a.sourceName,
    summary: a.summary?.slice(0, 300) ?? "",
    llmComment: a.llmComment ?? null,
    pubDate: a.pubDate.toISOString(),
    score: Math.round(a.score),
  }));
  await fs.writeFile(jsonPath, JSON.stringify(jsonData, null, 2) + "\n", "utf8");
  console.log(`  ✓ 归档 JSON: ${jsonPath}  (${rankedArticles.length} 条)`);

  // 2. 更新 dates.json（在列表头部插入最新日期）
  const datesPath = path.join(DATA_DIR, "dates.json");
  let dates = [];
  try {
    dates = JSON.parse(await fs.readFile(datesPath, "utf8"));
  } catch { /* 首次运行，文件不存在 */ }
  if (!dates.includes(dateYmd)) {
    dates.unshift(dateYmd);          // 最新日期排最前
    dates.sort((a, b) => b.localeCompare(a));
  }
  await fs.writeFile(datesPath, JSON.stringify(dates, null, 2) + "\n", "utf8");
  console.log(`  ✓ dates.json 更新（共 ${dates.length} 天）`);

  // 3. 写/覆盖 index.html（SPA，每次都更新确保模板最新）
  await fs.writeFile(path.join(DOCS_DIR, "index.html"), buildSpaHtml(), "utf8");
  console.log(`  ✓ index.html 已更新`);
}

// ─── 单页应用 HTML ────────────────────────────────────────────────────────────

function buildSpaHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>每日资讯</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:        #0f1117;
      --surface:   #1a1d2e;
      --border:    #2d3148;
      --border-hi: #6366f1;
      --text:      #e2e8f0;
      --muted:     #64748b;
      --accent:    #a78bfa;
      --link:      #818cf8;
      --tag-bg:    #1e293b;
      --tag-text:  #7dd3fc;
      --score:     #facc15;
      --ai-bg:     #1e1b4b;
      --ai-border: #4338ca;
      --ai-text:   #c7d2fe;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 15px;
      line-height: 1.65;
      min-height: 100vh;
    }

    /* ── 顶栏 ── */
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 1.2rem 1.5rem;
      display: flex;
      align-items: center;
      gap: 1.2rem;
      flex-wrap: wrap;
    }
    header h1 { font-size: 1.3rem; color: var(--accent); white-space: nowrap; }

    /* 日期选择器 */
    #date-select-wrap { display: flex; align-items: center; gap: 0.6rem; }
    #date-select-wrap label { color: var(--muted); font-size: 0.85rem; }
    #date-select {
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.3rem 0.7rem;
      font-size: 0.9rem;
      cursor: pointer;
      outline: none;
    }
    #date-select:focus { border-color: var(--border-hi); }

    /* 统计栏 */
    #stats {
      margin-left: auto;
      color: var(--muted);
      font-size: 0.82rem;
      white-space: nowrap;
    }

    /* ── 主内容 ── */
    main {
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
    }

    /* 加载 / 空状态 */
    #state-msg {
      text-align: center;
      color: var(--muted);
      padding: 4rem 0;
      font-size: 0.95rem;
    }

    /* ── 文章卡片 ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1.1rem 1.3rem;
      margin-bottom: 1rem;
      transition: border-color 0.15s;
    }
    .card:hover { border-color: var(--border-hi); }

    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.78rem;
      color: var(--muted);
      margin-bottom: 0.5rem;
    }
    .rank   { background: #312e81; color: #a5b4fc; padding: 1px 8px; border-radius: 4px; font-weight: 600; }
    .source { color: var(--link); font-weight: 500; }
    .score  { margin-left: auto; color: var(--score); font-size: 0.78rem; }

    .card-title { font-size: 1rem; font-weight: 600; margin-bottom: 0.4rem; line-height: 1.45; }
    .card-title a { color: var(--text); text-decoration: none; }
    .card-title a:hover { color: var(--accent); }

    .card-summary { color: #94a3b8; font-size: 0.88rem; margin-top: 0.3rem; }

    /* AI 点评块 */
    .ai-comment {
      margin-top: 0.7rem;
      padding: 0.6rem 0.9rem;
      background: var(--ai-bg);
      border-left: 3px solid var(--ai-border);
      border-radius: 0 6px 6px 0;
      color: var(--ai-text);
      font-size: 0.88rem;
      line-height: 1.55;
    }
    .ai-comment::before {
      content: "🤖 AI 点评  ";
      font-weight: 600;
      color: #818cf8;
    }

    /* ── 页脚 ── */
    footer {
      text-align: center;
      padding: 2.5rem 1rem;
      color: #334155;
      font-size: 0.8rem;
    }
    footer a { color: #6366f1; text-decoration: none; }

    @media (max-width: 520px) {
      header { padding: 1rem; gap: 0.8rem; }
      #stats { margin-left: 0; }
      .card  { padding: 0.9rem; }
    }
  </style>
</head>
<body>

<header>
  <h1>📰 每日资讯</h1>
  <div id="date-select-wrap">
    <label for="date-select">选择日期</label>
    <select id="date-select"><option>加载中…</option></select>
  </div>
  <div id="stats"></div>
</header>

<main>
  <div id="state-msg">正在加载…</div>
  <div id="article-list"></div>
</main>

<footer>
  <p>数据每日自动更新 · <a href="https://github.com/MidniteCome/DailyNewTelegram" target="_blank">GitHub</a></p>
</footer>

<script>
const sel   = document.getElementById('date-select');
const list  = document.getElementById('article-list');
const stats = document.getElementById('stats');
const msg   = document.getElementById('state-msg');

function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function timeStr(iso) {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }) + ' CST';
  } catch { return iso?.slice(0,16) ?? ''; }
}

function renderArticles(articles) {
  if (!articles?.length) {
    msg.textContent = '当日暂无文章数据';
    msg.style.display = '';
    list.innerHTML = '';
    stats.textContent = '';
    return;
  }
  msg.style.display = 'none';
  stats.textContent = \`共 \${articles.length} 篇\`;

  list.innerHTML = articles.map(a => \`
    <article class="card">
      <div class="card-meta">
        <span class="rank">#\${a.rank}</span>
        <span class="source">\${esc(a.source)}</span>
        <span class="time">\${timeStr(a.pubDate)}</span>
        <span class="score" title="综合得分">⭐ \${a.score}</span>
      </div>
      <h2 class="card-title">
        <a href="\${esc(a.link)}" target="_blank" rel="noopener">\${esc(a.title)}</a>
      </h2>
      \${a.summary ? \`<p class="card-summary">\${esc(a.summary)}\${a.summary.length >= 300 ? '…' : ''}</p>\` : ''}
      \${a.llmComment ? \`<div class="ai-comment">\${esc(a.llmComment)}</div>\` : ''}
    </article>
  \`).join('');
}

async function loadDate(dateYmd) {
  msg.textContent = '加载中…';
  msg.style.display = '';
  list.innerHTML = '';
  stats.textContent = '';
  try {
    const r = await fetch(\`data/\${dateYmd}.json?t=\${Date.now()}\`);
    if (!r.ok) throw new Error('not found');
    const data = await r.json();
    renderArticles(data);
  } catch {
    msg.textContent = \`\${dateYmd} 暂无数据\`;
  }
}

async function init() {
  try {
    const r = await fetch(\`data/dates.json?t=\${Date.now()}\`);
    if (!r.ok) throw new Error();
    const dates = await r.json();

    if (!dates.length) {
      msg.textContent = '暂无历史数据';
      return;
    }

    sel.innerHTML = dates.map(d =>
      \`<option value="\${d}">\${d}</option>\`
    ).join('');

    sel.addEventListener('change', () => loadDate(sel.value));
    loadDate(dates[0]);   // 默认显示最新一天
  } catch {
    msg.textContent = '无法加载日期列表，请稍后刷新';
  }
}

init();
</script>
</body>
</html>`;
}
