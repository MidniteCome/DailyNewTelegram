/**
 * llm.mjs — LLM 摘要/点评接口（预留，暂未启用）
 *
 * 启用方式（未来接入本地 Qwen2.5）：
 *   1. 启动 Ollama：ollama serve
 *   2. 拉取模型：ollama pull qwen2.5
 *   3. 设置环境变量：OLLAMA_URL=http://localhost:11434  USE_LLM=true
 */

const USE_LLM = process.env.USE_LLM === "true";
const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://localhost:11434";
const LLM_MODEL = process.env.LLM_MODEL ?? "qwen2.5";

/**
 * 为单篇文章生成 LLM 点评
 * @param {object} article  { title, summary }
 * @returns {Promise<string|null>}  点评文字，或 null（未启用时）
 */
export async function summarize(article) {
  if (!USE_LLM) return null;

  const prompt =
    `请用1-2句中文简明点评以下新闻的核心价值或影响：\n` +
    `标题：${article.title}\n` +
    `摘要：${article.summary?.slice(0, 400) ?? ""}`;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: LLM_MODEL, prompt, stream: false }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const json = await res.json();
    return json.response?.trim() ?? null;
  } catch (err) {
    console.warn(`  LLM 跳过（${err.message}）`);
    return null;
  }
}
