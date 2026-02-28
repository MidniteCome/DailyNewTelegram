/**
 * llm.mjs — LLM 点评模块
 *
 * 自动识别新闻类型，切换对应的分析师提示词：
 *   AI_RESEARCH   → AI/研究论文视角
 *   FINANCE       → 投融资/IPO/并购视角
 *   MACRO         → 宏观市场/美联储视角
 *   TECH          → 通用科技产品视角（兜底）
 *
 * 后端优先级：
 *   1. Groq  — 设置 GROQ_API_KEY 即自动启用（云端，GitHub Actions 可用）
 *   2. Ollama — 设置 OLLAMA_URL（本地，默认 http://localhost:11434）
 *
 * 启用：USE_LLM=true，并设置 GROQ_API_KEY 或 OLLAMA_URL
 */

const USE_LLM    = process.env.USE_LLM === "true";

// ── Groq 配置 ──
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? null;
const GROQ_MODEL   = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions";

// ── Ollama 配置（本地回退）──
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const LLM_MODEL  = process.env.LLM_MODEL  ?? "qwen2.5:7b";

const USE_GROQ = !!GROQ_API_KEY;

// ── 统一调用入口 ──────────────────────────────────────────────────────────────
async function callLLM(prompt, { temperature = 0.4, timeout = 90_000 } = {}) {
  if (USE_GROQ) {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature,
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`);
    return (await res.json()).choices?.[0]?.message?.content?.trim() ?? null;
  } else {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: false,
        options: { temperature, top_p: 0.9 },
      }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    return (await res.json()).response?.trim() ?? null;
  }
}

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
你的读者是对科技和投资感兴趣、但不一定有技术背景的普通人。
你的点评风格：先铺背景、再给洞察、最后点出风险或机会，语言直接、有见地、避免堆砌术语。

【反幻觉规则，必须严格遵守】
- 第一句必须用一句话介绍主角（公司/项目/机构）是谁、在做什么，帮读者建立背景
- 所有数据、数字、公司名称必须来自原文，不得自行添加
- 无法从原文判断的结论，用"尚待观察"或"原文未披露"代替
- 不要重复复述原文标题，从背景介绍开始写`;

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

// ─── 标题模糊度检测 ────────────────────────────────────────────────────────

/**
 * 判断标题是否模糊（无公司名、数字、专有名词或缩写）。
 * 模糊标题将在翻译时同步用全文改写为更具信息量的英文标题。
 */
function isTitleVague(title) {
  const hasNumber     = /\d/.test(title);
  const hasProperNoun = /[A-Z][a-z]{2,}/.test(title); // 首字母大写词，如 Apple、OpenAI
  const hasAcronym    = /\b[A-Z]{2,}\b/.test(title);  // 全大写缩写，如 IPO、LLM、M&A
  const isLong        = title.length > 65;             // 长标题通常已足够具体
  return !hasNumber && !hasProperNoun && !hasAcronym && !isLong;
}

// ─── 批量标题翻译（含模糊标题改写）──────────────────────────────────────────

/**
 * 批量处理标题：
 *   - 清晰标题 → 直接翻译为中文，写入 article.titleZh
 *   - 模糊标题 → 根据全文改写英文标题写入 article.titleEn，再翻译写入 article.titleZh
 * 每批最多 30 条，一次 LLM 调用，零额外请求
 * @param {Array} articles  带 title / fullText? / summary? 字段的文章数组（原地修改）
 */
export async function translateTitles(articles) {
  if (!USE_LLM || !articles.length) return;

  const BATCH = 30;
  const total = articles.length;
  const backend = USE_GROQ ? `Groq/${GROQ_MODEL}` : `Ollama/${LLM_MODEL}`;
  console.log(`🌐 翻译标题（共 ${total} 篇，批次 ${BATCH}，后端: ${backend}）…`);

  for (let start = 0; start < total; start += BATCH) {
    const batch = articles.slice(start, start + BATCH);

    // 为模糊标题附加摘要上下文，帮助 LLM 改写
    // 注意：批内用局部编号 1..N，避免 LLM 在看到大数字时自行从 1 重排
    const numbered = batch.map((a, i) => {
      const num = i + 1;  // 局部编号，每批从 1 开始
      if (isTitleVague(a.title)) {
        const ctx = (a.fullText ?? a.summary ?? "")
          .slice(0, 400).replace(/\s+/g, " ").trim();
        return ctx
          ? `${num}. ${a.title}\n   [context] ${ctx}`
          : `${num}. ${a.title}`;
      }
      return `${num}. ${a.title}`;
    }).join("\n");

    const prompt =
`You are a professional news headline editor and translator.

There are ${batch.length} headlines below, numbered 1 to ${batch.length}. Process EACH one independently. Do NOT mix up translations between headlines.

For each numbered headline, do ONE of the following:

A) If the headline is already specific (contains a company name, number, or proper noun):
   → Translate it to Chinese only (≤25 characters).
   Output format: N. 中文翻译

B) If the headline is vague (no real subject or outcome):
   → Rewrite in English using [context], then translate.
   ✓ Good: "3. Stripe Acquires Stablecoin Startup Bridge for $1.1B | Stripe以11亿美元收购稳定币初创公司Bridge"
   ✗ Bad:  "3. A fintech deal closed today | 一笔金融科技交易今日完成"

Output ONLY ${batch.length} lines, one per headline, no extra text.

${numbered}

Output:`;

    try {
      const text = await callLLM(prompt, { temperature: 0.1, timeout: 120_000 }) ?? "";

      // 解析：使用局部编号 (1..batch.length)，全局索引 = start + localIdx
      let mismatchCount = 0;
      for (const line of text.split("\n")) {
        const m = line.match(/^(\d+)\.\s*(.+)/);
        if (!m) continue;
        const localIdx = parseInt(m[1], 10) - 1;   // 局部 0-based
        if (localIdx < 0 || localIdx >= batch.length) continue;
        const globalIdx = start + localIdx;         // 全局 0-based
        const content = m[2].trim();

        if (content.includes(" | ")) {
          // 模糊标题：改写英文 | 中文翻译
          const [en, zh] = content.split(" | ").map(s => s.trim());
          const zhOk = zh && zh.length >= 2 && zh.length <= 60 && /[\u4e00-\u9fff]/.test(zh);
          const enOk = en && !/[\u4e00-\u9fff]/.test(en); // 英文改写中不应含中文字符
          if (zhOk) {
            articles[globalIdx].titleZh = zh;
            if (enOk) articles[globalIdx].titleEn = en;
            // else: LLM 误将中文放入 en 位置，只保留 zh，titleEn 保持原值（或不设）
          } else {
            mismatchCount++;
          }
        } else {
          // 清晰标题：仅中文翻译（必须包含至少一个中文字符）
          if (/[\u4e00-\u9fff]/.test(content) && content.length <= 60) {
            articles[globalIdx].titleZh = content;
          } else {
            mismatchCount++;
          }
        }
      }
      if (mismatchCount > 0) {
        console.warn(`    ⚠️  ${mismatchCount} 条翻译校验未通过，已跳过`);
      }

      const rewriteCount = batch.slice(0, BATCH)
        .filter((_, i) => articles[start + i]?.titleEn).length;
      const label = rewriteCount > 0 ? `（含 ${rewriteCount} 条改写）` : "";
      console.log(`    批次 ${start + 1}–${Math.min(start + BATCH, total)} 完成 ${label}`);
    } catch (err) {
      console.warn(`  翻译批次 ${start + 1}–${Math.min(start + BATCH, total)} 跳过（${err.message}）`);
    }
  }
}

// ─── 主函数 ────────────────────────────────────────────────────────────────

export async function summarize(article) {
  if (!USE_LLM) return null;

  const type   = detectType(article);
  const prompt = PROMPTS[type](
    article.title,
    article.summary?.slice(0, 500) ?? ""
  );

  try {
    const output = await callLLM(prompt, { temperature: 0.4 });
    const backend = USE_GROQ ? "Groq" : "Ollama";
    console.log(`    [${backend}/${type}] ${article.title.slice(0, 40)}…`);
    return output;
  } catch (err) {
    console.warn(`  LLM 跳过（${err.message}）`);
    return null;
  }
}
