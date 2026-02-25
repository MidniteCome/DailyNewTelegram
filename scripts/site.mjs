/**
 * site.mjs — 静态网站生成模块
 *
 * 输出：
 *   docs/data/YYYY-MM-DD.json   每日文章归档（含 meta.topN + category）
 *   docs/data/dates.json        所有已存档日期列表
 *   docs/index.html             单页应用
 */

import fs from "node:fs/promises";
import path from "node:path";

const DOCS_DIR = "docs";
const DATA_DIR = path.join(DOCS_DIR, "data");

export async function generateSite(rankedArticles, dateYmd, topN = 5) {
  await fs.mkdir(DATA_DIR, { recursive: true });

  // 1. 写当日 JSON 归档
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
      category:   a.category ?? "📰 其他",
      titleEn:    a.titleEn ?? null,
      titleZh:    a.titleZh ?? null,
      isHot:      a.isHot ?? false,
      paywalled:  a.paywalled ?? false,
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
<html lang="zh-CN" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>每日资讯</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── 主题变量 ── */
    [data-theme="dark"] {
      --bg:         #0f1117;
      --surface:    #1a1d2e;
      --surface2:   #141726;
      --border:     #2d3148;
      --border-hi:  #6366f1;
      --text:       #e2e8f0;
      --text-sub:   #94a3b8;
      --muted:      #64748b;
      --accent:     #a78bfa;
      --link:       #818cf8;
      --ai-bg:      #1e1b4b;
      --ai-border:  #4338ca;
      --ai-text:    #c7d2fe;
      --tag-bg:     rgba(255,255,255,0.07);
      --filter-bg:  #1e2235;
      --filter-active-bg: #4f46e5;
      --filter-active-text: #ffffff;
      --kbd-bg:     #2d3148;
      --signal-hi:  #16a34a;
      --signal-mid: #b45309;
    }
    [data-theme="light"] {
      --bg:         #f8fafc;
      --surface:    #ffffff;
      --surface2:   #f1f5f9;
      --border:     #e2e8f0;
      --border-hi:  #6366f1;
      --text:       #1e293b;
      --text-sub:   #475569;
      --muted:      #94a3b8;
      --accent:     #6366f1;
      --link:       #4f46e5;
      --ai-bg:      #eef2ff;
      --ai-border:  #6366f1;
      --ai-text:    #3730a3;
      --tag-bg:     rgba(0,0,0,0.06);
      --filter-bg:  #e0e7ff;
      --filter-active-bg: #4f46e5;
      --filter-active-text: #ffffff;
      --kbd-bg:     #e2e8f0;
      --signal-hi:  #15803d;
      --signal-mid: #92400e;
    }

    html, body {
      height: 100%;
      overflow: hidden;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI",
                   "PingFang SC", "Microsoft YaHei", sans-serif;
      font-size: 15px;
      line-height: 1.65;
      transition: background 0.2s, color 0.2s;
    }

    /* ── 顶栏 ── */
    header {
      height: 54px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0 1.2rem;
      display: flex;
      align-items: center;
      gap: 0.9rem;
      flex-shrink: 0;
      z-index: 20;
    }
    header h1 {
      font-size: 1.05rem;
      color: var(--accent);
      white-space: nowrap;
      font-weight: 700;
    }

    /* 过滤按钮组 */
    .filter-group {
      display: flex;
      gap: 4px;
      background: var(--filter-bg);
      border-radius: 8px;
      padding: 3px;
    }
    .filter-btn {
      border: none;
      background: transparent;
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 600;
      padding: 3px 10px;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s, color 0.15s;
    }
    .filter-btn.active {
      background: var(--filter-active-bg);
      color: var(--filter-active-text);
    }
    .filter-btn:not(.active):hover { color: var(--text); }

    /* 日期选择 */
    #date-select-wrap { display: flex; align-items: center; gap: 0.4rem; }
    #date-select-wrap label { color: var(--muted); font-size: 0.8rem; }
    #date-select {
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.2rem 0.55rem;
      font-size: 0.85rem;
      cursor: pointer;
    }
    #date-select:focus { outline: none; border-color: var(--border-hi); }

    /* 统计栏 */
    #stats {
      margin-left: auto;
      display: flex;
      gap: 0.6rem;
      align-items: center;
      font-size: 0.78rem;
      color: var(--muted);
      white-space: nowrap;
      flex-wrap: nowrap;
    }
    .stat-chip {
      background: var(--tag-bg);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 0.73rem;
      color: var(--text-sub);
    }

    /* 主题切换按钮 */
    #theme-toggle {
      border: none;
      background: var(--tag-bg);
      color: var(--text);
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    #theme-toggle:hover { background: var(--border); }

    /* ── 布局 ── */
    .split-layout {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 54px);
    }
    .panel-top {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      background: var(--bg);
      border-bottom: 2px solid var(--border-hi);
    }
    .divider {
      flex-shrink: 0;
      height: 34px;
      background: var(--surface2);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      padding: 0 1.5rem;
      gap: 0.6rem;
      font-size: 0.73rem;
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
    .panel-rest {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      background: var(--bg);
    }
    .panel-inner {
      max-width: 800px;
      margin: 0 auto;
      padding: 1rem 1rem 2rem;
    }
    .panel-label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.72rem;
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
    .state-msg {
      text-align: center;
      color: var(--muted);
      padding: 3rem 0;
      font-size: 0.9rem;
    }

    /* ── 카드 ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 0.9rem 1.1rem;
      margin-bottom: 0.75rem;
      transition: border-color 0.15s;
      outline: none;
    }
    .card:hover, .card.kbd-focus { border-color: var(--border-hi); }
    .card.kbd-focus {
      box-shadow: 0 0 0 2px rgba(99,102,241,0.35);
    }

    /* Top 卡片：更突出 */
    .card.is-top {
      border-left: 3px solid var(--border-hi);
      border-radius: 0 10px 10px 0;
      background: var(--surface);
    }
    [data-theme="dark"] .card.is-top {
      background: linear-gradient(135deg, #1a1d2e 0%, #141726 100%);
      box-shadow: inset 0 0 40px rgba(99,102,241,0.04);
    }
    [data-theme="light"] .card.is-top {
      background: linear-gradient(135deg, #ffffff 0%, #f5f3ff 100%);
    }

    /* 元信息行 */
    .card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      align-items: center;
      font-size: 0.74rem;
      color: var(--muted);
      margin-bottom: 0.5rem;
    }
    .rank {
      background: #312e81;
      color: #a5b4fc;
      padding: 1px 7px;
      border-radius: 4px;
      font-weight: 700;
      font-size: 0.72rem;
    }
    .hot-badge {
      background: #7c2d12;
      color: #fb923c;
      padding: 1px 7px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 700;
    }

    /* 信号标签 */
    .tag {
      padding: 1px 7px;
      border-radius: 4px;
      font-size: 0.69rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      background: var(--tag-bg);
      color: var(--text-sub);
    }
    .tag-ai       { background: #1e1b4b; color: #a5b4fc; }
    .tag-llm      { background: #1e1b4b; color: #c4b5fd; }
    .tag-ma       { background: #431407; color: #fb923c; }
    .tag-ipo      { background: #14532d; color: #86efac; }
    .tag-fund     { background: #164e63; color: #67e8f9; }
    .tag-fin      { background: #1c1917; color: #a8a29e; }
    .tag-chip     { background: #2e1065; color: #d8b4fe; }
    .tag-macro    { background: #1c2535; color: #93c5fd; }
    .tag-dev      { background: #042f2e; color: #5eead4; }
    .tag-sec      { background: #450a0a; color: #fca5a5; }
    .tag-essay    { background: #1e1b4b; color: #e0e7ff; }
    [data-theme="light"] .tag-ai    { background: #e0e7ff; color: #4338ca; }
    [data-theme="light"] .tag-llm   { background: #ede9fe; color: #6d28d9; }
    [data-theme="light"] .tag-ma    { background: #fff7ed; color: #c2410c; }
    [data-theme="light"] .tag-ipo   { background: #dcfce7; color: #15803d; }
    [data-theme="light"] .tag-fund  { background: #e0f2fe; color: #0369a1; }
    [data-theme="light"] .tag-fin   { background: #f5f5f4; color: #57534e; }
    [data-theme="light"] .tag-chip  { background: #faf5ff; color: #7e22ce; }
    [data-theme="light"] .tag-macro { background: #eff6ff; color: #1d4ed8; }
    [data-theme="light"] .tag-dev   { background: #f0fdfa; color: #0f766e; }
    [data-theme="light"] .tag-sec   { background: #fff1f2; color: #be123c; }
    [data-theme="light"] .tag-essay { background: #eef2ff; color: #4338ca; }

    /* 来源·时间·信号等级 */
    .source-row {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      flex-wrap: wrap;
      margin-left: auto;
    }
    .source { color: var(--link); font-weight: 500; }
    .sep { color: var(--muted); }
    .time { color: var(--muted); cursor: default; }
    .signal {
      font-weight: 700;
      font-size: 0.68rem;
      padding: 1px 6px;
      border-radius: 3px;
      letter-spacing: 0.02em;
    }
    .signal-hi  { color: var(--signal-hi); background: rgba(22,163,74,0.1); }
    .signal-mid { color: var(--signal-mid); background: rgba(180,83,9,0.1); }

    /* 付费墙标记 */
    .lock-badge {
      font-size: 0.72rem;
      opacity: 0.75;
      cursor: default;
      user-select: none;
    }

    /* 标题 */
    .card-title {
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.45;
      margin-bottom: 0.2rem;
    }
    .card.is-top .card-title { font-size: 1.13rem; }
    .card-title a { color: var(--text); text-decoration: none; }
    .card-title a:hover { color: var(--accent); }

    .card-title-zh {
      font-size: 0.87rem;
      color: var(--accent);
      font-weight: 500;
      margin-bottom: 0.3rem;
      opacity: 0.9;
    }
    .card-summary {
      color: var(--text-sub);
      font-size: 0.85rem;
      line-height: 1.55;
    }

    /* AI 点评（含展开/收起） */
    .ai-comment {
      margin-top: 0.65rem;
      padding: 0.55rem 0.85rem;
      background: var(--ai-bg);
      border-left: 3px solid var(--ai-border);
      border-radius: 0 6px 6px 0;
      color: var(--ai-text);
      font-size: 0.85rem;
      line-height: 1.65;
    }
    .ai-label {
      display: block;
      font-size: 0.7rem;
      font-weight: 700;
      color: #818cf8;
      margin-bottom: 0.25rem;
      letter-spacing: 0.04em;
    }
    .ai-text {
      white-space: pre-wrap;
      word-break: break-word;
    }
    .ai-text.clamped {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .expand-btn {
      display: inline-block;
      margin-top: 0.3rem;
      border: none;
      background: none;
      color: var(--link);
      font-size: 0.78rem;
      cursor: pointer;
      padding: 0;
      font-weight: 600;
    }
    .expand-btn:hover { text-decoration: underline; }

    /* ── 分类折叠组 ── */
    .cat-group {
      margin-bottom: 0.55rem;
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }
    .cat-group[open] { border-color: rgba(99,102,241,0.5); }
    .cat-header {
      display: flex;
      align-items: center;
      gap: 0.55rem;
      padding: 0.6rem 1rem;
      background: var(--surface);
      cursor: pointer;
      user-select: none;
      list-style: none;
      font-size: 0.82rem;
      font-weight: 700;
      color: var(--accent);
      transition: background 0.12s;
    }
    .cat-header::-webkit-details-marker { display: none; }
    .cat-header::marker { display: none; }
    .cat-header:hover { background: var(--surface2); }
    .cat-count {
      margin-left: auto;
      background: var(--bg);
      padding: 1px 8px;
      border-radius: 12px;
      font-size: 0.72rem;
      color: var(--muted);
      font-weight: 500;
    }
    .cat-chevron {
      font-size: 0.62rem;
      color: var(--muted);
      transition: transform 0.2s;
    }
    details[open] > .cat-header .cat-chevron { transform: rotate(180deg); }
    .cat-body {
      padding: 0.55rem 0.55rem 0.1rem;
      background: var(--bg);
    }
    .cat-body .card { margin-bottom: 0.5rem; }
    .cat-body .card:last-child { margin-bottom: 0; }

    /* 快捷键提示 */
    .kbd-hint {
      margin-left: 0.6rem;
      font-size: 0.68rem;
      color: var(--muted);
      font-weight: 400;
      letter-spacing: 0;
      text-transform: none;
    }
    kbd {
      background: var(--kbd-bg);
      border-radius: 3px;
      padding: 0 4px;
      font-family: monospace;
      font-size: 0.7rem;
      color: var(--text-sub);
    }

    /* ── 响应式 ── */
    @media (max-width: 640px) {
      html, body { overflow: auto; height: auto; }
      .split-layout { height: auto; }
      .panel-top, .panel-rest { flex: none; height: auto; overflow: visible; }
      .panel-top { border-bottom: none; }
      .divider { position: sticky; top: 0; z-index: 10; }
      #stats .stat-chip:nth-child(n+3) { display: none; }
      .kbd-hint { display: none; }
    }
  </style>
</head>
<body>

<header>
  <h1>📰 每日资讯</h1>

  <div class="filter-group">
    <button class="filter-btn active" data-filter="all">全部</button>
    <button class="filter-btn" data-filter="deal">仅交易信号</button>
  </div>

  <div id="date-select-wrap">
    <label for="date-select">日期</label>
    <select id="date-select"><option>加载中…</option></select>
  </div>

  <div id="stats"></div>

  <button id="theme-toggle" title="切换明暗模式">🌙</button>
</header>

<div class="split-layout">
  <div class="panel-top" id="panel-top">
    <div class="panel-inner">
      <div class="panel-label" id="top-label">✦ 今日精选</div>
      <div id="list-top"><div class="state-msg">正在加载…</div></div>
    </div>
  </div>

  <div class="divider" id="divider-label">
    全部文章
    <span class="kbd-hint"><kbd>j</kbd><kbd>k</kbd> 导航 &nbsp;<kbd>o</kbd> 打开</span>
  </div>

  <div class="panel-rest" id="panel-rest">
    <div class="panel-inner">
      <div id="list-rest"></div>
    </div>
  </div>
</div>

<script>
// ── 主题 ──────────────────────────────────────────────────────────────────────
(function() {
  const stored = localStorage.getItem('theme');
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', stored || sys);
  document.getElementById('theme-toggle').textContent = (stored || sys) === 'dark' ? '☀️' : '🌙';
})();

document.getElementById('theme-toggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
});

// ── 全局状态 ──────────────────────────────────────────────────────────────────
const sel       = document.getElementById('date-select');
const stats     = document.getElementById('stats');
const listTop   = document.getElementById('list-top');
const listRest  = document.getElementById('list-rest');
const topLabel  = document.getElementById('top-label');
const divLabel  = document.getElementById('divider-label');

let currentFilter = 'all';   // 'all' | 'deal'
let currentData   = null;
let kbdIdx        = -1;       // 当前键盘焦点文章索引

// 分类展示顺序
const CAT_ORDER = [
  "🤖 AI & 研究",
  "💼 并购 & 交易",
  "💰 金融 & 创投",
  "🔧 开发 & 系统",
  "🛡️ 安全",
  "💻 科技产品",
  "📝 深度阅读",
  "🌐 社区",
  "📰 其他",
];

// "交易信号"分类
const DEAL_CATS = new Set(["💼 并购 & 交易", "💰 金融 & 创投"]);

// ── 工具函数 ─────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function relativeTime(iso) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1)   return '刚刚';
    if (mins < 60)  return mins + '分钟前';
    const hrs = Math.round(mins / 60);
    if (hrs < 24)   return hrs + '小时前';
    const days = Math.round(hrs / 24);
    return days + '天前';
  } catch { return ''; }
}

function fullTime(iso) {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }) + ' CST';
  } catch { return iso?.slice(0,16) ?? ''; }
}

function signalBadge(score) {
  if (score >= 60) return '<span class="signal signal-hi">High Signal</span>';
  if (score >= 42) return '<span class="signal signal-mid">Signal</span>';
  return '';
}

// 分类 → 标签
const CAT_TAG = {
  "🤖 AI & 研究":  { label:'AI',       cls:'tag-ai'    },
  "💼 并购 & 交易": { label:'M&A',      cls:'tag-ma'    },
  "💰 金融 & 创投": { label:'Finance',  cls:'tag-fin'   },
  "🔧 开发 & 系统": { label:'Dev',      cls:'tag-dev'   },
  "🛡️ 安全":        { label:'Security', cls:'tag-sec'   },
  "💻 科技产品":    { label:'Tech',     cls:'tag-ai'    },
  "📝 深度阅读":    { label:'Essay',    cls:'tag-essay' },
};

// 从标题额外识别标签
function extraTags(title) {
  const t = (title || '').toLowerCase();
  const tags = [];
  if (/\\bipo\\b|\\bs-1\\b|\\bf-1\\b/.test(t))                           tags.push({label:'IPO',     cls:'tag-ipo'  });
  if (/\\bllm\\b|\\bgpt\\b|claude|gemini|chatgpt/.test(t))               tags.push({label:'LLM',     cls:'tag-llm'  });
  if (/semiconductor|\\bchip\\b|nvidia|\\btsmc\\b/.test(t))              tags.push({label:'Chip',    cls:'tag-chip' });
  if (/\\bfed\\b|fomc|\\bcpi\\b|rate cut|rate hike/.test(t))             tags.push({label:'Macro',   cls:'tag-macro'});
  if (/series [a-e]\\b|funding round|raises \\$|raised \\$/.test(t))    tags.push({label:'Funding', cls:'tag-fund' });
  return tags;
}

function tagsHtml(a) {
  const all = [];
  const cat = CAT_TAG[a.category];
  if (cat) all.push(cat);
  for (const t of extraTags(a.titleEn ?? a.title)) {
    if (!all.some(x => x.label === t.label)) all.push(t);
  }
  return all.slice(0,3).map(t => \`<span class="tag \${t.cls}">\${t.label}</span>\`).join('');
}

// ── 卡片 HTML ────────────────────────────────────────────────────────────────
function cardHtml(a, isTop, idx) {
  const displayTitle = esc(a.titleEn ?? a.title);
  const sig  = signalBadge(a.score);
  const rtim = relativeTime(a.pubDate);
  const ftim = fullTime(a.pubDate);
  const tags = tagsHtml(a);
  const lock = a.paywalled ? \` <span class="lock-badge" title="付费内容 · 仅标题">🔒</span>\` : '';

  const aiBlock = a.llmComment ? \`
    <div class="ai-comment">
      <span class="ai-label">🤖 AI 点评</span>
      <div class="ai-text clamped">\${esc(a.llmComment)}</div>
      <button class="expand-btn" onclick="toggleAI(this)">展开 ▾</button>
    </div>\` : '';

  return \`<article class="card\${isTop ? ' is-top' : ''}" data-idx="\${idx}" tabindex="-1">
  <div class="card-meta">
    <span class="rank">#\${a.rank}</span>
    \${a.isHot ? '<span class="hot-badge">🔥 热议</span>' : ''}
    \${tags}
    <span class="source-row">
      <span class="source">\${esc(a.source)}\${lock}</span>
      <span class="sep">·</span>
      <span class="time" title="\${esc(ftim)}">\${esc(rtim)}</span>
      \${sig ? '<span class="sep">·</span>' + sig : ''}
    </span>
  </div>
  <h2 class="card-title">
    <a href="\${esc(a.link)}" target="_blank" rel="noopener">\${displayTitle}</a>
  </h2>
  \${a.titleZh ? \`<p class="card-title-zh">\${esc(a.titleZh)}</p>\` : ''}
  \${a.summary ? \`<p class="card-summary">\${esc(a.summary)}\${a.summary.length>=300?'…':''}</p>\` : ''}
  \${aiBlock}
</article>\`;
}

// AI 展开/收起
function toggleAI(btn) {
  const text = btn.previousElementSibling;
  const expanded = text.classList.toggle('clamped');
  btn.textContent = !expanded ? '收起 ▴' : '展开 ▾';
}

// ── 分类折叠组 ───────────────────────────────────────────────────────────────
function groupByCategory(articles) {
  const map = new Map();
  for (const a of articles) {
    const cat = a.category || "📰 其他";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat).push(a);
  }
  return map;
}

function catGroupHtml(catName, articles, startIdx) {
  let idx = startIdx;
  const cards = articles.map(a => cardHtml(a, false, idx++)).join('');
  return \`<details class="cat-group">
  <summary class="cat-header">
    <span>\${esc(catName)}</span>
    <span class="cat-count">\${articles.length} 篇</span>
    <span class="cat-chevron">▼</span>
  </summary>
  <div class="cat-body">\${cards}</div>
</details>\`;
}

function renderRestByCat(rest) {
  if (!rest.length) return '<div class="state-msg" style="padding:1.5rem 0">暂无更多文章</div>';
  const groups = groupByCategory(rest);
  const html = [];
  let idx = 100; // rest 区 idx 从 100 起，避免与 top 冲突
  for (const cat of CAT_ORDER) {
    if (groups.has(cat)) { html.push(catGroupHtml(cat, groups.get(cat), idx)); idx += groups.get(cat).length; }
  }
  for (const [cat, arts] of groups) {
    if (!CAT_ORDER.includes(cat)) { html.push(catGroupHtml(cat, arts, idx)); idx += arts.length; }
  }
  return html.join('');
}

// ── 统计概览 ─────────────────────────────────────────────────────────────────
function renderStats(articles) {
  if (!articles.length) { stats.innerHTML = ''; return; }
  const counts = {};
  for (const a of articles) {
    const c = a.category || '📰 其他';
    counts[c] = (counts[c] || 0) + 1;
  }
  const chips = [
    { key: '🤖 AI & 研究',  label: 'AI'  },
    { key: '💼 并购 & 交易', label: 'M&A' },
    { key: '💰 金融 & 创投', label: '金融' },
    { key: '📝 深度阅读',    label: '深度' },
  ]
  .filter(c => counts[c.key])
  .map(c => \`<span class="stat-chip">\${c.label} \${counts[c.key]}</span>\`)
  .join('');
  stats.innerHTML = \`<span style="color:var(--muted);font-size:0.78rem">共 \${articles.length} 条</span>\${chips}\`;
}

// ── 渲染 ──────────────────────────────────────────────────────────────────────
function applyFilter(data) {
  if (!data) return;
  const { meta, articles } = data;
  if (!articles?.length) {
    listTop.innerHTML  = '<div class="state-msg">当日暂无数据</div>';
    listRest.innerHTML = '';
    stats.innerHTML = '';
    return;
  }

  const topN = meta?.topN ?? 5;
  let filtered = articles;

  if (currentFilter === 'deal') {
    filtered = articles.filter(a => DEAL_CATS.has(a.category)
      || /\\bipo\\b|s-1|f-1|acquisition|merger|series [a-e]\\b/i.test(a.title));
  }

  const top  = filtered.filter(a => a.rank <= topN);
  const rest = filtered.filter(a => a.rank >  topN);

  topLabel.textContent = \`✦ 今日精选  Top \${top.length}\${currentFilter === 'deal' ? '  ·  交易信号' : ''}\`;

  const restLabel = currentFilter === 'deal'
    ? \`交易信号 · \${rest.length} 篇\`
    : \`全部文章 · \${rest.length} 篇\`;
  // 只替换文字内容，保留 kbd-hint span
  const kbdSpan = divLabel.querySelector('.kbd-hint');
  divLabel.childNodes[0].textContent = restLabel + ' ';
  if (kbdSpan && !divLabel.contains(kbdSpan)) divLabel.appendChild(kbdSpan);

  renderStats(filtered);
  listTop.innerHTML  = top.map((a, i) => cardHtml(a, true, i)).join('') || '<div class="state-msg">当日暂无精选</div>';
  listRest.innerHTML = renderRestByCat(rest);

  document.getElementById('panel-top').scrollTop  = 0;
  document.getElementById('panel-rest').scrollTop = 0;
  kbdIdx = -1;
}

function renderArticles(data) {
  currentData = data;
  applyFilter(data);
}

// ── 过滤按钮 ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    applyFilter(currentData);
  });
});

// ── 键盘导航 (j/k/o) ─────────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  // 忽略输入框内的键盘事件
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

  const cards = Array.from(document.querySelectorAll('.card'));
  if (!cards.length) return;

  if (e.key === 'j' || e.key === 'J') {
    e.preventDefault();
    kbdIdx = Math.min(kbdIdx + 1, cards.length - 1);
    updateKbdFocus(cards);
  } else if (e.key === 'k' || e.key === 'K') {
    e.preventDefault();
    kbdIdx = Math.max(kbdIdx - 1, 0);
    updateKbdFocus(cards);
  } else if ((e.key === 'o' || e.key === 'O') && kbdIdx >= 0) {
    e.preventDefault();
    const link = cards[kbdIdx]?.querySelector('a');
    if (link) window.open(link.href, '_blank', 'noopener');
  }
});

function updateKbdFocus(cards) {
  cards.forEach(c => c.classList.remove('kbd-focus'));
  const target = cards[kbdIdx];
  if (!target) return;
  target.classList.add('kbd-focus');
  target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ── 数据加载 ─────────────────────────────────────────────────────────────────
async function loadDate(dateYmd) {
  listTop.innerHTML  = '<div class="state-msg">加载中…</div>';
  listRest.innerHTML = '';
  stats.innerHTML    = '';
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
