import fs from "node:fs/promises";
import { execSync } from "node:child_process";
import { classifyItem } from "./classify.mjs";

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.TG_CHAT_ID; // e.g. "@your_channel"
const TZ = "Europe/London";
const HTTP_USER_AGENT =
  process.env.HTTP_USER_AGENT ??
  "DailyNewTelegram/1.0 (https://github.com/williamchoi/DailyNewTelegram; contact: maintainer@example.com)";

if (!BOT_TOKEN || !CHAT_ID) {
  throw new Error("Missing BOT_TOKEN or TG_CHAT_ID env vars.");
}

const cfg = JSON.parse(await fs.readFile("sources.json", "utf8"));
const SENT_FILE = ".last_sent.json";

function londonYmd(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date); // YYYY-MM-DD
}

function yesterdayYmdLondon() {
  const now = new Date();
  // 用“现在时间 - 24h”取昨天日期，再按伦敦时区格式化（日报够用且稳定）
  return londonYmd(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

function escapeHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": HTTP_USER_AGENT,
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

// Minimal RSS/Atom parser: title/link/pubDate
function parseFeed(xml, feedUrl) {
  const items = [];
  const isAtom = xml.includes("<feed") && xml.includes("</feed>");
  if (isAtom) {
    const entries = xml.split("<entry").slice(1).map((s) => "<entry" + s);
    for (const e of entries) {
      const title = (e.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
      const link =
        (e.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i)?.[1] ??
          e.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ??
          "").trim();
      const updated =
        (e.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] ??
          e.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] ??
          "").trim();
      const pubDate = updated ? new Date(updated) : null;
      if (title && link && pubDate && !Number.isNaN(pubDate.getTime())) {
        items.push({ title, link, pubDate, feedUrl });
      }
    }
  } else {
    const entries = xml.split("<item").slice(1).map((s) => "<item" + s);
    for (const e of entries) {
      const title = (e.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
      const link = (e.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? "").trim();
      const pd =
        (e.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ??
          e.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i)?.[1] ??
          "").trim();
      const pubDate = pd ? new Date(pd) : null;
      if (title && link && pubDate && !Number.isNaN(pubDate.getTime())) {
        items.push({ title, link, pubDate, feedUrl });
      }
    }
  }
  return items;
}

function chunkByLimit(text, limit = 3800) {
  const chunks = [];
  let cur = "";
  for (const line of text.split("\n")) {
    if ((cur + "\n" + line).length > limit) {
      chunks.push(cur);
      cur = line;
    } else {
      cur = cur ? cur + "\n" + line : line;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function sendTelegram(htmlText) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: htmlText,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
}

async function readLastSent() {
  try {
    const raw = await fs.readFile(SENT_FILE, "utf8");
    const obj = JSON.parse(raw);
    return obj?.lastSent ?? null;
  } catch {
    return null;
  }
}

async function writeLastSent(dateYmd) {
  await fs.writeFile(SENT_FILE, JSON.stringify({ lastSent: dateYmd }, null, 2) + "\n", "utf8");
}

function gitCommitIfChanged(dateYmd) {
  // 如果仓库是只读/没有改动，就别报错
  try {
    execSync("git status --porcelain", { stdio: "pipe" });
    const diff = execSync("git status --porcelain").toString().trim();
    if (!diff) return;

    execSync('git config user.name "github-actions[bot]"');
    execSync('git config user.email "github-actions[bot]@users.noreply.github.com"');

    execSync(`git add ${SENT_FILE}`);
    execSync(`git commit -m "Mark sent: ${dateYmd}"`);
    execSync("git push");
  } catch (e) {
    console.error("Git commit/push skipped or failed:", e?.message ?? e);
  }
}

function isYesterdayLondon(dateObj, yYmd) {
  const pubYmd = londonYmd(dateObj);
  return pubYmd === yYmd;
}

function titleHasAnyKeyword(title, keywords) {
  const t = String(title ?? "").toLowerCase();
  return keywords.some((kw) => t.includes(String(kw).toLowerCase()));
}

async function main() {
  const yYmd = yesterdayYmdLondon();

  // 发送锁：如果昨天已经发过了，直接退出
  const lastSent = await readLastSent();
  if (lastSent === yYmd) {
    console.log(`Already sent for ${yYmd}, exit.`);
    return;
  }

  const layers = cfg.layers ?? {
    layer1_hard_signals: {
      enabled: true,
      maxItemsPerFeed: cfg.maxItemsPerFeed ?? 20,
      feeds: cfg.feeds ?? [],
    },
    layer3_deep_reads: {
      enabled: false,
      maxItemsPerFeed: 20,
      feeds: [],
    },
  };

  async function ingestLayer(layerKey, layerCfg) {
    if (!layerCfg?.enabled) return [];
    const items = [];
    for (const feed of layerCfg.feeds ?? []) {
      try {
        const xml = await fetchText(feed);
        const parsed = parseFeed(xml, feed).slice(0, layerCfg.maxItemsPerFeed ?? 20);
        items.push(...parsed.map((it) => ({ ...it, layerKey })));
      } catch (e) {
        console.error(`Feed failed [${layerKey}]: ${feed}`, e.message);
      }
    }
    return items;
  }

  const layer1All = await ingestLayer("layer1_hard_signals", layers.layer1_hard_signals);
  const layer3All = await ingestLayer("layer3_deep_reads", layers.layer3_deep_reads);

  const maxPerSection = cfg.output?.maxPerSection ?? 8;
  const maxTotal = cfg.output?.maxTotal ?? 30;
  const requireAiTechKeywords = cfg.output?.requireAiTechKeywords ?? false;
  const aiTechKeywords = cfg.output?.aiTechKeywords ?? [];
  const deepReadsMax = 3;

  const seenLayer1 = new Set();
  const layer1Filtered = layer1All
    .filter((it) => isYesterdayLondon(it.pubDate, yYmd))
    .filter((it) => {
      const key = it.link;
      if (seenLayer1.has(key)) return false;
      seenLayer1.add(key);
      return true;
    });

  const classified = layer1Filtered.map((it) => ({
    ...it,
    cls: classifyItem(it),
  }));

  const phase1Items = classified
    .filter((it) => it.cls.topic !== "OTHER")
    .filter((it) => {
      if (!requireAiTechKeywords) return true;
      return titleHasAnyKeyword(it.title, aiTechKeywords);
    });

  const sorted = phase1Items.sort((a, b) => b.pubDate - a.pubDate);

  const sectionCounts = new Map();
  let totalCount = 0;
  const items = sorted.filter((it) => {
    const sectionKey = it.cls.topic === "IPO" ? "IPO" : "MA_FINANCING";
    if (sectionCounts.get(sectionKey) >= maxPerSection) return false;
    if (totalCount >= maxTotal) return false;
    sectionCounts.set(sectionKey, (sectionCounts.get(sectionKey) ?? 0) + 1);
    totalCount += 1;
    return true;
  });

  const seenLayer3 = new Set();
  const deepReads = layer3All
    .filter((it) => isYesterdayLondon(it.pubDate, yYmd))
    .filter((it) => {
      const key = it.link;
      if (seenLayer3.has(key)) return false;
      seenLayer3.add(key);
      return true;
    })
    .filter((it) => titleHasAnyKeyword(it.title, aiTechKeywords))
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, deepReadsMax);

  const header = `<b>Daily News · ${yYmd}</b>\n<i>Window: ${yYmd} 00:00–23:59 (${TZ})</i>\n`;
  const regionOrder = ["EU", "US", "CNHK", "SG"];
  const regionLabel = {
    EU: "EU",
    US: "US",
    CNHK: "CN+HK",
    SG: "SG",
  };

  const ipoByRegion = new Map(regionOrder.map((r) => [r, []]));
  const maFinByRegion = new Map(regionOrder.map((r) => [r, []]));

  for (const it of items) {
    if (!regionOrder.includes(it.cls.region)) continue;
    if (it.cls.topic === "IPO") {
      ipoByRegion.get(it.cls.region).push(it);
    } else {
      maFinByRegion.get(it.cls.region).push(it);
    }
  }

  function renderSection(title, grouped, includeTopicTag) {
    const parts = [`<b>${escapeHtml(title)}</b>`];
    for (const region of regionOrder) {
      parts.push(`<u>${regionLabel[region]}</u>`);
      const rows = grouped.get(region) ?? [];
      if (rows.length === 0) {
        parts.push("No items.");
        continue;
      }
      for (const it of rows) {
        const t = escapeHtml(it.title.replace(/\s+/g, " ").trim());
        const topicTag = includeTopicTag ? `[${it.cls.topic}] ` : "";
        parts.push(`• ${escapeHtml(topicTag)}<a href="${it.link}">${t}</a>`);
      }
    }
    return parts.join("\n");
  }

  const body = [
    renderSection("IPO (AI/Tech): EU / US / CN+HK / SG", ipoByRegion, false),
    "",
    renderSection("M&A / Financing (AI/Tech): EU / US / CN+HK / SG", maFinByRegion, true),
    "",
    "<b>AI/Tech Deep Reads (BestBlogs)</b>",
    ...(
      deepReads.length === 0
        ? ["No items."]
        : deepReads.map((it) => {
            const t = escapeHtml(it.title.replace(/\s+/g, " ").trim());
            return `• <a href="${it.link}">${t}</a>`;
          })
    ),
  ].join("\n");

  const full = `${header}\n${body}`;
  for (const chunk of chunkByLimit(full)) {
    await sendTelegram(chunk);
  }

  // 标记已发送并回写到 repo（防止重复推送）
  await writeLastSent(yYmd);
  gitCommitIfChanged(yYmd);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
