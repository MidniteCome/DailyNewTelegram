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
import { fetchAllFeeds } from "./fetch.mjs";
import { rankArticles } from "./score.mjs";
import { pushToTelegram } from "./telegram.mjs";
import { summarize, translateTitles } from "./llm.mjs";
import { generateSite } from "./site.mjs";

// ─── 工具函数 ─────────────────────────────────────────────────────────────────

/** 返回今天 UTC 日期字符串，如 "2026-02-23" */
function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

const SEEN_LINKS_CAP = 2000; // 最多保留最近 2000 条历史 URL

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
    execSync("git add .last_sent.json docs/");
    execSync(`git commit -m "news: ${dateYmd}"`);
    execSync("git push");
    console.log("  ✓ git commit + push 完成");
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

  // ── Step 1: 抓取 ──────────────────────────────────────────────────────────
  console.log(`📡 抓取 ${sources.length} 个 RSS 源…`);
  const articles = await fetchAllFeeds(sources, scoring.maxItemsPerFeed ?? 30);
  console.log(`   共抓取 ${articles.length} 篇文章`);

  // 跨日去重：过滤掉历史已见过的文章
  const freshArticles = articles.filter(a => !state.seenLinks.has(a.link));
  const dupCount = articles.length - freshArticles.length;
  if (dupCount > 0) console.log(`   ⏭  过滤历史重复 ${dupCount} 篇，剩余 ${freshArticles.length} 篇`);
  console.log();

  if (freshArticles.length === 0) {
    console.log("没有新文章（全为历史重复），退出。");
    return;
  }

  // ── Step 2: 打分排序 ──────────────────────────────────────────────────────
  console.log("📊 打分与排序…");
  const ranked = rankArticles(freshArticles, sources, scoring);
  console.log(`   排序完成，共 ${ranked.length} 篇\n`);

  const topArticles = ranked.slice(0, topN);

  // ── Step 3: LLM 翻译 + 点评（可选）──────────────────────────────────────
  if (process.env.USE_LLM === "true") {
    // 3a. 批量翻译所有文章标题为中文（一次调用）
    await translateTitles(ranked);
    console.log();

    // 3b. 对 Top N 逐篇生成深度点评
    console.log("🤖 LLM 点评 Top 文章…");
    for (const article of topArticles) {
      article.llmComment = await summarize(article);
    }
    console.log();
  }

  // ── Step 4: Telegram 推送 ─────────────────────────────────────────────────
  console.log(`📨 推送 Top ${topN} 到 Telegram…`);
  await pushToTelegram(topArticles, today, siteUrl);
  console.log();

  // ── Step 5: 生成网站 ──────────────────────────────────────────────────────
  console.log("🌐 生成静态网站…");
  await generateSite(ranked, today, topN);
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
