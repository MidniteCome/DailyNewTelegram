/**
 * fetch.mjs — RSS 抓取模块
 * 支持 RSS 2.0 和 Atom 格式，返回标准化的文章对象数组
 */

const HTTP_USER_AGENT =
  process.env.HTTP_USER_AGENT ??
  "DailyNewTelegram/2.0 (https://github.com/williamchoi/DailyNewTelegram)";

/** 获取 RSS/Atom XML 文本 */
async function fetchXml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": HTTP_USER_AGENT,
      accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** 简单去除 HTML 标签，截断到指定长度 */
function stripHtml(text = "", maxLen = 300) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

/** 解析 Atom feed */
function parseAtom(xml, sourceName, sourceUrl) {
  const items = [];
  const entries = xml.split(/<entry[\s>]/).slice(1);
  for (const e of entries) {
    const title = stripHtml(
      e.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""
    );
    const link =
      e.match(/<link[^>]+href="([^"]+)"[^>]*\/?>/i)?.[1] ??
      e.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ??
      "";
    const dateStr =
      e.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] ??
      e.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] ??
      "";
    const summary = stripHtml(
      e.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ??
        e.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] ??
        ""
    );
    const pubDate = dateStr ? new Date(dateStr) : null;
    if (title && link.startsWith("http") && pubDate && !isNaN(pubDate)) {
      items.push({ title, link: link.trim(), summary, pubDate, sourceName, sourceUrl });
    }
  }
  return items;
}

/** 解析 RSS 2.0 feed */
function parseRss(xml, sourceName, sourceUrl) {
  const items = [];
  const entries = xml.split(/<item[\s>]/).slice(1);
  for (const e of entries) {
    const title = stripHtml(
      e.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? ""
    );
    const link = (
      e.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ??
      e.match(/<guid[^>]*isPermaLink="true"[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ??
      ""
    ).trim();
    const dateStr = (
      e.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ??
      e.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i)?.[1] ??
      ""
    ).trim();
    const summary = stripHtml(
      e.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] ?? ""
    );
    const pubDate = dateStr ? new Date(dateStr) : null;
    if (title && link.startsWith("http") && pubDate && !isNaN(pubDate)) {
      items.push({ title, link, summary, pubDate, sourceName, sourceUrl });
    }
  }
  return items;
}

/** 解析单个 feed，自动判断 RSS/Atom */
function parseFeed(xml, sourceName, sourceUrl) {
  const isAtom = /<feed[\s>]/i.test(xml);
  return isAtom
    ? parseAtom(xml, sourceName, sourceUrl)
    : parseRss(xml, sourceName, sourceUrl);
}

/**
 * 抓取所有配置的 RSS 源
 * @param {Array} sources  来自 sources.json 的 sources 数组
 * @param {number} maxItemsPerFeed  每个源最多抓取条数
 * @returns {Promise<Array>}  标准化文章数组
 */
export async function fetchAllFeeds(sources, maxItemsPerFeed = 30) {
  const results = [];

  for (const src of sources) {
    const { name, url } = src;
    try {
      const xml = await fetchXml(url);
      const items = parseFeed(xml, name, url).slice(0, maxItemsPerFeed);
      console.log(`  ✓ ${name}  (${items.length} 条)`);
      results.push(...items);
    } catch (err) {
      console.warn(`  ✗ ${name}  失败: ${err.message}`);
    }
  }

  return results;
}
