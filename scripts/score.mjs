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

  // ── 1. 新鲜度分（指数衰减，最高 20 分）
  // 半衰期优先用来源自身配置，否则用全局默认值
  const halfLife = source?.halfLifeHours ?? recencyHalfLifeHours;
  const ageHours = (Date.now() - article.pubDate.getTime()) / 3_600_000;
  const recencyScore = 20 * Math.pow(0.5, ageHours / halfLife);

  // ── 2. 来源权重分（weight 1-3 对应 10/20/30 分）
  const sourceScore = (source?.weight ?? 1) * 10;

  // ── 3. 关键词匹配分（分组上限 + 全局上限）
  // fullText 由 enrichWithFullText 注入，无则退化为仅 title+summary
  const haystack = `${article.title} ${article.summary} ${article.fullText ?? ""}`.toLowerCase();
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
//
// 资本市场交易分为三个平级子类：
//   💼 并购 M&A     — tags: ma
//   📈 股权融资     — tags: ipo, vc
//   💰 资本市场·其他 — tags: finance, startup（兜底）
//
// 注意：深度阅读须排在资本市场·其他之前，防止 essay/strategy 类博客落入资本市场桶
const CATEGORIES = [
  { label: "🤖 AI & 研究",      tags: ["ai", "llm", "research"] },
  { label: "💼 并购 M&A",       tags: ["ma"] },
  { label: "📈 股权融资",       tags: ["ipo", "vc"] },
  { label: "📊 宏观市场",       tags: ["macro"] },
  { label: "💻 泛科技",         tags: ["tech", "apple", "semiconductor", "dev", "systems",
                                        "rust", "cs", "software", "security"] },
  { label: "📝 深度阅读",       tags: ["essay", "deep-read", "interview", "strategy", "science", "criticism"] },
  { label: "💰 资本市场·其他",  tags: ["finance", "startup"] },
  { label: "🌐 社区",           tags: ["community", "zh"] },
];

// ─── 基于标题内容的高置信度分类模式 ───────────────────────────────────────────
//
// 对非"内容性格"来源（如 Reuters Google News RSS），优先用标题匹配确定真实分类，
// 避免 Google News 返回与检索词不符的文章被错误归类。
//
// 设计原则：
//   - 模式尽量高精度（宁可不命中，不要误命中）
//   - 交易事件（并购、融资）优先于行业标签（AI、宏观）
//     因为 "AI 芯片公司融资" 的首要分类是融资事件，而非 AI 行业
const TITLE_PATTERNS = [
  {
    label: "💼 并购 M&A",
    re: /\bacquisition\b|(?:acquires|acquired)\b|\bbuys\b.{1,40}(?:for|deal)|\bmerger\b|\bmerges\b|\btakeover\b|\bbuyout\b|\bdrops?\b.{0,25}\bbid\b|\bbid\s+for\b|\bbids?\s+on\b/i,
  },
  {
    label: "📈 股权融资",
    re: /\bipo\b|\bgo(?:es|ing)\s+public\b|\bfiles?\s+(?:for\s+)?ipo\b|\bs-1\b|\bf-1\b|series\s+[a-e]\s+(?:round|funding)|\braised?\s+\$[\d,.]+\s*(?:million|billion)\b|\bfunding\s+round\b|\braises\b.{1,30}\$[\d]/i,
  },
  {
    label: "📊 宏观市场",
    re: /\bfed\b|federal reserve|\bcpi\b|\bppi\b|\binflation\b|\btariff(?:s)?\b|interest\s+rate|rate\s+cut|rate\s+hike|treasury\s+yield|nonfarm\s+payroll|gdp\s+(?:growth|data|fell|rose)/i,
  },
  {
    label: "🤖 AI & 研究",
    re: /\bai\b|\bllm\b|gpt-?\d|gpt\s*4o?|claude\s|gemini\s|openai\b|deepmind|deepseek|anthropic|\bartificial intelligence\b|large language model/i,
  },
];

// 这些来源标签代表"内容性格"（内容类型由来源本身决定），不被标题匹配覆盖
const SOURCE_IDENTITY_TAGS = new Set([
  "essay", "deep-read", "interview", "science", "criticism",
  "community", "zh",
]);

// 这些标签代表"具体交易类型"，需要标题内容确认才使用；
// 若标题无法确认，则退回到通用兜底分类（资本市场·其他）
const SOFT_CAPITAL_TAGS = new Set(["ma", "ipo", "vc"]);

/**
 * 分配文章分类
 *
 * 优先级：
 *   1. 来源含"内容性格"标签 → 直接用来源标签分类（保留 essay/community 等内容定位）
 *   2. 标题内容匹配           → 根据文章实际内容分类（修正 Google News RSS 偏差）
 *   3. 来源标签兜底（第一遍）  → 跳过"软"资本市场标签，避免不相关文章误入 M&A/股权融资
 *   4. 来源标签兜底（第二遍）  → 含全部标签，最终兜底
 */
function assignCategory(source, article) {
  const srcTags = source?.tags ?? [];

  // 优先级 1：来源有"内容性格"标签时，尊重来源分类
  if (srcTags.some(t => SOURCE_IDENTITY_TAGS.has(t))) {
    for (const cat of CATEGORIES) {
      if (cat.tags.some(t => srcTags.includes(t))) return cat.label;
    }
  }

  // 优先级 2：标题内容匹配
  const titleText = article?.title ?? "";
  for (const { label, re } of TITLE_PATTERNS) {
    if (re.test(titleText)) return label;
  }

  // 优先级 3：来源标签兜底（跳过需要标题确认的"软"资本市场标签）
  for (const cat of CATEGORIES) {
    if (cat.tags.some(t => srcTags.includes(t) && !SOFT_CAPITAL_TAGS.has(t))) return cat.label;
  }

  // 优先级 4：来源标签全量兜底（含 ma/ipo/vc）
  for (const cat of CATEGORIES) {
    if (cat.tags.some(t => srcTags.includes(t))) return cat.label;
  }

  return "📰 其他";
}

// ─── 标题指纹与故事相似度 ──────────────────────────────────────────────────────

const HOT_THRESHOLD        = 2;  // 至少被几个不同来源报道才触发聚合
const CLUSTER_BONUS_SOURCE = 8;  // 每多一个来源报道，代表文章额外加分

// 标题相似度比较时过滤掉的高频噪词
const STORY_STOPWORDS = new Set([
  "the", "this", "that", "with", "from", "into", "they", "their",
  "have", "will", "been", "what", "when", "where", "which", "about",
  "after", "says", "said", "more", "over", "than", "could", "would",
  "report", "reports", "update", "updates", "latest", "news",
  "amid", "week", "year", "back", "also", "just", "some", "says",
  "plan", "plans", "make", "made", "take", "took", "look", "here",
]);

/**
 * 将标题规范化为词列表（用于跨来源相似度比较）
 *   - 金额归一化：$110B / $110 billion → "110b"；$250M / $250 million → "250m"
 *   - 去除所有格 's
 *   - 过滤停用词和极短词（< 4 字符）
 */
function titleFingerprint(title) {
  return (title ?? "")
    .toLowerCase()
    .replace(/'s\b/g, "")
    .replace(/\$?([\d,.]+)\s*[Bb](?:illion|n)?\b/g, (_, n) => n.replace(/,/g, "") + "b")
    .replace(/\$?([\d,.]+)\s*[Mm](?:illion|n)?\b/g, (_, n) => n.replace(/,/g, "") + "m")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 4 && !STORY_STOPWORDS.has(w));
}

/**
 * 判断两个标题是否报道同一故事（共享 >= minShared 个有意义词元）
 */
function sameStory(t1, t2, minShared = 2) {
  const f1 = new Set(titleFingerprint(t1));
  if (f1.size === 0) return false;
  const shared = titleFingerprint(t2).filter(w => f1.has(w)).length;
  return shared >= minShared;
}

/**
 * 统计每个关键词被多少个不同来源提到，返回热门关键词 → 来源集合 的 Map
 */
function detectHotTopics(articles, keywords) {
  const kwSourceMap = new Map(); // keyword → Set<sourceName>
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
  const hotKeywords = new Set();
  for (const [kw, srcs] of kwSourceMap) {
    if (srcs.size >= HOT_THRESHOLD) hotKeywords.add(kw);
  }
  return hotKeywords;
}

/**
 * 故事聚合去重
 *
 * 双重聚合策略：
 *   1. 标题相似度（主要）— 共享 ≥2 个有意义词元即视为同一故事
 *      → 覆盖未在 scoring.keywords 中列出的实体（如 "openai"、"billion" 等）
 *   2. 热词重叠（辅助）— 延续旧逻辑，兜底处理泛关键词场景
 *
 * 每组只保留得分最高的代表文章，多来源报道转化为加分（isHot 信号）。
 *
 * @param {Array}  articles     已完成初步打分的文章数组
 * @param {Set}    hotKeywords  detectHotTopics 返回的热词集合
 * @returns {Array} 去重后的文章数组（每个故事最多一篇）
 */
function clusterAndDedup(articles, hotKeywords) {
  const hotArr = [...hotKeywords];

  // 给每篇文章标注命中了哪些热词（保留兜底热词逻辑）
  const tagged = articles.map(a => {
    const hay = `${a.title} ${a.summary}`.toLowerCase();
    const hits = hotArr.filter(kw => hay.includes(kw));
    return { ...a, _hotHits: hits };
  });

  const clusters = []; // { hotKws: Set, articles: [] }

  for (const article of tagged) {
    // 寻找可以合并的已有聚类：热词重叠 OR 标题相似
    let target = null;
    for (const cluster of clusters) {
      const hotOverlap   = article._hotHits.length > 0 &&
                           article._hotHits.some(kw => cluster.hotKws.has(kw));
      const titleSimilar = cluster.articles.some(ca => sameStory(article.title, ca.title));
      if (hotOverlap || titleSimilar) {
        target = cluster;
        break;
      }
    }

    if (target) {
      target.articles.push(article);
      article._hotHits.forEach(kw => target.hotKws.add(kw));
    } else {
      clusters.push({ hotKws: new Set(article._hotHits), articles: [article] });
    }
  }

  // 每个聚类：选代表 + 计算加分
  const result = [];
  for (const cluster of clusters) {
    if (cluster.articles.length === 1) {
      // 单篇，无需聚合
      const { _hotHits, ...rest } = cluster.articles[0];
      result.push(rest);
      continue;
    }

    cluster.articles.sort((a, b) => b.score - a.score);
    const best       = cluster.articles[0];
    const uniqueSrcs = new Set(cluster.articles.map(a => a.sourceName)).size;
    const bonus      = (uniqueSrcs - 1) * CLUSTER_BONUS_SOURCE;

    console.log(
      `  📰 故事聚合: "${best.title.slice(0, 55)}…" ` +
      `(${uniqueSrcs} 个来源, +${bonus}分)`
    );

    const { _hotHits, ...rest } = best;
    result.push({ ...rest, score: best.score + bonus, isHot: uniqueSrcs >= HOT_THRESHOLD });
  }

  return result;
}

/**
 * 对文章列表打分、聚合去重、排序
 *
 * 流程：
 *   1. URL 去重
 *   2. 逐篇打分 + 分类
 *   3. 检测热词（被 HOT_THRESHOLD+ 个来源报道的关键词）
 *   4. 故事聚合：同故事只保留代表文章，多来源覆盖转化为加分
 *   5. 每来源最多 maxPerSource 篇（多样性控制）
 *   6. 最终排序
 *
 * @param {Array}  articles  fetchAllFeeds 返回的原始文章数组
 * @param {Array}  sources   sources.json 中的 sources 数组
 * @param {object} scoring   sources.json 中的 scoring 配置块
 * @returns {Array} 去重排序后的文章数组
 */
export function rankArticles(articles, sources, scoring) {
  const { maxPerSource = 3, keywords = [] } = scoring;

  // 建立来源名 → 配置的快速查找表
  const sourceMap = new Map(sources.map((s) => [s.name, s]));

  // ── Step 1: URL 去重 ──────────────────────────────────────────────────────
  const seen = new Set();
  const unique = articles.filter((a) => {
    if (seen.has(a.link)) return false;
    seen.add(a.link);
    return true;
  });

  // ── Step 2: 逐篇打分 + 分类 ──────────────────────────────────────────────
  const scored = unique.map((article) => {
    const source  = sourceMap.get(article.sourceName);
    const rawScore = calcScore(article, source, scoring);
    const category = assignCategory(source, article);
    return { ...article, score: rawScore, category };
  });

  // ── Step 3: 检测热词（辅助聚合信号）──────────────────────────────────────
  const hotKeywords = detectHotTopics(scored, keywords);
  if (hotKeywords.size > 0) {
    console.log(`  🔥 热门话题（${HOT_THRESHOLD}+ 来源报道）: ${[...hotKeywords].join(" · ")}`);
  }

  // ── Step 4: 故事聚合去重（标题相似度 + 热词双重策略）────────────────────
  const deduped = clusterAndDedup(scored, hotKeywords);

  // ── Step 5: 来源多样性控制（每来源最多 maxPerSource 篇）────────────────────
  deduped.sort((a, b) => b.score - a.score);
  const srcCount = new Map();
  const final = deduped.filter((article) => {
    const cnt = srcCount.get(article.sourceName) ?? 0;
    srcCount.set(article.sourceName, cnt + 1);
    return cnt < maxPerSource;
  });

  // ── Step 6: 最终排序 ─────────────────────────────────────────────────────
  final.sort((a, b) => b.score - a.score);
  return final;
}
