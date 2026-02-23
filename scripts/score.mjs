/**
 * score.mjs — 文章打分与排序模块
 *
 * 总分 = 新鲜度分(0-40) + 来源权重分(0-30) + 关键词匹配分(0-30)
 * 同一来源超过 maxPerSource 条时，多余条目乘以多样性惩罚系数 0.3
 */

/**
 * 计算单篇文章得分
 * @param {object} article   文章对象 { title, link, summary, pubDate, sourceName, sourceUrl }
 * @param {object} source    对应的来源配置 { weight: 1-3, ... }
 * @param {object} scoring   scoring 配置块
 * @returns {number}
 */
function calcScore(article, source, scoring) {
  const { recencyHalfLifeHours = 12, keywords = [] } = scoring;

  // ── 1. 新鲜度分（指数衰减，最高 40 分）
  const ageHours = (Date.now() - article.pubDate.getTime()) / 3_600_000;
  const recencyScore = 40 * Math.pow(0.5, ageHours / recencyHalfLifeHours);

  // ── 2. 来源权重分（weight 1-3 对应 10/20/30 分）
  const sourceScore = (source?.weight ?? 1) * 10;

  // ── 3. 关键词匹配分（上限 30 分）
  const haystack = `${article.title} ${article.summary}`.toLowerCase();
  let kwScore = 0;
  for (const { keyword, score } of keywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      kwScore += score ?? 5;
    }
  }
  kwScore = Math.min(kwScore, 30);

  return recencyScore + sourceScore + kwScore;
}

/**
 * 对文章列表打分、去重、排序，并应用来源多样性惩罚
 * @param {Array}  articles  fetchAllFeeds 返回的原始文章数组
 * @param {Array}  sources   sources.json 中的 sources 数组（含 weight）
 * @param {object} scoring   sources.json 中的 scoring 配置块
 * @returns {Array}  带 score 字段的文章数组，按分数降序
 */
export function rankArticles(articles, sources, scoring) {
  const { maxPerSource = 3 } = scoring;

  // 建立来源名 → 配置的快速查找表
  const sourceMap = new Map(sources.map((s) => [s.name, s]));

  // 去重（按链接）
  const seen = new Set();
  const unique = articles.filter((a) => {
    if (seen.has(a.link)) return false;
    seen.add(a.link);
    return true;
  });

  // 初步打分
  const scored = unique.map((article) => {
    const source = sourceMap.get(article.sourceName);
    const rawScore = calcScore(article, source, scoring);
    return { ...article, score: rawScore };
  });

  // 按原始分降序排序
  scored.sort((a, b) => b.score - a.score);

  // 多样性惩罚：每个来源超过 maxPerSource 后，分数打折
  const sourceCount = new Map();
  const final = scored.map((article) => {
    const cnt = sourceCount.get(article.sourceName) ?? 0;
    sourceCount.set(article.sourceName, cnt + 1);
    if (cnt >= maxPerSource) {
      return { ...article, score: article.score * 0.3 };
    }
    return article;
  });

  // 应用惩罚后重新排序
  final.sort((a, b) => b.score - a.score);

  return final;
}
