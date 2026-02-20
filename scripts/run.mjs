import fs from "node:fs/promises";
import { execSync } from "node:child_process";

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.TG_CHAT_ID; // e.g. "@your_channel"
const TZ = "Europe/London";

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
  const res = await fetch(url, { headers: { "user-agent": "daily-telegram-news/1.0" } });
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

async function main() {
  const yYmd = yesterdayYmdLondon();

  // 发送锁：如果昨天已经发过了，直接退出
  const lastSent = await readLastSent();
  if (lastSent === yYmd) {
    console.log(`Already sent for ${yYmd}, exit.`);
    return;
  }

  const all = [];
  for (const feed of cfg.feeds) {
    try {
      const xml = await fetchText(feed);
      const parsed = parseFeed(xml, feed).slice(0, cfg.maxItemsPerFeed ?? 20);
      all.push(...parsed);
    } catch (e) {
      console.error(`Feed failed: ${feed}`, e.message);
    }
  }

  const seen = new Set();
  const items = all
    .filter((it) => isYesterdayLondon(it.pubDate, yYmd))
    .filter((it) => {
      const key = it.link;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.pubDate - a.pubDate);

  const header = `<b>Daily News · ${yYmd}</b>\n<i>Window: ${yYmd} 00:00–23:59 (${TZ})</i>\n`;

  const body =
    items.length === 0
      ? "No items found for yesterday."
      : items
          .map((it, idx) => {
            const t = escapeHtml(it.title.replace(/\s+/g, " ").trim());
            return `${idx + 1}) <a href="${it.link}">${t}</a>`;
          })
          .join("\n");

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
