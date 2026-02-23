/**
 * llm.mjs — LLM 点评模块
 *
 * 自动识别新闻类型，切换对应的分析师提示词：
 *   AI_RESEARCH   → AI/研究论文视角
 *   FINANCE       → 投融资/IPO/并购视角
 *   MACRO         → 宏观市场/美联储视角
 *   TECH          → 通用科技产品视角（兜底）
 *
 * 启用：USE_LLM=true OLLAMA_URL=http://localhost:11434 LLM_MODEL=qwen2.5:7b
 */

const USE_LLM   = process.env.USE_LLM === "true";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const LLM_MODEL  = process.env.LLM_MODEL ?? "qwen2.5:7b";

// ─── 新闻类型检测（规则匹配，不消耗 LLM token）────────────────────────────

const TYPE_RULES = {
  AI_RESEARCH: [
    "llm", "model", "benchmark", "training", "inference", "parameter",
    "transformer", "diffusion", "fine-tun", "open-source", "open source",
    "research", "paper", "arxiv", "deepmind", "openai", "anthropic",
    "agent", "reasoning", "multimodal", "rlhf", "alignment",
  ],
  FINANCE: [
    "ipo", "s-1", "f-1", "424b", "acquisition", "merger", "acqui",
    "funding", "raises", "series a", "series b", "series c", "valuation",
    "venture", "private equity", "buyout", "takeover", "spac",
    "invested", "investment round", "seed round",
  ],
  MACRO: [
    "fed", "fomc", "federal reserve", "cpi", "inflation", "interest rate",
    "rate hike", "rate cut", "treasury", "yield", "gdp", "payroll",
    "unemployment", "tariff", "trade war", "geopolit", "recession",
    "risk-on", "risk-off", "basis point",
  ],
};

function detectType(article) {
  const hay = `${article.title} ${article.summary} ${article.sourceName}`.toLowerCase();
  for (const [type, keywords] of Object.entries(TYPE_RULES)) {
    if (keywords.some(kw => hay.includes(kw))) return type;
  }
  return "TECH";
}

// ─── 提示词模板 ────────────────────────────────────────────────────────────

const SYSTEM_BASE = `你是一位资深科技投资分析师，擅长对科技与财经新闻做出简洁、准确的中文点评。
你的点评风格：直接、有见地、避免废话。

【反幻觉规则，必须严格遵守】
- 所有数据、数字、公司名称必须来自原文，不得自行添加
- 无法从原文判断的结论，用"尚待观察"或"原文未披露"代替
- 不要重复复述原文标题，直接给出分析`;

const PROMPTS = {

  AI_RESEARCH: (title, summary) => `${SYSTEM_BASE}

【新闻类型】AI / 技术研究

请基于以下新闻，用3-5句中文进行点评，覆盖：
① 核心技术突破是什么，与现有方案有何实质差异
② 对产业链（芯片、云厂商、应用层、竞品）的潜在影响
③ 此路线目前存在哪些未验证的风险或挑战（若原文有提及）

标题：${title}
摘要：${summary}

点评：`,

  FINANCE: (title, summary) => `${SYSTEM_BASE}

【新闻类型】投融资 / IPO / 并购

请基于以下新闻，用3-5句中文进行点评，覆盖：
① 这笔交易的核心逻辑（战略意图、技术壁垒、数据资产或市场份额）
② 对行业竞争格局的影响，谁受益、谁受压
③ Bull case 与 Bear case 各是什么（若数据不足请注明"尚待观察"）

标题：${title}
摘要：${summary}

点评：`,

  MACRO: (title, summary) => `${SYSTEM_BASE}

【新闻类型】宏观市场 / 美联储 / 地缘

请基于以下新闻，用3-5句中文进行点评，覆盖：
① 核心数据或决策对利率预期、风险资产的短期含义
② 与市场此前预期的偏差程度（若原文有提及）
③ 后续需要关注的关键指标或事件节点

标题：${title}
摘要：${summary}

点评：`,

  TECH: (title, summary) => `${SYSTEM_BASE}

【新闻类型】科技产品 / 行业动态

请基于以下新闻，用3-5句中文进行点评，覆盖：
① 这家公司或产品的核心差异化是什么
② 潜在的市场机会与竞争威胁
③ 值得持续追踪的信号（若原文信息有限，请如实说明）

标题：${title}
摘要：${summary}

点评：`,
};

// ─── 主函数 ────────────────────────────────────────────────────────────────

export async function summarize(article) {
  if (!USE_LLM) return null;

  const type   = detectType(article);
  const prompt = PROMPTS[type](
    article.title,
    article.summary?.slice(0, 500) ?? ""
  );

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.4,   // 偏保守，减少幻觉
          top_p: 0.9,
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const json   = await res.json();
    const output = json.response?.trim() ?? null;

    // 打印类型方便调试
    console.log(`    [LLM/${type}] ${article.title.slice(0, 40)}…`);
    return output;
  } catch (err) {
    console.warn(`  LLM 跳过（${err.message}）`);
    return null;
  }
}
