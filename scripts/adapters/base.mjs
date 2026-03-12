/**
 * Base adapter contract (documentation + tiny shared helpers)
 *
 * Adapter output item shape (canonical):
 * {
 *   id?: string,
 *   sourceType: 'rss'|'podcast'|'wechat'|'email',
 *   sourceName: string,
 *   title: string,
 *   link: string,
 *   summary?: string,
 *   pubDate: Date,
 *   raw?: object,
 *   paywalled?: boolean,
 *   tags?: string[]
 * }
 */

export function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function normalizeHealth(name, url, extra = {}) {
  return {
    name,
    url,
    ok: Boolean(extra.ok),
    itemCount: extra.itemCount ?? 0,
    consecutiveFails: extra.consecutiveFails ?? 0,
    skipped: Boolean(extra.skipped),
    error: extra.error,
  };
}

/**
 * Normalize an item to the canonical shape.
 */
export function normalizeItem(item) {
  return {
    id: item.id || item.link || `${item.source}:${item.title}`,
    sourceType: item.sourceType || "unknown",
    source: item.source || item.sourceName || "unknown",
    sourceName: item.sourceName || item.source || "unknown",
    title: item.title || "",
    link: item.link || "",
    summary: item.summary || "",
    pubDate: toDate(item.pubDate) || new Date(),
    author: item.author || "",
    paywalled: Boolean(item.paywalled),
    tags: item.tags || [],
    raw: item.raw || null,
  };
}
