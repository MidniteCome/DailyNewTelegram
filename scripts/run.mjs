import fs from "node:fs/promises";

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.TG_CHAT_ID;
const TZ = "Europe/London";

if (!BOT_TOKEN || !CHAT_ID) {
  throw new Error("Missing BOT_TOKEN or TG_CHAT_ID env vars.");
}

const cfg = JSON.parse(await fs.readFile("sources.json", "utf8"));

function londonYmd(date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return fmt.format(date);
}

function isYesterdayInLondon(pubDate) {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return londonYmd(pubDate) === londonYmd(yesterday);
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

function parseFeed(xml, feedUrl) {
  const items = [];
  const isAtom = xml.includes("<feed") && xml.includes("</feed>");
  if (isAtom) {
    const entries = xml.split("<entry").slice(1).map(s => "<entry" + s);
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
    const entries = xml.split("<item").slice(1).map(s => "<item" + s);
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

async function sendTelegram(htmlText) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: htmlText,
      parse_mode: "HTML",
      disable_web_page_preview: true
    })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
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

async function main() {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const yYmd = londonYmd(yesterday);

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
  const yesterdayItems = all
    .filter(it => isYesterdayInLondon(it.pubDate))
    .filter(it => {
      const key = it.link;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.pubDate - a.pubDate);

  const header = `<b>Daily News · ${yYmd}</b>\n<i>Window: ${yYmd} 00:00–23:59 (${TZ})</i>\n`;

  if (yesterdayItems.length === 0) {
    await sendTelegram(`${header}\nNo items found for yesterday.`);
    return;
  }

  const lines = yesterdayItems.map((it, idx) => {
    const t = escapeHtml(it.title.replace(/\s+/g, " ").trim());
    return `${idx + 1}) <a href="${it.link}">${t}</a>`;
  });

  const full = `${header}\n${lines.join("\n")}`;
  for (const chunk of chunkByLimit(full)) {
    await sendTelegram(chunk);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
