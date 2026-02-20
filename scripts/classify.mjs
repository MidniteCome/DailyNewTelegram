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
};

const REGION_RULES = {
  CNHK: ["hkex", "hong kong", ".hk", "h-share", "a-share", "shanghai", "shenzhen"],
  SG: ["sgx", "singapore"],
  EU: ["lse", "london", "euronext", "frankfurt", "paris"],
  US: ["nasdaq", "nyse", "sec", "s-1", "f-1"],
};

const TOPIC_PRIORITY = ["IPO", "MA", "FINANCING"];
const REGION_PRIORITY = ["CNHK", "SG", "EU", "US"];

function containsKeyword(text, keyword) {
  return text.includes(keyword);
}

export function classifyItem({ title = "", link = "", pubDate = "", feedUrl = "" }) {
  const haystack = `${title} ${link} ${feedUrl} ${pubDate}`.toLowerCase();
  const reasons = [];

  const topicScores = new Map();
  for (const topic of TOPIC_PRIORITY) {
    const rules = TOPIC_RULES[topic];
    let score = 0;

    for (const kw of rules.strong) {
      if (containsKeyword(haystack, kw)) {
        score += 2;
        reasons.push(`topic:${topic}:strong:${kw}`);
      }
    }

    for (const kw of rules.weak) {
      if (containsKeyword(haystack, kw)) {
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

