/**
 * podcast.mjs — Podcast 更新模块
 *
 * 读取 podcasts.json，拉取各节目 RSS feed，
 * 将每个节目最新 N 集写入 docs/data/podcasts.json，
 * 再 git commit + push（用于 GitHub Actions）。
 *
 * 独立于新闻 pipeline 运行，不影响 Telegram 推送。
 *
 * 使用：node scripts/podcast.mjs
 */

import fs   from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { generateIndexHtml } from "./site.mjs";

const DATA_DIR   = "docs/data";
const OUTPUT     = path.join(DATA_DIR, "podcasts.json");
const CFG_PATH   = "podcasts.json";

// ─── 极简 XML 工具（无外部依赖）─────────────────────────────────────────────

/** 解包 CDATA */
function cdataUnwrap(s) {
  return (s ?? "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

/** 取首个 <tag>…</tag> 内容 */
function tagText(block, tag) {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m  = block.match(re);
  return m ? cdataUnwrap(m[1]) : null;
}

/** 取标签属性值 */
function tagAttr(block, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]*)"`, "i");
  const m  = block.match(re);
  return m ? m[1] : null;
}

/** 粗略清除 HTML 标签、HTML 实体 */
function stripHtml(s) {
  return (s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#?\w+;/g, "")
    .replace(/\s+/g, " ").trim();
}

/**
 * 解析 RSS XML，提取节目封面 + 最新 N 集
 * @returns {{ showArt: string|null, items: Array }}
 */
function parseRSS(xml, maxEp) {
  // 节目封面：<itunes:image href="..."> 或 <image><url>...</url></image>
  const chanBlock = xml.match(/<channel>([\s\S]*?)<item>/)?.[1] ?? "";
  const showArt   = tagAttr(chanBlock, "itunes:image", "href")
    ?? tagText(chanBlock.match(/<image>([\s\S]*?)<\/image>/)?.[1] ?? "", "url");

  // 提取 <item> 块
  const items   = [];
  const itemRe  = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null && items.length < maxEp) {
    const b = m[1];

    const title  = stripHtml(tagText(b, "title") ?? "");
    const pubRaw = tagText(b, "pubDate") ?? tagText(b, "dc:date");
    if (!title || !pubRaw) continue;

    let pubDate;
    try { pubDate = new Date(pubRaw).toISOString(); }
    catch { continue; }

    // 链接：优先用 <link>，其次 enclosure url（音频直链）
    const link = tagText(b, "link")
      ?? tagAttr(b, "enclosure", "url")
      ?? tagAttr(b, "media:content", "url")
      ?? "";

    // 时长
    const duration = tagText(b, "itunes:duration")?.trim() ?? null;

    // 简介：取较长的那个，截断至 200 字符
    const rawDesc = tagText(b, "description") ?? tagText(b, "itunes:summary") ?? "";
    const summary = stripHtml(rawDesc).slice(0, 200);

    // 单集封面（优先于节目封面）
    const epArt = tagAttr(b, "itunes:image", "href") ?? showArt;

    items.push({ title, link, pubDate, duration, summary, art: epArt ?? null });
  }
  return { showArt: showArt ?? null, items };
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🎙️  Podcast 更新开始");
  console.log("══════════════════════════════\n");

  const cfg    = JSON.parse(await fs.readFile(CFG_PATH, "utf8"));
  const maxEp  = cfg.maxEpisodesPerShow ?? 3;
  const sources = (cfg.podcasts ?? []).filter(p => p.rss && !p.disabled);

  await fs.mkdir(DATA_DIR, { recursive: true });

  const allEpisodes = [];
  const allShows    = [];
  const health      = [];

  for (const pod of sources) {
    // 无论 RSS 是否成功，先把节目加入 shows（保证侧边栏始终可见）
    const showEntry = {
      id:       pod.id,
      name:     pod.name,
      category: pod.category ?? "general",
      art:      null,
      link:     pod.rss,
    };
    allShows.push(showEntry);

    // 尝试主 RSS，失败时若有 appleId 则从 iTunes API 获取真实 feedUrl 再试一次
    let ok = false;
    const attempts = [{ url: pod.rss, label: "" }];

    for (const { url, label } of attempts) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept":     "application/rss+xml, application/xml, text/xml, */*",
          },
          signal: AbortSignal.timeout(25_000),
          redirect: "follow",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();

        const { showArt, items } = parseRSS(xml, maxEp);
        const chanBlock = xml.match(/<channel>([\s\S]*?)<item>/)?.[1] ?? "";
        const showLink  = tagText(chanBlock, "link") ?? url;

        // 用真实数据更新 showEntry
        showEntry.art  = showArt ?? null;
        showEntry.link = showLink;

        for (const ep of items) {
          allEpisodes.push({
            showId:   pod.id,
            showName: pod.name,
            category: pod.category ?? "general",
            ...ep,
          });
        }

        console.log(`  ✓ ${pod.name.padEnd(22)} ${items.length} 集${label}`);
        health.push({ id: pod.id, name: pod.name, ok: true, count: items.length });
        ok = true;
        break;

      } catch (err) {
        if (label === "" && pod.appleId) {
          // 主 RSS 失败 → 从 iTunes API 取真实 feedUrl，加入下一轮尝试
          console.warn(`  ↷ ${pod.name.padEnd(22)} 主源失败(${err.message})，尝试 iTunes 兜底…`);
          try {
            const lookup = await fetch(
              `https://itunes.apple.com/lookup?id=${pod.appleId}&entity=podcast`,
              { signal: AbortSignal.timeout(10_000), headers: { "User-Agent": "iTunes/12.0" } }
            );
            const data = await lookup.json();
            const feedUrl = data.results?.[0]?.feedUrl;
            if (feedUrl && feedUrl !== url) {
              attempts.push({ url: feedUrl, label: " (iTunes兜底)" });
            } else {
              throw new Error("iTunes 未返回有效 feedUrl");
            }
          } catch (e2) {
            console.warn(`     iTunes 查询失败: ${e2.message}`);
          }
        } else {
          console.warn(`  ✗ ${pod.name.padEnd(22)} ${err.message}`);
        }
      }
    }

    if (!ok) {
      health.push({ id: pod.id, name: pod.name, ok: false, error: "所有源均失败" });
    }
  }

  // 按发布日期降序排列（最新在前）
  allEpisodes.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const output = {
    meta: {
      updatedAt:     new Date().toISOString(),
      totalEpisodes: allEpisodes.length,
      health,
    },
    shows:    allShows,
    episodes: allEpisodes,
  };

  await fs.writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(`\n✓ 写入 ${OUTPUT}（共 ${allEpisodes.length} 集）`);

  // 同步更新 index.html（保持 SPA 模板最新）
  await generateIndexHtml();

  // 失败汇总
  const failed = health.filter(h => !h.ok);
  if (failed.length) {
    console.warn(`\n⚠️  ${failed.length} 个 feed 失败:`);
    for (const f of failed) console.warn(`   ${f.name}: ${f.error}`);
    console.warn(`   → 请检查 podcasts.json 中对应的 "rss" 地址`);
  }

  // ── Git commit + push（GitHub Actions 环境）──────────────────────────────
  try {
    const diff = execSync("git status --porcelain").toString().trim();
    if (!diff) { console.log("\n(git) 无变更，跳过 commit"); return; }
    execSync('git config user.name  "github-actions[bot]"');
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');
    execSync(`git add "${OUTPUT}" docs/index.html`);
    execSync(`git commit -m "podcast: ${new Date().toISOString().slice(0, 10)}"`);
    // SKIP_GIT_PUSH=true 时只 commit，不 push（由外部统一 push，避免触发多次 pages 部署）
    if (process.env.SKIP_GIT_PUSH === "true") {
      console.log("  ✓ git commit 完成（push 由外部统一执行）");
    } else {
      execSync("git push");
      console.log("  ✓ git push 完成");
    }
  } catch (e) {
    console.warn("  git 跳过或失败:", e?.message ?? e);
  }

  console.log("\n✅ Podcast 更新完成\n");
}

main().catch(err => {
  console.error("\n❌ Podcast 更新失败:", err);
  process.exit(1);
});
