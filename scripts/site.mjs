/**
 * site.mjs — 静态网站生成模块
 *
 * 输出：
 *   docs/data/YYYY-MM-DD.json   每日文章归档（含 meta.topN）
 *   docs/data/dates.json        所有已存档日期列表
 *   docs/index.html             单页应用
 */

import fs from "node:fs/promises";
import path from "node:path";

const DOCS_DIR = "docs";
const DATA_DIR = path.join(DOCS_DIR, "data");

export async function generateSite(rankedArticles, dateYmd, topN = 5) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  // 1. 写当日 JSON 归档（含 meta 字段，供前端知道 topN 分界线）
  const jsonPath = path.join(DATA_DIR, `${dateYmd}.json`);
  const payload = {
    meta: { date: dateYmd, topN, total: rankedArticles.length },
    articles: rankedArticles.map((a, i) => ({
      rank:       i + 1,
      title:      a.title,
      link:       a.link,
      source:     a.sourceName,
      summary:    a.summary?.slice(0, 300) ?? "",
      llmComment: a.llmComment ?? null,
      pubDate:    a.pubDate.toISOString(),
      score:      Math.round(a.score),
    })),
  };
  await fs.writeFile(jsonPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`  ✓ 归档 JSON: ${jsonPath}  (${rankedArticles.length} 条, top${topN})`);

  // 2. 更新 dates.json
  const datesPath = path.join(DATA_DIR, "dates.json");
  let dates = [];
  try { dates = JSON.parse(await fs.readFile(datesPath, "utf8")); } catch { /* 首次 */ }
  if (!dates.includes(dateYmd)) dates.unshift(dateYmd);
  dates.sort((a, b) => b.localeCompare(a));
  await fs.writeFile(datesPath, JSON.stringify(dates, null, 2) + "\n", "utf8");
  console.log(`  ✓ dates.json (共 ${dates.length} 天)`);

  // 3. 写 index.html
  await fs.writeFile(path.join(DOCS_DIR, "index.html"), buildSpaHtml(), "utf8");
  console.log(`  ✓ index.html 已更新`);
}

// ─── SPA HTML ─────────────────────────────────────────────────────────────────

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
      --surface2:  #141726;
      --border:    #2d3148;
      --border-hi: #6366f1;
      --text:      #e2e8f0;
      --muted:     #64748b;
      --accent:    #a78bfa;
      --link:      #818cf8;
      --score:     #facc15;
      --ai-bg:     #1e1b4b;
      --ai-border: #4338ca;
      --ai-text:   #c7d2fe;
      --header-h:  54px;
      --divider-h: 36px;
    }

    html, body {
      height: 100%;
      overflow: hidden;   /* 禁止 body 滚动，让两个面板各自滚动 */
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                   "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 15px;
      line-height: 1.65;
    }

    /* ── 顶栏（固定高度）── */
    header {
      height: var(--header-h);
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0 1.5rem;
      display: flex;
      align-items: center;
      gap: 1.2rem;
      flex-shrink: 0;
      z-index: 20;
    }
    header h1 { font-size: 1.15rem; color: var(--accent); white-space: nowrap; }

    #date-select-wrap { display: flex; align-items: center; gap: 0.5rem; }
    #date-select-wrap label { color: var(--muted); font-size: 0.82rem; }
    #date-select {
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.25rem 0.6rem;
      font-size: 0.88rem;
      cursor: pointer;
    }
    #date-select:focus { outline: none; border-color: var(--border-hi); }
    #stats { margin-left: auto; color: var(--muted); font-size: 0.8rem; white-space: nowrap; }

    /* ── 主体：上下两栏，各占一半视口 ── */
    .split-layout {
      display: flex;
      flex-direction: column;
      height: calc(100vh - var(--header-h));
    }

    /* 上半部分：Top 5 精选 */
    .panel-top {
      flex: 1;
      min-height: 0;          /* flex 子元素必须设这个才能正确收缩 */
      overflow-y: auto;
      background: var(--bg);
      border-bottom: 2px solid var(--border-hi);
    }

    /* 中间分隔条 */
    .divider {
      flex-shrink: 0;
      height: var(--divider-h);
      background: var(--surface2);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      padding: 0 1.5rem;
      gap: 0.6rem;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: var(--muted);
      user-select: none;
    }
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    /* 下半部分：其余文章 */
    .panel-rest {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      background: var(--bg);
    }

    /* 面板内容区内边距 */
    .panel-inner {
      max-width: 780px;
      margin: 0 auto;
      padding: 1rem 1rem 2rem;
    }

    /* 面板标题 */
    .panel-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.73rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 0.9rem;
      padding-top: 0.2rem;
    }
    .panel-label::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border-hi);
      opacity: 0.35;
    }

    /* 状态提示（加载中/无数据）*/
    .state-msg {
      text-align: center;
      color: var(--muted);
      padding: 3rem 0;
      font-size: 0.9rem;
    }

    /* ── 卡片 ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 1rem 1.2rem;
      margin-bottom: 0.8rem;
      transition: border-color 0.15s;
    }
    .card:hover { border-color: var(--border-hi); }
    .card.is-top {
      background: linear-gradient(135deg, var(--surface) 0%, var(--surface2) 100%);
      border-color: #3730a3;
      box-shadow: 0 0 0 1px rgba(99,102,241,0.1),
                  inset 0 0 40px rgba(99,102,241,0.05);
    }

    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.45rem;
      align-items: center;
      font-size: 0.76rem;
      color: var(--muted);
      margin-bottom: 0.45rem;
    }
    .rank   { background: #312e81; color: #a5b4fc; padding: 1px 7px; border-radius: 4px; font-weight: 700; }
    .source { color: var(--link); font-weight: 500; }
    .score  { margin-left: auto; color: var(--score); font-size: 0.75rem; }

    .card-title { font-size: 0.97rem; font-weight: 600; line-height: 1.45; margin-bottom: 0.35rem; }
    .card-title a { color: var(--text); text-decoration: none; }
    .card-title a:hover { color: var(--accent); }

    .card-summary { color: #94a3b8; font-size: 0.86rem; }

    .ai-comment {
      margin-top: 0.7rem;
      padding: 0.6rem 0.9rem;
      background: var(--ai-bg);
      border-left: 3px solid var(--ai-border);
      border-radius: 0 6px 6px 0;
      color: var(--ai-text);
      font-size: 0.86rem;
      line-height: 1.6;
    }
    .ai-label {
      display: block;
      font-size: 0.72rem;
      font-weight: 700;
      color: #818cf8;
      margin-bottom: 0.25rem;
      letter-spacing: 0.04em;
    }

    /* ── 响应式：小屏改为上下各 50% 自然滚动 ── */
    @media (max-width: 600px) {
      html, body { overflow: auto; height: auto; }
      .split-layout { height: auto; flex-direction: column; }
      .panel-top, .panel-rest { flex: none; height: auto; overflow: visible; }
      .divider { position: sticky; top: 0; z-index: 10; }
    }
  </style>
</head>
<body>

<header>
  <h1>📰 每日资讯</h1>
  <div id="date-select-wrap">
    <label for="date-select">日期</label>
    <select id="date-select"><option>加载中…</option></select>
  </div>
  <div id="stats"></div>
</header>

<div class="split-layout">
  <!-- 上半：Top N 精选 -->
  <div class="panel-top" id="panel-top">
    <div class="panel-inner">
      <div class="panel-label" id="top-label">✦ 今日精选</div>
      <div id="list-top"><div class="state-msg">正在加载…</div></div>
    </div>
  </div>

  <!-- 分隔条 -->
  <div class="divider" id="divider-label">全部文章</div>

  <!-- 下半：其余文章 -->
  <div class="panel-rest" id="panel-rest">
    <div class="panel-inner">
      <div id="list-rest"></div>
    </div>
  </div>
</div>

<script>
const sel        = document.getElementById('date-select');
const stats      = document.getElementById('stats');
const listTop    = document.getElementById('list-top');
const listRest   = document.getElementById('list-rest');
const topLabel   = document.getElementById('top-label');
const divLabel   = document.getElementById('divider-label');

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

function cardHtml(a, isTop) {
  return \`<article class="card\${isTop ? ' is-top' : ''}">
    <div class="card-meta">
      <span class="rank">#\${a.rank}</span>
      <span class="source">\${esc(a.source)}</span>
      <span class="time">\${timeStr(a.pubDate)}</span>
      <span class="score">⭐ \${a.score}</span>
    </div>
    <h2 class="card-title">
      <a href="\${esc(a.link)}" target="_blank" rel="noopener">\${esc(a.title)}</a>
    </h2>
    \${a.summary ? \`<p class="card-summary">\${esc(a.summary)}\${a.summary.length>=300?'…':''}</p>\` : ''}
    \${a.llmComment ? \`<div class="ai-comment"><span class="ai-label">🤖 AI 点评</span>\${esc(a.llmComment)}</div>\` : ''}
  </article>\`;
}

function renderArticles(data) {
  const { meta, articles } = data;
  if (!articles?.length) {
    listTop.innerHTML  = '<div class="state-msg">当日暂无数据</div>';
    listRest.innerHTML = '';
    stats.textContent  = '';
    return;
  }

  const topN = meta?.topN ?? 5;
  const top  = articles.filter(a => a.rank <= topN);
  const rest = articles.filter(a => a.rank >  topN);

  topLabel.textContent = \`✦ 今日精选  Top \${top.length}\`;
  divLabel.textContent = \`全部文章 · \${rest.length} 篇\`;
  stats.textContent    = \`共 \${articles.length} 篇\`;

  listTop.innerHTML  = top.map(a  => cardHtml(a, true)).join('');
  listRest.innerHTML = rest.length
    ? rest.map(a => cardHtml(a, false)).join('')
    : '<div class="state-msg" style="padding:1.5rem 0">暂无更多文章</div>';

  // 每次切换日期后两个面板回滚到顶部
  document.getElementById('panel-top').scrollTop  = 0;
  document.getElementById('panel-rest').scrollTop = 0;
}

async function loadDate(dateYmd) {
  listTop.innerHTML  = '<div class="state-msg">加载中…</div>';
  listRest.innerHTML = '';
  stats.textContent  = '';
  try {
    const r = await fetch(\`data/\${dateYmd}.json?t=\${Date.now()}\`);
    if (!r.ok) throw new Error();
    renderArticles(await r.json());
  } catch {
    listTop.innerHTML = \`<div class="state-msg">\${dateYmd} 暂无数据</div>\`;
  }
}

async function init() {
  try {
    const r = await fetch(\`data/dates.json?t=\${Date.now()}\`);
    if (!r.ok) throw new Error();
    const dates = await r.json();
    if (!dates.length) { listTop.innerHTML = '<div class="state-msg">暂无历史数据</div>'; return; }
    sel.innerHTML = dates.map(d => \`<option value="\${d}">\${d}</option>\`).join('');
    sel.addEventListener('change', () => loadDate(sel.value));
    loadDate(dates[0]);
  } catch {
    listTop.innerHTML = '<div class="state-msg">无法加载日期列表，请稍后刷新</div>';
  }
}

init();
</script>
</body>
</html>`;
}
