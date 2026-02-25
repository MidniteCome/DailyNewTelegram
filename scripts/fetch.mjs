/**
 * fetch.mjs — RSS 抓取模块
 * 支持 RSS 2.0 和 Atom 格式，返回标准化的文章对象数组
 */

const HTTP_USER_AGENT =
  process.env.HTTP_USER_AGENT ??
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

// ─── URL / 标题标准化 ─────────────────────────────────────────────────────────

/** 去除 UTM 等追踪参数，标准化末尾斜杠，减少"同一文章不同链接"的重复计入 */
export function normalizeUrl(url) {
  try {
    const u = new URL(url.trim());
    const TRACKING = [
      "utm_source","utm_medium","utm_campaign","utm_content","utm_term",
      "utm_id","utm_source_platform","fbclid","gclid","_ga","_gl",
      "ref","source","mc_cid","mc_eid",
    ];
    for (const p of TRACKING) u.searchParams.delete(p);
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

/** 去除 "Breaking:" / "Exclusive:" 等前缀，合并多余空白 */
export function normalizeTitle(title) {
  return title
    .replace(/^(breaking|exclusive|update|alert|developing)\s*[:：]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

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

/** 去除 HTML 标签、解码 HTML 实体，截断到指定长度 */
function stripHtml(text = "", maxLen = 300) {
  return text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")   // 先解码编码过的标签
    .replace(/<[^>]+>/g, " ")                        // 再删除所有 HTML 标签
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
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
    const normLink = normalizeUrl(link);
    if (title && normLink.startsWith("http") && pubDate && !isNaN(pubDate)) {
      items.push({ title: normalizeTitle(title), link: normLink, summary, pubDate, sourceName, sourceUrl });
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
    const normLink = normalizeUrl(link);
    if (title && normLink.startsWith("http") && pubDate && !isNaN(pubDate)) {
      items.push({ title: normalizeTitle(title), link: normLink, summary, pubDate, sourceName, sourceUrl });
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

// ─── 全文抓取配置 ─────────────────────────────────────────────────────────────
const FULL_TEXT_CONCURRENCY  = 8;    // 同时发出的最大并发请求数
const FULL_TEXT_TIMEOUT_MS   = 8_000; // 单篇超时
const FULL_TEXT_CHARS        = 3_000; // 保留正文字符上限（足够关键词匹配）
const FULL_TEXT_CANDIDATE_N  = 100;  // 只对最近 N 篇抓取全文（节省请求）

/** 从 HTML 中提取纯文本（去除 script/style/标签）*/
function extractFullText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, FULL_TEXT_CHARS);
}

/** 抓取单篇文章全文，失败时静默返回原对象 */
async function fetchOneFullText(article) {
  try {
    const res = await fetch(article.link, {
      headers: { "User-Agent": HTTP_USER_AGENT },
      signal: AbortSignal.timeout(FULL_TEXT_TIMEOUT_MS),
    });
    if (!res.ok) return article;
    const html = await res.text();
    return { ...article, fullText: extractFullText(html) };
  } catch {
    return article; // 任何错误都 fallback，不影响主流程
  }
}

/**
 * 对文章列表补充全文字段，用于增强关键词评分。
 * 只对最近 FULL_TEXT_CANDIDATE_N 篇文章抓取，其余保持不变。
 * @param {Array} articles
 * @returns {Promise<Array>}
 */
export async function enrichWithFullText(articles) {
  // 按发布时间降序，优先抓最新文章
  const sorted = [...articles].sort((a, b) => b.pubDate - a.pubDate);
  const candidates = sorted.slice(0, FULL_TEXT_CANDIDATE_N);
  const rest       = sorted.slice(FULL_TEXT_CANDIDATE_N);

  process.stdout.write(`  📄 全文抓取：${candidates.length} 篇候选`);

  // 分批并发，控制同时连接数
  const enriched = [];
  for (let i = 0; i < candidates.length; i += FULL_TEXT_CONCURRENCY) {
    const batch   = candidates.slice(i, i + FULL_TEXT_CONCURRENCY);
    const results = await Promise.all(batch.map(fetchOneFullText));
    enriched.push(...results);
    process.stdout.write(".");
  }

  const hitCount = enriched.filter(a => a.fullText).length;
  console.log(` ✓ ${hitCount}/${enriched.length} 篇成功`);

  return [...enriched, ...rest];
}

/**
 * 抓取所有配置的 RSS 源
 * @param {Array}  sources           来自 sources.json 的 sources 数组
 * @param {number} maxItemsPerFeed   每个源最多抓取条数
 * @param {Map}    prevHealth        上次健康记录（name → consecutiveFails），可为空 Map
 * @returns {Promise<{ articles: Array, health: Array }>}
 */
export async function fetchAllFeeds(sources, maxItemsPerFeed = 30, prevHealth = new Map()) {
  const articles = [];
  const health   = [];

  for (const src of sources) {
    const { name, url } = src;
    const prevFails = prevHealth.get(name)?.consecutiveFails ?? 0;

    // 连续失败 ≥5 次自动跳过，避免无效等待
    if (prevFails >= 5) {
      console.warn(`  ⏭  ${name}  已跳过（连续失败 ${prevFails} 次）`);
      health.push({ name, url, ok: false, itemCount: 0, consecutiveFails: prevFails, skipped: true });
      continue;
    }

    try {
      const xml   = await fetchXml(url);
      const items = parseFeed(xml, name, url).slice(0, maxItemsPerFeed);
      console.log(`  ✓ ${name}  (${items.length} 条)`);
      articles.push(...items);
      health.push({ name, url, ok: true, itemCount: items.length, consecutiveFails: 0 });
    } catch (err) {
      console.warn(`  ✗ ${name}  失败: ${err.message}`);
      health.push({ name, url, ok: false, itemCount: 0, consecutiveFails: prevFails + 1, error: err.message });
    }
  }

  return { articles, health };
}
