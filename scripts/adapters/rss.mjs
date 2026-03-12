import { fetchAllFeeds } from "../fetch.mjs";

/**
 * RSS adapter (compat layer)
 * Keeps existing fetch behavior unchanged.
 */
export async function fetchRss({ sources, maxItemsPerFeed, prevHealth }) {
  const { articles, health } = await fetchAllFeeds(sources, maxItemsPerFeed, prevHealth);
  return { items: articles, health };
}
