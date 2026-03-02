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

// 单独导出：仅重新生成 index.html（供 podcast.mjs 调用，无需传入文章数据）
export async function generateIndexHtml() {
  await fs.mkdir(DOCS_DIR, { recursive: true });
  await fs.writeFile(path.join(DOCS_DIR, "index.html"), buildSpaHtml(), "utf8");
  console.log(`  ✓ index.html 已更新`);
}

// ─── SPA HTML ─────────────────────────────────────────────────────────────────

function buildSpaHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <title>Daily Brief</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Design tokens ── */
    :root { --radius: 11px; --radius-sm: 6px; --radius-pill: 999px; }

    /* ── Light mode: Nordic Cool White ── */
    [data-theme="light"] {
      --bg:        #F7F8FA;
      --surface:   #FFFFFF;
      --surface2:  #F3F4F6;
      --border:    #E5E7EB;
      --border-hi: #9CA3AF;
      --text:      #111827;
      --text-sub:  #6B7280;
      --muted:     #9CA3AF;
      --link:      #4F6EF7;
      --accent:    #4F6EF7;
      --accent-bg: #EEF2FF;

      --tag-bg:    #F3F4F6;  --tag-text:  #6B7280;
      --tag-ma-bg: #FFF7ED;  --tag-ma:    #C2410C;
      --tag-eq-bg: #F0FDF4;  --tag-eq:    #15803D;
      --tag-ai-bg: #EEF2FF;  --tag-ai:    #4338CA;
      --tag-ll-bg: #EDE9FE;  --tag-ll:    #6D28D9;
      --tag-ch-bg: #FAF5FF;  --tag-ch:    #7E22CE;
      --tag-mc-bg: #EFF6FF;  --tag-mc:    #1D4ED8;
      --tag-fu-bg: #ECFEFF;  --tag-fu:    #0E7490;
      --tag-sc-bg: #FFF1F2;  --tag-sc:    #BE123C;
      --tag-dv-bg: #F0FDFA;  --tag-dv:    #0F766E;
      --tag-es-bg: #F0FDF4;  --tag-es:    #166534;

      --sig-hi:    #16A34A;  --sig-hi-bg:  rgba(22,163,74,0.09);
      --sig-mid:   #D97706;  --sig-mid-bg: rgba(217,119,6,0.09);

      --ai-bg:     #F8F9FF;  --ai-border: #C7D2FE;
      --ai-text:   #3730A3;  --ai-label:  #4F6EF7;

      --fab-bg:    #4F6EF7;  --fab-text:  #FFFFFF;
      --fbtn-hover:#F3F4F6;
      --kbd-bg:    #F3F4F6;
    }

    /* ── Dark mode: Nordic Deep ── */
    [data-theme="dark"] {
      --bg:        #0B0F14;
      --surface:   #121826;
      --surface2:  #1A2235;
      --border:    #1F2937;
      --border-hi: #374151;
      --text:      #E5E7EB;
      --text-sub:  #9CA3AF;
      --muted:     #6B7280;
      --link:      #7C93FF;
      --accent:    #7C93FF;
      --accent-bg: #141B2F;

      --tag-bg:    #1F2937;  --tag-text:  #9CA3AF;
      --tag-ma-bg: #1C0A00;  --tag-ma:    #FB923C;
      --tag-eq-bg: #052E16;  --tag-eq:    #4ADE80;
      --tag-ai-bg: #141B2F;  --tag-ai:    #818CF8;
      --tag-ll-bg: #1E1B4B;  --tag-ll:    #C4B5FD;
      --tag-ch-bg: #2E1065;  --tag-ch:    #D8B4FE;
      --tag-mc-bg: #0C1A35;  --tag-mc:    #93C5FD;
      --tag-fu-bg: #083344;  --tag-fu:    #67E8F9;
      --tag-sc-bg: #450A0A;  --tag-sc:    #FCA5A5;
      --tag-dv-bg: #042F2E;  --tag-dv:    #5EEAD4;
      --tag-es-bg: #052E16;  --tag-es:    #86EFAC;

      --sig-hi:    #4ADE80;  --sig-hi-bg:  rgba(74,222,128,0.09);
      --sig-mid:   #FBBF24;  --sig-mid-bg: rgba(251,191,36,0.09);

      --ai-bg:     #0D1321;  --ai-border: #3730A3;
      --ai-text:   #A5B4FC;  --ai-label:  #7C93FF;

      --fab-bg:    #7C93FF;  --fab-text:  #0B0F14;
      --fbtn-hover:#1F2937;
      --kbd-bg:    #1F2937;
    }

    html, body {
      min-height: 100%;
      background: var(--bg); color: var(--text);
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
                   "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
      font-size: 15px; line-height: 1.65;
      -webkit-font-smoothing: antialiased;
      transition: background 0.15s, color 0.15s;
    }

    /* ── Header ── */
    header {
      position: sticky; top: 0;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      z-index: 20;
    }

    /* Top nav row: brand + main tabs + theme toggle */
    .header-top {
      display: flex; align-items: stretch;
      padding: 0 1.25rem; gap: 0;
      height: 48px;
    }
    .brand {
      font-size: 0.87rem; font-weight: 700;
      color: var(--text); white-space: nowrap; letter-spacing: -0.03em;
      flex-shrink: 0; display: flex; align-items: center;
      padding-right: 1.5rem;
    }
    .brand-sep { color: var(--accent); font-weight: 300; margin: 0 1px; }

    /* Main tab navigation */
    .main-tabs {
      display: flex; align-items: stretch; gap: 0; flex-shrink: 0;
    }
    .main-tab {
      border: none; background: transparent;
      color: var(--muted); font-size: 0.83rem; font-weight: 500;
      padding: 0 1.1rem; cursor: pointer;
      font-family: inherit; white-space: nowrap;
      border-bottom: 2px solid transparent;
      transition: color 0.15s, border-color 0.15s;
      display: flex; align-items: center; gap: 5px;
      margin-bottom: -1px;
    }
    .main-tab:hover { color: var(--text-sub); }
    .main-tab.active {
      color: var(--accent); font-weight: 600;
      border-bottom-color: var(--accent);
    }

    /* News controls bar */
    #news-controls {
      display: flex; align-items: center; gap: 0.65rem;
      padding: 0 1.25rem 0.6rem; flex-wrap: wrap;
    }

    /* Filter tabs — underline style */
    .filter-group {
      display: flex; gap: 2px; flex-shrink: 0;
    }
    .filter-btn {
      border: none; background: transparent;
      color: var(--muted); font-size: 0.76rem; font-weight: 500;
      padding: 3px 10px; border-radius: var(--radius-pill);
      cursor: pointer; white-space: nowrap;
      transition: background 0.1s, color 0.1s;
      font-family: inherit;
    }
    .filter-btn.active {
      background: var(--accent-bg); color: var(--accent); font-weight: 600;
    }
    .filter-btn:not(.active):hover { background: var(--surface2); color: var(--text-sub); }

    /* Search */
    .search-wrap { flex: 1; max-width: 200px; }
    .search-input {
      width: 100%;
      background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--radius-pill); color: var(--text);
      font-size: 0.78rem; padding: 4px 12px;
      font-family: inherit; outline: none;
      transition: border-color 0.15s;
    }
    .search-input::placeholder { color: var(--muted); }
    .search-input:focus { border-color: var(--accent); }

    /* Date select */
    #date-select-wrap { display: flex; align-items: center; gap: 0.3rem; }
    #date-select-wrap label { color: var(--muted); font-size: 0.73rem; }
    #date-select {
      background: var(--bg); color: var(--text);
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 3px 8px; font-size: 0.77rem; cursor: pointer;
      font-family: inherit; outline: none;
      transition: border-color 0.15s;
    }
    #date-select:focus { border-color: var(--accent); }

    /* Stats */
    #stats {
      margin-left: auto; display: flex; gap: 0.35rem; flex-shrink: 0;
      align-items: center; font-size: 0.72rem;
      color: var(--muted); white-space: nowrap;
    }
    .stat-chip {
      background: var(--tag-bg); padding: 2px 8px;
      border-radius: var(--radius-pill); font-size: 0.70rem; color: var(--text-sub);
    }

    /* Theme toggle */
    #theme-toggle {
      border: 1px solid var(--border); background: transparent;
      color: var(--muted); width: 30px; height: 30px;
      border-radius: var(--radius-sm); cursor: pointer;
      font-size: 0.85rem; display: flex; align-items: center;
      justify-content: center; flex-shrink: 0;
      margin-left: auto;
      transition: border-color 0.15s, color 0.15s;
    }
    #theme-toggle:hover { border-color: var(--border-hi); color: var(--text); }

    /* ── Layout ── */
    .split-layout { }
    .panel-top  { }
    .divider {
      position: sticky; top: 48px; z-index: 15;
      height: 30px;
      background: var(--surface);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      display: flex; align-items: center;
      padding: 0 1.25rem; gap: 0.45rem;
      font-size: 0.67rem; font-weight: 600;
      letter-spacing: 0.07em; text-transform: uppercase;
      color: var(--muted); user-select: none;
    }
    .divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
    .panel-rest { }
    .panel-inner { max-width: 780px; margin: 0 auto; padding: 1rem 1.25rem 2.5rem; }

    .panel-label {
      font-size: 0.67rem; font-weight: 600;
      letter-spacing: 0.07em; text-transform: uppercase;
      color: var(--muted); margin-bottom: 0.8rem;
      display: flex; align-items: center; gap: 0.5rem;
    }
    .panel-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

    .state-msg {
      text-align: center; color: var(--muted);
      padding: 3rem 0; font-size: 0.88rem;
    }

    /* ── Tags / Badges — capsule shape ── */
    .tag {
      display: inline-block; padding: 2px 7px;
      border-radius: var(--radius-pill); font-size: 0.67rem; font-weight: 500;
      letter-spacing: 0.01em; background: var(--tag-bg); color: var(--tag-text);
    }
    .tag-ma   { background: var(--tag-ma-bg); color: var(--tag-ma); }
    .tag-ipo  { background: var(--tag-eq-bg); color: var(--tag-eq); }
    .tag-ai   { background: var(--tag-ai-bg); color: var(--tag-ai); }
    .tag-llm  { background: var(--tag-ll-bg); color: var(--tag-ll); }
    .tag-chip { background: var(--tag-ch-bg); color: var(--tag-ch); }
    .tag-macro{ background: var(--tag-mc-bg); color: var(--tag-mc); }
    .tag-fund { background: var(--tag-fu-bg); color: var(--tag-fu); }
    .tag-sec  { background: var(--tag-sc-bg); color: var(--tag-sc); }
    .tag-dev  { background: var(--tag-dv-bg); color: var(--tag-dv); }
    .tag-essay{ background: var(--tag-es-bg); color: var(--tag-es); }
    .tag-fin  { background: var(--tag-bg);    color: var(--tag-text); }

    /* ── Cards ── */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 13px 16px;
      margin-bottom: 6px;
      transition: border-color 0.12s, background 0.12s;
      outline: none;
    }
    .card:last-child { margin-bottom: 0; }
    .card:hover, .card.kbd-focus {
      border-color: var(--border-hi);
      background: var(--surface);
    }

    /* meta row */
    .card-meta {
      display: flex; flex-wrap: wrap;
      align-items: center; gap: 5px;
      margin-bottom: 6px;
    }
    .rank {
      font-family: ui-monospace, "SFMono-Regular", monospace;
      font-size: 0.65rem; font-weight: 700; color: var(--muted);
      min-width: 1.6rem;
    }
    .hot-badge { font-size: 0.67rem; color: #EA580C; font-weight: 700; }

    /* source row */
    .source-row {
      margin-left: auto; display: flex;
      align-items: center; gap: 4px; flex-wrap: wrap;
    }
    .source { font-size: 0.73rem; color: var(--text-sub); font-weight: 500; }
    .sep    { font-size: 0.73rem; color: var(--border-hi); }
    .time   { font-size: 0.73rem; color: var(--muted); cursor: default; }
    .lock-badge { font-size: 0.68rem; opacity: 0.5; cursor: default; user-select: none; }

    /* signal — pill indicator */
    .signal {
      font-size: 0.65rem; font-weight: 600;
      padding: 2px 7px; border-radius: var(--radius-pill); letter-spacing: 0.01em;
    }
    .signal-hi  { background: var(--sig-hi-bg);  color: var(--sig-hi);  }
    .signal-mid { background: var(--sig-mid-bg); color: var(--sig-mid); }

    /* title */
    .card-title {
      font-size: 0.95rem; font-weight: 600;
      line-height: 1.45; margin-bottom: 1px; letter-spacing: -0.01em;
    }
    .card-title a { color: var(--text); text-decoration: none; }
    .card-title a:hover { color: var(--link); }
    .card-title-zh {
      font-size: 0.83rem; color: var(--text-sub);
      font-weight: 400; margin-bottom: 3px; line-height: 1.55;
    }
    .card-summary {
      font-size: 0.82rem; color: var(--text-sub);
      line-height: 1.6; margin-top: 5px;
    }

    /* AI comment — thin left accent line */
    .ai-comment {
      margin-top: 9px; padding: 7px 11px;
      background: var(--ai-bg);
      border-left: 2px solid var(--ai-border);
      border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    }
    .ai-label {
      display: inline-block; font-size: 0.62rem; font-weight: 700;
      color: var(--ai-label); letter-spacing: 0.07em;
      text-transform: uppercase; margin-bottom: 3px;
    }
    .ai-text {
      font-size: 0.82rem; color: var(--ai-text);
      line-height: 1.65; white-space: pre-wrap; word-break: break-word;
    }
    .ai-text.clamped {
      display: -webkit-box; -webkit-line-clamp: 3;
      -webkit-box-orient: vertical; overflow: hidden;
    }
    .expand-btn {
      display: inline-block; margin-top: 4px;
      border: none; background: none;
      color: var(--accent); font-size: 0.73rem;
      cursor: pointer; padding: 0; font-weight: 500;
      font-family: inherit;
    }
    .expand-btn:hover { text-decoration: underline; }

    /* ── Category groups ── */
    .cat-group {
      margin-bottom: 5px;
      border: 1px solid var(--border); border-radius: var(--radius);
      overflow: hidden;
    }
    .cat-group[open] { border-color: var(--border-hi); }
    .cat-header {
      display: flex; align-items: center; gap: 0.45rem;
      padding: 8px 13px;
      background: var(--surface); cursor: pointer; user-select: none;
      list-style: none; font-size: 0.80rem; font-weight: 600;
      color: var(--text-sub); transition: background 0.1s;
    }
    .cat-header::-webkit-details-marker, .cat-header::marker { display: none; }
    .cat-header:hover { background: var(--surface2); }
    .cat-count {
      margin-left: auto; background: var(--tag-bg);
      padding: 2px 8px; border-radius: var(--radius-pill);
      font-size: 0.67rem; color: var(--muted); font-weight: 500;
    }
    .cat-chevron { font-size: 0.58rem; color: var(--muted); transition: transform 0.18s; }
    details[open] > .cat-header .cat-chevron { transform: rotate(180deg); }
    .cat-body { padding: 6px; background: var(--bg); }
    .cat-body .card { margin-bottom: 5px; }
    .cat-body .card:last-child { margin-bottom: 0; }

    /* kbd */
    .kbd-hint {
      margin-left: 0.4rem; font-size: 0.63rem;
      color: var(--muted); font-weight: 400;
      letter-spacing: 0; text-transform: none;
    }
    kbd {
      background: var(--kbd-bg); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 0 4px;
      font-family: monospace; font-size: 0.66rem; color: var(--text-sub);
    }

    /* ── Responsive ── */
    @media (max-width: 640px) {
      .divider { top: 48px; }
      #stats { display: none; }
      .kbd-hint { display: none; }
      .search-wrap { max-width: 120px; }
    }

    /* ── Podcast panel ── */
    #podcast-panel { display: none; height: calc(100vh - 48px); overflow: hidden; }
    #pod-layout    { display: flex; height: 100%; }

    /* ── Sidebar ── */
    #pod-sidebar {
      width: 210px; flex-shrink: 0;
      border-right: 1px solid var(--border);
      overflow-y: auto; padding: 0.4rem 0;
      background: var(--surface);
    }
    #pod-list { flex: 1; overflow-y: auto; }

    .pod-sb-hdr {
      font-size: 0.62rem; font-weight: 600; color: var(--muted);
      text-transform: uppercase; letter-spacing: 0.07em;
      padding: 0.8rem 14px 0.3rem;
    }
    .pod-sb-divider { height: 1px; background: var(--border); margin: 4px 0; }
    .pod-sb-item {
      display: flex; align-items: center; gap: 9px;
      padding: 7px 12px; cursor: pointer;
      border-left: 2px solid transparent;
      transition: background 0.1s, border-color 0.1s;
    }
    .pod-sb-item:hover  { background: var(--bg); }
    .pod-sb-item.active { background: var(--accent-bg); border-left-color: var(--accent); }
    .pod-sb-art {
      width: 34px; height: 34px; border-radius: 50%;
      object-fit: cover; flex-shrink: 0;
    }
    .pod-sb-ph {
      width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
      background: var(--border); display: flex; align-items: center;
      justify-content: center; font-size: 0.85rem;
    }
    .pod-sb-info { flex: 1; min-width: 0; }
    .pod-sb-name {
      font-size: 0.74rem; font-weight: 500; color: var(--text-sub);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .pod-sb-item.has-today .pod-sb-name { color: var(--text); font-weight: 650; }
    .pod-today-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--sig-hi); flex-shrink: 0;
    }
    @media (max-width: 600px) {
      #pod-sidebar { width: 56px; }
      .pod-sb-name, .pod-sb-hdr, .pod-sb-divider { display: none; }
      .pod-sb-item { justify-content: center; padding: 8px 0; }
    }

    /* Timeline */
    .pod-timeline { max-width: 700px; margin: 0 auto; padding: 1.2rem 1.25rem 3rem; display: flex; flex-direction: column; gap: 1.4rem; }
    .pod-day-label { text-align: center; font-size: 0.70rem; color: var(--muted); padding: 0.4rem 0; letter-spacing: 0.06em; text-transform: uppercase; }
    .pod-status { text-align: center; padding: 2.5rem 0 1rem; color: var(--muted); font-size: 0.88rem; }
    .pod-show-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 0.5rem 0; }
    .pod-show-chip {
      display: flex; align-items: center; gap: 7px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-pill); padding: 5px 13px 5px 6px;
      cursor: pointer; font-size: 0.78rem; font-weight: 500; color: var(--text-sub);
      transition: border-color 0.12s, color 0.12s;
    }
    .pod-show-chip:hover { border-color: var(--accent); color: var(--accent); }
    .pod-chip-art { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }

    /* Bubble rows */
    .pod-bubble-row { display: flex; gap: 11px; align-items: flex-start; }
    .pod-avatar {
      width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
      cursor: pointer; border: 2px solid var(--border); transition: border-color 0.12s;
    }
    .pod-avatar:hover { border-color: var(--accent); }
    .pod-avatar-ph {
      width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0; cursor: pointer;
      background: var(--border); display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
    }
    .pod-bubble {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 0 12px 12px 12px; padding: 11px 15px;
      flex: 1; min-width: 0; transition: border-color 0.12s;
    }
    .pod-bubble:hover { border-color: var(--border-hi); }
    .pod-bubble-meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 5px; }
    .pod-bubble-show { font-size: 0.73rem; font-weight: 700; color: var(--text-sub); cursor: pointer; }
    .pod-bubble-show:hover { color: var(--accent); text-decoration: underline; }
    .pod-bubble-time { font-size: 0.68rem; color: var(--muted); }
    .pod-bubble-title a { font-size: 0.95rem; font-weight: 600; color: var(--text); text-decoration: none; line-height: 1.4; }
    .pod-bubble-title a:hover { color: var(--link); text-decoration: underline; }
    .pod-bubble-summary { font-size: 0.82rem; color: var(--text-sub); line-height: 1.6; margin-top: 5px; }

    /* Channel drill-down */
    .pod-channel-wrap { max-width: 700px; margin: 0 auto; padding: 0 1.25rem 3rem; }
    .pod-channel-hdr {
      display: flex; align-items: center; gap: 14px;
      padding: 1.1rem 0 1.3rem; border-bottom: 1px solid var(--border); margin-bottom: 1.3rem;
    }
    .pod-back {
      border: 1px solid var(--border); background: transparent; color: var(--muted);
      padding: 5px 12px; border-radius: var(--radius-pill); cursor: pointer;
      font-size: 0.77rem; font-family: inherit; flex-shrink: 0;
      transition: border-color 0.15s, color 0.15s;
    }
    .pod-back:hover { border-color: var(--accent); color: var(--accent); }
    .pod-chan-art { width: 54px; height: 54px; border-radius: 50%; object-fit: cover; border: 2px solid var(--border); flex-shrink: 0; }
    .pod-chan-name { font-size: 1.05rem; font-weight: 700; color: var(--text); }
    .pod-chan-cat  { font-size: 0.73rem; color: var(--muted); margin-top: 2px; }
    .pod-chan-eps  { display: flex; flex-direction: column; gap: 8px; }
    .pod-chan-ep {
      display: block; padding: 11px 15px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); text-decoration: none; color: inherit; transition: border-color 0.12s;
    }
    .pod-chan-ep:hover { border-color: var(--border-hi); }
    .pod-chan-ep-title { font-size: 0.92rem; font-weight: 600; color: var(--text); line-height: 1.4; }
    .pod-chan-ep:hover .pod-chan-ep-title { color: var(--link); }
    .pod-chan-ep-meta { font-size: 0.70rem; color: var(--muted); margin-top: 4px; display: flex; gap: 8px; }
    .pod-chan-ep-summary { font-size: 0.81rem; color: var(--text-sub); margin-top: 5px; line-height: 1.55; }
  </style>
</head>
<body>

<header>
  <div class="header-top">
    <span class="brand">Daily<span class="brand-sep">/</span>Brief</span>

    <div class="main-tabs">
      <button class="main-tab active" id="tab-news">📰 News</button>
      <button class="main-tab" id="tab-podcast">🎙️ Podcasts</button>
    </div>

    <button id="theme-toggle" title="Toggle theme">☀️</button>
  </div>

  <div id="news-controls">
    <div class="filter-group">
      <button class="filter-btn active" data-filter="all">All</button>
      <button class="filter-btn" data-filter="deal">Deals</button>
      <button class="filter-btn" data-filter="ai">AI</button>
      <button class="filter-btn" data-filter="macro">Macro</button>
      <button class="filter-btn" data-filter="deep">Deep</button>
    </div>

    <div class="search-wrap">
      <input type="search" id="search-input" class="search-input"
             placeholder="Search…" autocomplete="off" spellcheck="false" />
    </div>

    <div id="date-select-wrap">
      <label for="date-select">Date</label>
      <select id="date-select"><option>Loading…</option></select>
    </div>

    <div id="stats"></div>
  </div>
</header>

<div class="split-layout">
  <div class="panel-top" id="panel-top">
    <div class="panel-inner">
      <div class="panel-label" id="top-label">Top Signals</div>
      <div id="list-top"><div class="state-msg">Loading…</div></div>
    </div>
  </div>

  <div class="divider" id="divider-label">
    All Articles
    <span class="kbd-hint"><kbd>j</kbd><kbd>k</kbd> nav &nbsp;<kbd>o</kbd> open</span>
  </div>

  <div class="panel-rest" id="panel-rest">
    <div class="panel-inner">
      <div id="list-rest"></div>
    </div>
  </div>
</div>

<!-- ── Podcast panel (hidden by default) ── -->
<div id="podcast-panel">
  <div id="pod-layout">
    <nav id="pod-sidebar"></nav>
    <div id="pod-list"></div>
  </div>
</div>

<script>
// ── Theme ──────────────────────────────────────────────────────────────────────
(function() {
  const stored = localStorage.getItem('theme');
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const theme = stored || sys;
  document.documentElement.setAttribute('data-theme', theme);
  document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
})();

document.getElementById('theme-toggle').addEventListener('click', () => {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.getElementById('theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
});

// ── Global state ──────────────────────────────────────────────────────────────
const sel       = document.getElementById('date-select');
const stats     = document.getElementById('stats');
const listTop   = document.getElementById('list-top');
const listRest  = document.getElementById('list-rest');
const topLabel  = document.getElementById('top-label');
const divLabel  = document.getElementById('divider-label');
const searchInput = document.getElementById('search-input');

let currentFilter = 'all';   // 'all' | 'deal' | 'ai' | 'macro' | 'deep'
let currentSearch = '';
let currentData   = null;
let kbdIdx        = -1;

// Category display order
const CAT_ORDER = [
  "🤖 AI & 研究",
  "💼 并购 M&A",
  "📈 股权融资",
  "📊 宏观市场",
  "💻 泛科技",
  "📝 深度阅读",
  "💰 资本市场·其他",
  "🌐 社区",
  "📰 其他",
  // backward compat
  "💼 并购 & 交易", "💰 金融 & 创投",
  "🔧 开发 & 系统", "🛡️ 安全", "💻 科技产品",
];

const DEAL_CATS = new Set([
  "💼 并购 M&A", "📈 股权融资", "💰 资本市场·其他",
  "💼 并购 & 交易", "💰 金融 & 创投",
]);
const AI_CATS   = new Set(["🤖 AI & 研究"]);
const MACRO_CATS= new Set(["📊 宏观市场"]);
const DEEP_CATS = new Set(["📝 深度阅读", "🌐 社区"]);

const DEAL_RE  = /\\bipo\\b|s-1|f-1|acquisition|merger|acquires|buyout|series [a-e]\\b|funding round/i;
const AI_RE    = /\\bai\\b|\\bllm\\b|gpt-|claude|gemini|semiconductor|\\bchip\\b|nvidia|\\btsmc\\b|deepmind|openai/i;
const MACRO_RE = /\\bfed\\b|fomc|\\bcpi\\b|\\bppi\\b|inflation|tariff|rate cut|rate hike|treasury|nonfarm/i;

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function relativeTime(iso) {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1)  return 'just now';
    if (mins < 60) return mins + 'min ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24)  return hrs + 'h ago';
    const days = Math.round(hrs / 24);
    return days + 'd ago';
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

// Category → tag mapping (incl. backward compat)
const CAT_TAG = {
  "🤖 AI & 研究":     { label:'AI',      cls:'tag-ai'    },
  "💼 并购 M&A":      { label:'M&A',     cls:'tag-ma'    },
  "📈 股权融资":      { label:'Equity',  cls:'tag-ipo'   },
  "📊 宏观市场":      { label:'Macro',   cls:'tag-macro' },
  "💻 泛科技":        { label:'Tech',    cls:'tag-chip'  },
  "📝 深度阅读":      { label:'Essay',   cls:'tag-essay' },
  "💰 资本市场·其他": { label:'Capital', cls:'tag-fin'   },
  "🌐 社区":          { label:'Community',cls:'tag-dev'  },
  "💼 并购 & 交易":   { label:'M&A',     cls:'tag-ma'    },
  "💰 金融 & 创投":   { label:'Finance', cls:'tag-fin'   },
  "🔧 开发 & 系统":   { label:'Dev',     cls:'tag-dev'   },
  "🛡️ 安全":          { label:'Security',cls:'tag-sec'   },
  "💻 科技产品":      { label:'Tech',    cls:'tag-ai'    },
};

function extraTags(title) {
  const t = (title || '').toLowerCase();
  const tags = [];
  if (/\\bipo\\b|\\bs-1\\b|\\bf-1\\b/.test(t))                        tags.push({label:'IPO',     cls:'tag-ipo'  });
  if (/\\bllm\\b|\\bgpt\\b|claude|gemini|chatgpt/.test(t))             tags.push({label:'LLM',     cls:'tag-llm'  });
  if (/semiconductor|\\bchip\\b|nvidia|\\btsmc\\b/.test(t))            tags.push({label:'Chip',    cls:'tag-chip' });
  if (/\\bfed\\b|fomc|\\bcpi\\b|rate cut|rate hike/.test(t))           tags.push({label:'Macro',   cls:'tag-macro'});
  if (/series [a-e]\\b|funding round|raises \\$|raised \\$/.test(t))   tags.push({label:'Funding', cls:'tag-fund' });
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

// ── Card HTML ─────────────────────────────────────────────────────────────────
function cardHtml(a, idx) {
  const displayTitle = esc(a.titleEn ?? a.title);
  const sig  = signalBadge(a.score);
  const rtim = relativeTime(a.pubDate);
  const ftim = fullTime(a.pubDate);
  const tags = tagsHtml(a);
  const lock = a.paywalled ? \` <span class="lock-badge" title="Paywalled · title only">🔒</span>\` : '';
  const rankStr = String(a.rank).padStart(2, '0');

  const aiBlock = a.llmComment ? \`
    <div class="ai-comment">
      <span class="ai-label">AI</span>
      <div class="ai-text clamped">\${esc(a.llmComment)}</div>
      <button class="expand-btn" onclick="toggleAI(this)">Show more ▾</button>
    </div>\` : '';

  return \`<article class="card" data-idx="\${idx}" tabindex="-1">
  <div class="card-meta">
    <span class="rank">\${rankStr}</span>
    \${a.isHot ? '<span class="hot-badge">🔥</span>' : ''}
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
  \${a.summary ? \`<p class="card-summary">\${esc(a.summary)}\${a.summary.length >= 300 ? '…' : ''}</p>\` : ''}
  \${aiBlock}
</article>\`;
}

function toggleAI(btn) {
  const text = btn.previousElementSibling;
  const expanded = text.classList.toggle('clamped');
  btn.textContent = !expanded ? 'Show less ▴' : 'Show more ▾';
}

// ── Category groups ───────────────────────────────────────────────────────────
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
  const cards = articles.map(a => cardHtml(a, idx++)).join('');
  return \`<details class="cat-group">
  <summary class="cat-header">
    <span>\${esc(catName)}</span>
    <span class="cat-count">\${articles.length}</span>
    <span class="cat-chevron">▼</span>
  </summary>
  <div class="cat-body">\${cards}</div>
</details>\`;
}

function renderRestByCat(rest) {
  if (!rest.length) return '<div class="state-msg" style="padding:1.5rem 0">No more articles</div>';
  const groups = groupByCategory(rest);
  const html = [];
  let idx = 100;
  for (const cat of CAT_ORDER) {
    if (groups.has(cat)) { html.push(catGroupHtml(cat, groups.get(cat), idx)); idx += groups.get(cat).length; }
  }
  for (const [cat, arts] of groups) {
    if (!CAT_ORDER.includes(cat)) { html.push(catGroupHtml(cat, arts, idx)); idx += arts.length; }
  }
  return html.join('');
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function renderStats(articles) {
  if (!articles.length) { stats.innerHTML = ''; return; }
  const counts = {};
  for (const a of articles) { const c = a.category || '📰 其他'; counts[c] = (counts[c] || 0) + 1; }
  const chips = [
    { key: '🤖 AI & 研究', label: 'AI'   },
    { key: '💼 并购 M&A',  label: 'M&A'  },
    { key: '📈 股权融资',  label: 'Equity'},
    { key: '📊 宏观市场',  label: 'Macro' },
    { key: '💻 泛科技',    label: 'Tech'  },
  ].filter(c => counts[c.key])
   .map(c => \`<span class="stat-chip">\${c.label} \${counts[c.key]}</span>\`)
   .join('');
  stats.innerHTML = \`<span style="font-size:0.71rem;color:var(--muted)">\${articles.length} stories</span>\${chips}\`;
}

// ── Filter logic ──────────────────────────────────────────────────────────────
function getFilteredArticles(articles) {
  let filtered = articles;

  // 1. keyword search
  const q = currentSearch.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(a =>
      (a.titleEn ?? a.title ?? '').toLowerCase().includes(q) ||
      (a.titleZh ?? '').toLowerCase().includes(q)
    );
  }

  // 2. category filter
  switch (currentFilter) {
    case 'deal':
      filtered = filtered.filter(a => DEAL_CATS.has(a.category) || DEAL_RE.test(a.titleEn ?? a.title));
      break;
    case 'ai':
      filtered = filtered.filter(a => AI_CATS.has(a.category) || AI_RE.test(a.titleEn ?? a.title));
      break;
    case 'macro':
      filtered = filtered.filter(a => MACRO_CATS.has(a.category) || MACRO_RE.test(a.titleEn ?? a.title));
      break;
    case 'deep':
      filtered = filtered.filter(a => DEEP_CATS.has(a.category));
      break;
  }
  return filtered;
}

// ── Render ────────────────────────────────────────────────────────────────────
function applyFilter(data) {
  if (!data) return;
  const { meta, articles } = data;
  if (!articles?.length) {
    listTop.innerHTML  = '<div class="state-msg">No data for this date</div>';
    listRest.innerHTML = '';
    stats.innerHTML = '';
    return;
  }

  const topN     = meta?.topN ?? 5;
  const filtered = getFilteredArticles(articles);
  const top  = filtered.filter(a => a.rank <= topN);
  // Category section shows ALL filtered articles (including top-N),
  // so M&A / funding items in the top spotlight also appear under their category.
  const rest = filtered;

  // Update labels
  const filterLabels = { all: 'Top Signals', deal: 'Deals · Top Signals', ai: 'AI · Top Signals', macro: 'Macro · Top Signals', deep: 'Deep Reads' };
  topLabel.textContent = filterLabels[currentFilter] || 'Top Signals';

  const kbdSpan = divLabel.querySelector('.kbd-hint');
  const restLabelText = currentFilter === 'all'
    ? \`All Articles · \${filtered.length}\`
    : \`\${document.querySelector('.filter-btn.active')?.textContent ?? ''} · \${filtered.length}\`;
  divLabel.firstChild.textContent = restLabelText + ' ';
  if (kbdSpan && !divLabel.contains(kbdSpan)) divLabel.appendChild(kbdSpan);

  renderStats(filtered);
  listTop.innerHTML  = top.map((a, i) => cardHtml(a, i)).join('') || '<div class="state-msg">No signals for this filter</div>';
  listRest.innerHTML = renderRestByCat(rest);

  window.scrollTo({ top: 0, behavior: 'instant' });
  kbdIdx = -1;
}

function renderArticles(data) { currentData = data; applyFilter(data); }

// ── Filter buttons ────────────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    applyFilter(currentData);
  });
});

// ── Search ────────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  currentSearch = searchInput.value;
  applyFilter(currentData);
});
// Prevent j/k/o shortcuts when typing in search
searchInput.addEventListener('keydown', e => e.stopPropagation());

// ── Keyboard nav (j/k/o) ─────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target === searchInput) return;
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
  } else if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

function updateKbdFocus(cards) {
  cards.forEach(c => c.classList.remove('kbd-focus'));
  const target = cards[kbdIdx];
  if (!target) return;
  target.classList.add('kbd-focus');
  target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadDate(dateYmd) {
  listTop.innerHTML  = '<div class="state-msg">Loading…</div>';
  listRest.innerHTML = '';
  stats.innerHTML    = '';
  try {
    const r = await fetch(\`data/\${dateYmd}.json?t=\${Date.now()}\`);
    if (!r.ok) throw new Error();
    renderArticles(await r.json());
  } catch {
    listTop.innerHTML = \`<div class="state-msg">No data available for \${dateYmd}</div>\`;
  }
}

async function init() {
  try {
    const r = await fetch(\`data/dates.json?t=\${Date.now()}\`);
    if (!r.ok) throw new Error();
    const dates = await r.json();
    if (!dates.length) { listTop.innerHTML = '<div class="state-msg">No data yet</div>'; return; }
    sel.innerHTML = dates.map(d => \`<option value="\${d}">\${d}</option>\`).join('');
    sel.addEventListener('change', () => loadDate(sel.value));
    loadDate(dates[0]);
  } catch {
    listTop.innerHTML = '<div class="state-msg">Failed to load — please refresh</div>';
  }
}

// ── Podcast tab ───────────────────────────────────────────────────────────────
const tabNews      = document.getElementById('tab-news');
const tabPodcast   = document.getElementById('tab-podcast');
const podcastPanel = document.getElementById('podcast-panel');
const podSidebar   = document.getElementById('pod-sidebar');
const podList      = document.getElementById('pod-list');
const newsControls = document.getElementById('news-controls');
const newsBodyEls  = [document.querySelector('.split-layout')].filter(Boolean);

let podLoaded      = false;
let podMode        = false;
let podData        = null;      // { shows, episodes }
let activeSbId     = 'timeline'; // 'timeline' | showId

function todayLocalYmd() {
  const d = new Date();
  return d.getFullYear() + '-'
    + String(d.getMonth()+1).padStart(2,'0') + '-'
    + String(d.getDate()).padStart(2,'0');
}

function epLocalYmd(ep) {
  try {
    const d = new Date(ep.pubDate);
    return d.getFullYear() + '-'
      + String(d.getMonth()+1).padStart(2,'0') + '-'
      + String(d.getDate()).padStart(2,'0');
  } catch { return ''; }
}

function fmtDuration(s) {
  if (!s) return '';
  if (/^\\d+:\\d+/.test(s)) return s;
  const sec = parseInt(s, 10);
  if (isNaN(sec)) return s;
  const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), ss = sec%60;
  return h ? \`\${h}:\${String(m).padStart(2,'0')}:\${String(ss).padStart(2,'0')}\`
           : \`\${m}:\${String(ss).padStart(2,'0')}\`;
}

function fmtPodDate(iso) {
  try { return new Date(iso).toLocaleString('zh-CN', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}); }
  catch { return ''; }
}

function bubbleHtml(ep, shows) {
  const show = shows.find(s => s.id === ep.showId) ?? {};
  const art  = show.art;
  const avt  = art
    ? \`<img class="pod-avatar" src="\${art}" alt="" data-show="\${ep.showId}" loading="lazy">\`
    : \`<div class="pod-avatar-ph" data-show="\${ep.showId}">🎙️</div>\`;
  const meta = ep.pubDate ? fmtPodDate(ep.pubDate) : '';
  const dur  = ep.duration ? ' · ⏱ ' + fmtDuration(ep.duration) : '';
  return '<div class="pod-bubble-row">'
    + avt
    + '<div class="pod-bubble">'
    + '<div class="pod-bubble-meta">'
    + \`<span class="pod-bubble-show" data-show="\${ep.showId}">\${ep.showName}</span>\`
    + \`<span class="pod-bubble-time">\${meta}\${dur}</span>\`
    + '</div>'
    + \`<div class="pod-bubble-title"><a href="\${ep.link}" target="_blank" rel="noopener">\${ep.title}</a></div>\`
    + (ep.summary ? \`<div class="pod-bubble-summary">\${ep.summary}</div>\` : '')
    + '</div></div>';
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
function updateSidebarActive() {
  if (!podSidebar) return;
  podSidebar.querySelectorAll('.pod-sb-item').forEach(el => {
    const elId = el.dataset.show ?? (el.id === 'pod-sb-today' ? 'timeline' : null);
    el.classList.toggle('active', elId === activeSbId);
  });
}

function renderSidebar(todayShowIds) {
  if (!podSidebar) return;
  const { shows } = podData;
  const todayCount = todayShowIds.size;

  // Sort: today's first (by name), then rest (by name)
  const sorted = [...shows].sort((a, b) => {
    const at = todayShowIds.has(a.id) ? 0 : 1;
    const bt = todayShowIds.has(b.id) ? 0 : 1;
    return at - bt || a.name.localeCompare(b.name);
  });

  const todayItem = '<div class="pod-sb-item" id="pod-sb-today">'
    + '<div class="pod-sb-ph">📋</div>'
    + '<div class="pod-sb-info"><div class="pod-sb-name">今日更新</div></div>'
    + (todayCount ? '<span class="pod-today-dot"></span>' : '')
    + '</div>';

  const showItems = sorted.map(s => {
    const hasToday = todayShowIds.has(s.id);
    const img = s.art
      ? \`<img class="pod-sb-art" src="\${s.art}" loading="lazy" alt="">\`
      : '<div class="pod-sb-ph">🎙️</div>';
    return \`<div class="pod-sb-item\${hasToday ? ' has-today' : ''}" data-show="\${s.id}">\`
      + img
      + \`<div class="pod-sb-info"><div class="pod-sb-name">\${s.name}</div></div>\`
      + (hasToday ? '<span class="pod-today-dot"></span>' : '')
      + '</div>';
  }).join('');

  podSidebar.innerHTML = todayItem
    + '<div class="pod-sb-divider"></div>'
    + (todayCount ? '<div class="pod-sb-hdr">今日有更新</div>' : '<div class="pod-sb-hdr">所有节目</div>')
    + showItems;

  podSidebar.querySelector('#pod-sb-today')?.addEventListener('click', () => {
    activeSbId = 'timeline';
    updateSidebarActive();
    renderTimeline(/* fromSidebar */ true);
  });
  podSidebar.querySelectorAll('[data-show]').forEach(el => {
    el.addEventListener('click', () => {
      activeSbId = el.dataset.show;
      updateSidebarActive();
      renderChannel(el.dataset.show, /* fromSidebar */ true);
    });
  });
  updateSidebarActive();
}

// ── Main + Channel views ───────────────────────────────────────────────────────
function renderTimeline(fromSidebar) {
  activeSbId = 'timeline';
  if (!fromSidebar) updateSidebarActive();

  const { shows, episodes } = podData;
  const today    = todayLocalYmd();
  const todayEps = episodes.filter(ep => epLocalYmd(ep) === today);

  if (!todayEps.length) {
    podList.innerHTML = '<div class="pod-timeline">'
      + '<div class="pod-status">今日暂无新节目 — 点击左侧频道查看历史</div>'
      + '</div>';
  } else {
    podList.innerHTML = '<div class="pod-timeline">'
      + \`<div class="pod-day-label">今日更新 · \${today}</div>\`
      + todayEps.map(ep => bubbleHtml(ep, shows)).join('')
      + '</div>';
    bindAvatarClicks();
  }
}

function renderChannel(showId, fromSidebar) {
  activeSbId = showId;
  if (!fromSidebar) updateSidebarActive();

  const { shows, episodes } = podData;
  const show = shows.find(s => s.id === showId);
  if (!show) return;
  const eps = episodes.filter(ep => ep.showId === showId);
  const artHtml = show.art
    ? \`<img class="pod-chan-art" src="\${show.art}" alt="">\`
    : '<div class="pod-chan-art" style="background:var(--border);display:flex;align-items:center;justify-content:center;font-size:1.3rem">🎙️</div>';
  podList.innerHTML = '<div class="pod-channel-wrap">'
    + '<div class="pod-channel-hdr">'
    + artHtml
    + \`<div><div class="pod-chan-name">\${show.name}</div><div class="pod-chan-cat">\${show.category ?? ''}</div></div>\`
    + '</div>'
    + '<div class="pod-chan-eps">'
    + eps.map(ep =>
        \`<a class="pod-chan-ep" href="\${ep.link}" target="_blank" rel="noopener">\`
        + \`<div class="pod-chan-ep-title">\${ep.title}</div>\`
        + \`<div class="pod-chan-ep-meta">\${ep.pubDate ? fmtPodDate(ep.pubDate) : ''}\${ep.duration ? ' · ⏱ ' + fmtDuration(ep.duration) : ''}</div>\`
        + (ep.summary ? \`<div class="pod-chan-ep-summary">\${ep.summary}</div>\` : '')
        + '</a>'
      ).join('')
    + '</div></div>';
}

function bindAvatarClicks() {
  podList.querySelectorAll('[data-show]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); renderChannel(el.dataset.show); });
  });
}

async function loadPodcasts() {
  podList.innerHTML = '<div class="pod-timeline"><div class="pod-status">Loading…</div></div>';
  try {
    const r = await fetch(\`data/podcasts.json?t=\${Date.now()}\`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    podData = await r.json();
    if (!podData.shows) podData.shows = [];
    podLoaded = true;
    const today = todayLocalYmd();
    const todayShowIds = new Set(podData.episodes.filter(ep => epLocalYmd(ep) === today).map(ep => ep.showId));
    renderSidebar(todayShowIds);
    renderTimeline(true);
  } catch (e) {
    podList.innerHTML = \`<div class="pod-timeline"><div class="pod-status">加载失败 — \${e.message}</div></div>\`;
  }
}

function enterPodcastMode() {
  podMode = true;
  tabNews.classList.remove('active');
  tabPodcast.classList.add('active');
  podcastPanel.style.display = 'block';
  if (newsControls) newsControls.style.display = 'none';
  newsBodyEls.forEach(el => { el.style.display = 'none'; });
  if (!podLoaded) loadPodcasts();
}

function exitPodcastMode() {
  podMode = false;
  tabPodcast.classList.remove('active');
  tabNews.classList.add('active');
  podcastPanel.style.display = 'none';
  if (newsControls) newsControls.style.display = '';
  newsBodyEls.forEach(el => { el.style.display = ''; });
}

tabNews.addEventListener('click', () => { if (podMode) exitPodcastMode(); });
tabPodcast.addEventListener('click', () => { if (!podMode) enterPodcastMode(); });

init();
</script>
</body>
</html>`;
}
