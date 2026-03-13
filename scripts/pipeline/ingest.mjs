import { fetchRss } from "../adapters/rss.mjs";
import { fetchEmail } from "../adapters/email.mjs";
import { normalizeItems } from "./normalize.mjs";
import { dedupeItems } from "./dedupe.mjs";
import { mergeHealth } from "./health.mjs";

export async function ingestAll({
  rssSources,
  maxItemsPerFeed,
  prevHealth,
  enableEmail = false,
}) {
  const rss = await fetchRss({ sources: rssSources, maxItemsPerFeed, prevHealth });
  const email = await fetchEmail({ enabled: enableEmail });

  const normalized = normalizeItems([...rss.items, ...email.items]);
  const items = dedupeItems(normalized);
  const health = mergeHealth(rss.health, email.health);

  return { articles: items, health };
}
