import fs from "node:fs/promises";
import { normalizeHealth, normalizeItem } from "./base.mjs";

const HTTP_USER_AGENT =
  process.env.HTTP_USER_AGENT ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

/**
 * WeChat adapter via RSSHub
 *
 * Supports two source types:
 * 1. "rsshub" - direct RSSHub route (e.g., /36kr/newsflashes)
 * 2. "wechat-biz" - WeChat public account via biz ID
 *
 * Safe default: no-op unless ENABLE_WECHAT=true and source file exists.
 */

async function fetchXml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": HTTP_USER_AGENT,
      accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function stripHtml(text = "", maxLen = 300) {
  return text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function parseRssFeed(xml, sourceName) {
  const items = [];
  const isAtom = /<feed[\s>]/i.test(xml);

  if (isAtom) {
    const entries = xml.split(/<entry[\s>]/).slice(1);
    for (const e of entries) {
      const title = stripHtml(e.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
      const link = e.match(/<link[^>]+href="([^"]+)"[^>]*\/?>/i)?.[1] ??
                   e.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? "";
      const dateStr = e.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] ??
                      e.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] ?? "";
      const summary = stripHtml(e.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ??
                                e.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] ?? "");
      const pubDate = dateStr ? new Date(dateStr) : new Date();
      if (title && link) {
        items.push({ title, link, summary, pubDate, sourceName });
      }
    }
  } else {
    const entries = xml.split(/<item[\s>]/).slice(1);
    for (const e of entries) {
      const title = stripHtml(e.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? "");
      const link = (e.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ??
                    e.match(/<guid[^>]*isPermaLink="true"[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ?? "").trim();
      const dateStr = (e.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ??
                       e.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i)?.[1] ?? "").trim();
      const summary = stripHtml(e.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] ?? "");
      const pubDate = dateStr ? new Date(dateStr) : new Date();
      if (title && link) {
        items.push({ title, link, summary, pubDate, sourceName });
      }
    }
  }
  return items;
}

export async function fetchWechat({ enabled = false, configPath = "sources/wechat.json" } = {}) {
  if (!enabled) {
    return {
      items: [],
      health: [normalizeHealth("wechat", configPath, { ok: true, skipped: true })],
    };
  }

  let config;
  try {
    const raw = await fs.readFile(configPath, "utf8");
    config = JSON.parse(raw);
  } catch (e) {
    return {
      items: [],
      health: [normalizeHealth("wechat", configPath, { ok: false, itemCount: 0, error: String(e?.message ?? e) })],
    };
  }

  if (!config.enabled) {
    return {
      items: [],
      health: [normalizeHealth("wechat", configPath, { ok: true, skipped: true, reason: "config.enabled=false" })],
    };
  }

  const baseUrl = config.baseUrl || "https://rsshub.app";
  const sources = config.sources || [];
  const allItems = [];
  const healthResults = [];

  for (const source of sources) {
    const sourceName = source.name || "unknown";
    let feedUrl;

    // Build feed URL based on source type
    if (source.type === "wechat-biz" && source.biz) {
      feedUrl = `${baseUrl}/wechat/mp/homepage/${source.biz}/0`;
    } else if (source.type === "rsshub" && source.route) {
      feedUrl = `${baseUrl}${source.route.startsWith("/") ? "" : "/"}${source.route}`;
    } else {
      healthResults.push(normalizeHealth("wechat", sourceName, {
        ok: false,
        error: "Invalid source config: need type=rsshub+route or type=wechat-biz+biz",
      }));
      continue;
    }

    try {
      const xml = await fetchXml(feedUrl);
      const parsed = parseRssFeed(xml, sourceName);
      const items = parsed.map((item) =>
        normalizeItem({
          source: `wechat:${sourceName}`,
          sourceType: "wechat",
          title: item.title,
          link: item.link,
          pubDate: item.pubDate,
          summary: item.summary,
          author: sourceName,
        })
      );

      allItems.push(...items);
      healthResults.push(normalizeHealth("wechat", sourceName, { ok: true, itemCount: items.length }));
    } catch (e) {
      healthResults.push(normalizeHealth("wechat", sourceName, {
        ok: false,
        itemCount: 0,
        error: String(e?.message ?? e),
        url: feedUrl,
      }));
    }
  }

  return {
    items: allItems,
    health: healthResults.length > 0
      ? healthResults
      : [normalizeHealth("wechat", configPath, { ok: true, itemCount: 0, reason: "no sources" })],
  };
}
