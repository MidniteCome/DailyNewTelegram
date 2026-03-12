/**
 * run.mjs — 主入口
 *
 * 流程：
 *   1. 读取 sources.json
 *   2. 抓取所有 RSS 源
 *   3. 打分、排序
 *   4. (可选) LLM 点评 Top N
 *   5. 推送 Top N 到 Telegram
 *   6. 生成静态网站 docs/
 *   7. 标记已发送 (.last_sent.json)，git commit + push
 */

import fs from "node:fs/promises";
import { execSync } from "node:child_process";
import { enrichWithFullText } from "./fetch.mjs";
import { ingestAll } from "./pipeline/ingest.mjs";
import { rankArticles } from "./score.mjs";
import { pushToTelegram } from "./telegram.mjs";
import { summarize, translateTitles } from "./llm.mjs";
import { generateSite } from "./site.mjs";

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 返回今天 UTC 日期字符串，如 "2026-02-23" */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

const SEEN_LINKS_CAP  = 2000; // 最多保留最近 2000 条历史 URL
const TITLE_CACHE_CAP = 5000; // 翻译缓存上限
const TITLE_CACHE_PATH = ".title_cache.json";

async function readTitleCache() {
  try {
    return JSON.parse(await fs.readFile(TITLE_CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function writeTitleCache(cache) {
  let entries = Object.entries(cache);
  if (entries.length > TITLE_CACHE_CAP) {
    entries = entries.slice(entries.length - TITLE_CACHE_CAP);
  }
  await fs.writeFile(
    TITLE_CACHE_PATH,
    JSON.stringify(Object.fromEntries(entries), null, 2) + "\n",
    "utf8"
  );
}

// ─── Feed 健康日志 ────────────────────────────────────────────────────────────
const FEED_HEALTH_PATH = ".feed-health.json";

async function readFeedHealth() {
  try {
    const raw = JSON.parse(await fs.readFile(FEED_HEALTH_PATH, "utf8"));
    // 返回 name → record 的 Map
    return new Map((raw.feeds ?? []).map(f => [f.name, f]));
  } catch {
    return new Map();
  }
}

async function writeFeedHealth(healthRecords, dateYmd) {
  await fs.writeFile(
    FEED_HEALTH_PATH,
    JSON.stringify({ lastRun: dateYmd, feeds: healthRecords }, null, 2) + "\n",
    "utf8"
  );
}

async function readState() {
  try {
    const raw = await fs.readFile(".last_sent.json", "utf8");
    const obj = JSON.parse(raw);
    return {
      lastSent:  obj.lastSent  ?? null,
      seenLinks: new Set(Array.isArray(obj.seenLinks) ? obj.seenLinks : []),
    };
  } catch {
    return { lastSent: null, seenLinks: new Set() };
  }
}

async function writeState(dateYmd, seenLinks) {
  // 超出上限时，丢弃最旧的（Set 迭代顺序即插入顺序）
  let arr = [...seenLinks];
  if (arr.length > SEEN_LINKS_CAP) arr = arr.slice(arr.length - SEEN_LINKS_CAP);
  await fs.writeFile(
    ".last_sent.json",
    JSON.stringify({ lastSent: dateYmd, seenLinks: arr }, null, 2) + "\n",
    "utf8"
  );
}

function gitCommitAndPush(dateYmd) {
  try {
    const diff = execSync("git status --porcelain").toString().trim();
    if (!diff) {
      console.log("  (git) 无变更，跳过 commit");
      return;
    }
    execSync('git config user.name "github-actions[bot]"');
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');
    execSync("git add .last_sent.json .feed-health.json docs/");
    execSync(`git commit -m "news: ${dateYmd}"`);
    // SKIP_GIT_PUSH=true 时只 commit，不 push（由外部统一 push，避免触发多次 pages 部署）
    if (process.env.SKIP_GIT_PUSH === "true") {
      console.log("  ✓ git commit 完成（push 由外部统一执行）");
    } else {
      execSync("git push");
      console.log("  ✓ git commit + push 完成");
    }
  } catch (e) {
    console.warn("  git 操作跳过或失败:", e?.message ?? e);
  }
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n════════════════════════════════════════");
  console.log("  DailyNewTelegram v2  —  运行开始");
  console.log("════════════════════════════════════════\n");

  // 读取配置
  const cfg = JSON.parse(await fs.readFile("sources.json", "utf8"));
  const sources = cfg.sources ?? [];
  const scoring = cfg.scoring ?? {};
  const topN = scoring.topN ?? 5;

  const today = todayUtc();
  const siteUrl = process.env.SITE_URL ?? null;
  const force = process.argv.includes("--force");

  // 读取历史状态（上次运行日期 + 已见过的文章 URL）
  const state = await readState();

  // 防重复：同一天最多发一次（--force 可跳过）
  if (state.lastSent === today && !force) {
    console.log(`今天 (${today}) 已发送过，退出。`);
    console.log(`如需强制重新运行，请加 --force 参数：`);
    console.log(`  ./run-local.sh --force`);
    return;
  }
  if (force) console.log("⚡ --force 模式，跳过今日重复检查\n");

  // ── Step 1: 抓取（多源入口，默认仅 RSS）──────────────────────────────────
  console.log(`📡 抓取 ${sources.length} 个 RSS 源…`);
  const prevHealth = await readFeedHealth();
  const enableWechat = process.env.ENABLE_WECHAT === "true";
  const enableEmail = process.env.ENABLE_EMAIL === "true";
  const { articles, health } = await ingestAll({
    rssSources: sources,
    maxItemsPerFeed: scoring.maxItemsPerFeed ?? 30,
    prevHealth,
    enableWechat,
    enableEmail,
  });
  await writeFeedHealth(health, today);
  const failCount = health.filter(h => !h.ok && !h.skipped).length;
  if (failCount > 0) console.log(`   ⚠️  ${failCount} 个源本次失败（详见 .feed-health.json）`);
  console.log(`   共抓取 ${articles.length} 篇文章`);

  // 跨日去重：过滤历史已见过的文章。
  // 例外：最新发布日期（latestDate）当天的文章始终参与，确保重跑/强制跑时不会全空。
  const latestDate = articles.length
    ? new Date(Math.max(...articles.map(a => a.pubDate))).toISOString().slice(0, 10)
    : today;

  const freshArticles = articles.filter(a => {
    if (!state.seenLinks.has(a.link)) return true;          // 从未见过，正常纳入
    const pubDay = a.pubDate.toISOString().slice(0, 10);
    return pubDay === latestDate;                            // 最新日期的文章始终参与
  });

  const dupCount = articles.length - freshArticles.length;
  if (dupCount > 0) console.log(`   ⏭  过滤历史重复 ${dupCount} 篇（保留最新日期 ${latestDate} 全部），剩余 ${freshArticles.length} 篇`);
  console.log();

  if (freshArticles.length === 0) {
    console.log("没有新文章（全为历史重复），退出。");
    return;
  }

  // ── Step 1b: 全文抓取（增强关键词评分） ────────────────────────────────────
  console.log("📄 全文抓取（增强评分）…");
  const enrichedArticles = await enrichWithFullText(freshArticles);
  console.log();

  // ── Step 2: 打分排序 ──────────────────────────────────────────────────────
  console.log("📊 打分与排序…");
  const ranked = rankArticles(enrichedArticles, sources, scoring);
  console.log(`   排序完成，共 ${ranked.length} 篇\n`);

  // ── Step 3: LLM 翻译 + 点评（可选）──────────────────────────────────────
  // 无论是否开启 LLM，先从缓存填充已有译文（带校验，防止脏数据注入）
  const titleCache = await readTitleCache();
  let cacheHits = 0;
  for (const a of ranked) {
    const cachedZh = titleCache[a.link];
    const cachedEn = titleCache[a.link + "__en"];
    // 校验：titleZh 必须含中文字符，titleEn 不能含中文字符
    if (cachedZh && /[\u4e00-\u9fff]/.test(cachedZh)) { a.titleZh = cachedZh; cacheHits++; }
    if (cachedEn && !/[\u4e00-\u9fff]/.test(cachedEn)) { a.titleEn = cachedEn; }
  }
  if (cacheHits > 0) console.log(`📖 从翻译缓存命中 ${cacheHits} 篇\n`);

  // ── Step 4a: 合并今日历史文章（确保 Telegram 与网站 Top-N 一致）────────────
  // 注意：必须在 LLM 翻译和 Telegram 推送之前合并，
  // 这样 topArticles 来自全天累积排序，而非仅当次抓取结果。
  let siteArticles = ranked;
  const todayJsonPath = `docs/data/${today}.json`;
  try {
    const prevPayload = JSON.parse(await fs.readFile(todayJsonPath, "utf8"));
    const prevArts = (prevPayload.articles ?? []).map(a => ({
      title:      a.title,
      link:       a.link,
      sourceName: a.source,          // JSON 里存的字段名是 source
      summary:    a.summary   ?? "",
      llmComment: a.llmComment ?? null,
      pubDate:    new Date(a.pubDate),
      score:      a.score,
      category:   a.category,
      // 校验旧存档中的 titleEn/titleZh，防止历史脏数据被重新载入
      titleEn:    (a.titleEn && !/[\u4e00-\u9fff]/.test(a.titleEn)) ? a.titleEn : null,
      titleZh:    (a.titleZh && /[\u4e00-\u9fff]/.test(a.titleZh))  ? a.titleZh : null,
      isHot:      a.isHot     ?? false,
      paywalled:  a.paywalled ?? false,
    }));
    const newLinks = new Set(ranked.map(a => a.link));
    const onlyPrev = prevArts.filter(a => !newLinks.has(a.link));
    if (onlyPrev.length > 0) {
      siteArticles = [...ranked, ...onlyPrev].sort((a, b) => b.score - a.score);
      console.log(`  📦 合并今日历史 ${onlyPrev.length} 篇 → 网站共展示 ${siteArticles.length} 篇`);
    }
  } catch {
    // 首次运行或文件不存在，直接使用当前 ranked
  }

  // Top-N 从合并后的 siteArticles 中取，确保与网站一致
  const topArticles = siteArticles.slice(0, topN);

  if (process.env.USE_LLM === "true") {
    // 3a. 只处理缓存中没有中文译文的文章（含合并后的 siteArticles）
    const needTranslate = siteArticles.filter(a => !a.titleZh);
    if (needTranslate.length > 0) {
      await translateTitles(needTranslate);
      // 写入中文译文和改写英文标题到缓存
      for (const a of needTranslate) {
        if (a.titleZh) titleCache[a.link]          = a.titleZh;
        if (a.titleEn) titleCache[a.link + "__en"] = a.titleEn;
      }
      await writeTitleCache(titleCache);
    } else {
      console.log("📖 全部标题已有缓存，跳过翻译\n");
    }

    // 3b. 对 Top N 逐篇生成深度点评（后端截断 ≤400 中文字符，前端有展开按钮）
    console.log("🤖 LLM 点评 Top 文章…");
    for (const article of topArticles) {
      const raw = await summarize(article);
      if (raw && raw.length > 400) {
        // 在最后一个句号/！/？处截断，避免截断到句中
        const cut = raw.slice(0, 400);
        const lastPunct = Math.max(cut.lastIndexOf("。"), cut.lastIndexOf("！"), cut.lastIndexOf("？"));
        article.llmComment = lastPunct > 200 ? cut.slice(0, lastPunct + 1) : cut;
      } else {
        article.llmComment = raw;
      }
    }
    console.log();
  }

  // ── Step 4b: Telegram 推送（与网站同源的 Top-N）──────────────────────────
  console.log(`📨 推送 Top ${topN} 到 Telegram…`);
  await pushToTelegram(topArticles, today, siteUrl);
  console.log();

  // ── Step 5: 生成网站 ──────────────────────────────────────────────────────
  console.log("🌐 生成静态网站…");
  await generateSite(siteArticles, today, topN);
  console.log();

  // ── Step 6: 更新历史状态 + git push ──────────────────────────────────────
  // 把本次所有新文章 URL 加入历史，防止未来重复
  for (const a of ranked) state.seenLinks.add(a.link);
  await writeState(today, state.seenLinks);
  gitCommitAndPush(today);

  console.log("\n✅ 全部完成！\n");
}

main().catch((err) => {
  console.error("\n❌ 运行失败:", err);
  process.exit(1);
});
