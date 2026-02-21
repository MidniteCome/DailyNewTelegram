const TOPIC_RULES = {
  IPO: {
    strong: ["ipo", "initial public", "s-1", "f-1", "prospectus"],
    weak: ["public offering", "listing", "roadshow"],
  },
  MA: {
    strong: ["acquisition", "merger", "buyout", "takeover"],
    weak: ["acquire"],
  },
  FINANCING: {
    strong: ["raises", "funding", "series", "round", "financing", "investment", "strategic investment"],
    weak: [],
  },
  MACRO: {
    strong: [
      "fed",
      "fomc",
      "cpi",
      "inflation",
      "jobs",
      "payrolls",
      "nfp",
      "treasury",
      "yields",
      "rates",
      "recession",
      "risk-on",
      "risk-off",
      "geopolitics",
    ],
    weak: [],
  },
};

const STOCK_EVENT_KEYWORDS = {
  earnings: ["earnings", "results", "guidance", "quarter"],
  priceAction: ["shares", "stock", "jumps", "surges", "plunges", "slumps", "premarket", "after-hours"],
  filings: ["8-k", "10-q", "10-k", "s-1", "f-1", "424b"],
};

const REGION_RULES = {
  CNHK: ["hkex", "hong kong", ".hk", "h-share", "a-share", "shanghai", "shenzhen"],
  SG: ["sgx", "singapore"],
  EU: ["lse", "london", "euronext", "frankfurt", "paris"],
  US: ["nasdaq", "nyse", "sec", "s-1", "f-1"],
};

const TOPIC_PRIORITY = ["IPO", "MA", "FINANCING", "MACRO"];
const REGION_PRIORITY = ["CNHK", "SG", "EU", "US"];

function containsKeyword(text, keyword) {
  return text.includes(keyword);
}

function hasAnyKeyword(text, keywords) {
  return keywords.some((kw) => containsKeyword(text, kw));
}

export function classifyItem({ title = "", link = "", pubDate = "", feedUrl = "" }) {
  const haystack = `${title} ${link} ${feedUrl} ${pubDate}`.toLowerCase();
  const titleOnly = String(title ?? "").toLowerCase();
  const reasons = [];

  const topicScores = new Map();
  for (const topic of TOPIC_PRIORITY) {
    const rules = TOPIC_RULES[topic];
    let score = 0;

    const topicText = topic === "MACRO" ? titleOnly : haystack;
    for (const kw of rules.strong) {
      if (containsKeyword(topicText, kw)) {
        score += 2;
        reasons.push(`topic:${topic}:strong:${kw}`);
      }
    }

    for (const kw of rules.weak) {
      if (containsKeyword(topicText, kw)) {
        score += 1;
        reasons.push(`topic:${topic}:weak:${kw}`);
      }
    }

    topicScores.set(topic, score);
  }

  let topic = "OTHER";
  let topicScore = 0;
  for (const t of TOPIC_PRIORITY) {
    const s = topicScores.get(t) ?? 0;
    if (s > topicScore) {
      topic = t;
      topicScore = s;
    }
  }

  const regionScores = new Map();
  for (const region of REGION_PRIORITY) {
    let score = 0;
    for (const kw of REGION_RULES[region]) {
      if (containsKeyword(haystack, kw)) {
        score += 2;
        reasons.push(`region:${region}:strong:${kw}`);
      }
    }
    regionScores.set(region, score);
  }

  let region = "OTHER";
  let regionScore = 0;
  for (const r of REGION_PRIORITY) {
    const s = regionScores.get(r) ?? 0;
    if (s > regionScore) {
      region = r;
      regionScore = s;
    }
  }

  return {
    topic,
    region,
    score: topicScore + regionScore,
    reasons,
  };
}

export function classifyStockItem({ title = "", link = "" }, tickers = []) {
  const titleOnly = String(title ?? "");
  const textLower = `${title} ${link}`.toLowerCase();
  const tickerSet = new Set((tickers ?? []).map((t) => String(t).toUpperCase()));
  const foundTickers = new Set();
  const reasons = [];

  const patterns = [/\$([A-Z]{1,5})\b/g, /\(([A-Z]{1,5})\)/g, /\b([A-Z]{1,5}):/g];
  for (const re of patterns) {
    for (const m of titleOnly.matchAll(re)) {
      const tk = m[1]?.toUpperCase();
      if (!tk || !tickerSet.has(tk)) continue;
      foundTickers.add(tk);
      reasons.push(`ticker:${tk}`);
    }
  }

  const hasEarnings = hasAnyKeyword(textLower, STOCK_EVENT_KEYWORDS.earnings);
  const hasPriceAction = hasAnyKeyword(textLower, STOCK_EVENT_KEYWORDS.priceAction);
  const hasFilings = hasAnyKeyword(textLower, STOCK_EVENT_KEYWORDS.filings);

  if (hasEarnings) reasons.push("event:earnings");
  if (hasPriceAction) reasons.push("event:price_action");
  if (hasFilings) reasons.push("event:filings");

  return {
    tickers: [...foundTickers],
    hasEarnings,
    hasPriceAction,
    hasFilings,
    score:
      foundTickers.size * 2 +
      (hasEarnings ? 1 : 0) +
      (hasPriceAction ? 1 : 0) +
      (hasFilings ? 1 : 0),
    reasons,
  };
}
