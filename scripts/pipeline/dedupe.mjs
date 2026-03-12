/**
 * Cross-source dedupe stage (Phase 1)
 * Keeps the first occurrence by link.
 */
export function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = item?.link ?? `${item?.sourceName ?? "src"}:${item?.title ?? ""}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
