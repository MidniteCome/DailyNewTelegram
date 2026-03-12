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
