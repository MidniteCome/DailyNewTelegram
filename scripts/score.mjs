/**
 * score.mjs — 文章打分与排序模块
 *
 * 总分 = 新鲜度分(0-20) + 来源权重分(0-30) + 关键词匹配分(0-30) + 话题热度加分(0-15)
 * 同一来源超过 maxPerSource 条时，多余条目乘以多样性惩罚系数 0.3
 * 话题热度：同一关键词被 hotThreshold 个以上不同来源报道时，相关文章额外加分
 */

/**
 * 计算单篇文章得分
 * @param {object} article   文章对象 { title, link, summary, pubDate, sourceName, sourceUrl }
 * @param {object} source    对应的来源配置 { weight: 1-3, ... }
 * @param {object} scoring   scoring 配置块
 * @returns {number}
 */
function calcScore(article, source, scoring) {
  const {
    recencyHalfLifeHours = 36,
    keywords = [],
    kwGroupCaps = {},
    kwCap = 35,
  } = scoring;

  // ── 1. 新鲜度分（指数衰减，最高 20 分，半衰期 36h）
  const ageHours = (Date.now() - article.pubDate.getTime()) / 3_600_000;
  const recencyScore = 20 * Math.pow(0.5, ageHours / recencyHalfLifeHours);

  // ── 2. 来源权重分（weight 1-3 对应 10/20/30 分）
  const sourceScore = (source?.weight ?? 1) * 10;

  // ── 3. 关键词匹配分（分组上限 + 全局上限）
  const haystack = `${article.title} ${article.summary}`.toLowerCase();
  const groupAccum = new Map(); // group → raw accumulated score
  let ungroupedScore = 0;

  for (const { keyword, score, group } of keywords) {
    if (haystack.includes(keyword.toLowerCase())) {
      const pts = score ?? 5;
      if (group) {
        groupAccum.set(group, (groupAccum.get(group) ?? 0) + pts);
      } else {
        ungroupedScore += pts;
      }
    }
  }

  // 各组分别套上限后汇总
  let kwScore = ungroupedScore;
  for (const [grp, raw] of groupAccum) {
    const cap = kwGroupCaps[grp] ?? Infinity;
    kwScore += Math.min(raw, cap);
  }
  kwScore = Math.min(kwScore, kwCap); // 全局上限

  return recencyScore + sourceScore + kwScore;
}

// ─── 分类定义（优先级从上到下，第一个 tag 命中即归入该类）───────────────────────
const CATEGORIES = [
  { label: "🤖 AI & 研究",  tags: ["ai", "llm", "research"] },
  { label: "💼 并购 & 交易", tags: ["ma"] },
  { label: "💰 金融 & 创投", tags: ["finance", "ipo", "startup", "vc"] },
  { label: "🔧 开发 & 系统", tags: ["dev", "systems", "rust", "cs", "software"] },
  { label: "🛡️ 安全",       tags: ["security"] },
  { label: "💻 科技产品",    tags: ["tech", "apple", "semiconductor"] },
  { label: "📝 深度阅读",    tags: ["essay", "deep-read", "interview", "strategy", "science", "criticism"] },
  { label: "🌐 社区",       tags: ["community", "zh"] },
];

function assignCategory(source) {
  const srcTags = source?.tags ?? [];
  for (const cat of CATEGORIES) {
    if (cat.tags.some((t) => srcTags.includes(t))) return cat.label;
  }
  return "📰 其他";
}

/**
 * 对文章列表打分、去重、排序，并应用来源多样性惩罚
 * @param {Array}  articles  fetchAllFeeds 返回的原始文章数组
 * @param {Array}  sources   sources.json 中的 sources 数组（含 weight）
 * @param {object} scoring   sources.json 中的 scoring 配置块
 * @returns {Array}  带 score、category 字段的文章数组，按分数降序
 */
// ─── 话题热度检测 ──────────────────────────────────────────────────────────────

const HOT_BONUS     = 10; // 热门话题额外加分
const HOT_THRESHOLD = 3;  // 至少被几个不同来源报道才算热门

/**
 * 统计每个关键词被多少个不同来源提到，返回热门关键词集合
 */
function detectHotTopics(articles, keywords) {
  // keyword → Set<sourceName>
  const kwSourceMap = new Map();

  for (const article of articles) {
    const haystack = `${article.title} ${article.summary}`.toLowerCase();
    for (const { keyword } of keywords) {
      const kw = keyword.toLowerCase();
      if (haystack.includes(kw)) {
        if (!kwSourceMap.has(kw)) kwSourceMap.set(kw, new Set());
        kwSourceMap.get(kw).add(article.sourceName);
      }
    }
  }

  // 只保留达到阈值的关键词
  const hotKeywords = new Set();
  for (const [kw, sources] of kwSourceMap) {
    if (sources.size >= HOT_THRESHOLD) hotKeywords.add(kw);
  }
  return hotKeywords;
}

export function rankArticles(articles, sources, scoring) {
  const { maxPerSource = 3, keywords = [] } = scoring;

  // 建立来源名 → 配置的快速查找表
  const sourceMap = new Map(sources.map((s) => [s.name, s]));

  // 去重（按链接）
  const seen = new Set();
  const unique = articles.filter((a) => {
    if (seen.has(a.link)) return false;
    seen.add(a.link);
    return true;
  });

  // 初步打分 + 分类
  const scored = unique.map((article) => {
    const source = sourceMap.get(article.sourceName);
    const rawScore = calcScore(article, source, scoring);
    const category = assignCategory(source);
    return { ...article, score: rawScore, category };
  });

  // ── 话题热度加分 ────────────────────────────────────────────────────────────
  const hotKeywords = detectHotTopics(scored, keywords);

  if (hotKeywords.size > 0) {
    console.log(`  🔥 热门话题（被 ${HOT_THRESHOLD}+ 来源同日报道）: ${[...hotKeywords].join(" · ")}`);
  }

  const withHot = scored.map((article) => {
    const haystack = `${article.title} ${article.summary}`.toLowerCase();
    const isHot = [...hotKeywords].some((kw) => haystack.includes(kw));
    return isHot
      ? { ...article, score: article.score + HOT_BONUS, isHot: true }
      : article;
  });

  // 按加分后的分数排序
  withHot.sort((a, b) => b.score - a.score);

  // ── 多样性惩罚：阶梯式折扣，超出 maxPerSource 后逐步降权 ──────────────────
  // 第 maxPerSource+1 篇 ×0.7，第 +2 篇 ×0.5，第 +3 篇及以后 ×0.3
  const sourceCount = new Map();
  const final = withHot.map((article) => {
    const cnt = sourceCount.get(article.sourceName) ?? 0;
    sourceCount.set(article.sourceName, cnt + 1);
    const overflow = cnt - maxPerSource;
    if (overflow < 0) return article;
    const factor = overflow === 0 ? 0.7 : overflow === 1 ? 0.5 : 0.3;
    return { ...article, score: article.score * factor };
  });

  // 应用惩罚后重新排序
  final.sort((a, b) => b.score - a.score);

  return final;
}
