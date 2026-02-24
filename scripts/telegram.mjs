/**
 * telegram.mjs — Telegram 消息发送模块
 */

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.TG_CHAT_ID;

function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** 发送单条 Telegram HTML 消息 */
async function sendOne(text) {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  const json = await res.json();
  if (!json.ok) throw new Error(`Telegram error: ${JSON.stringify(json)}`);
}

/** 超长消息分块发送（Telegram 单条上限 4096 字符） */
async function sendChunked(text, limit = 4000) {
  if (text.length <= limit) {
    await sendOne(text);
    return;
  }
  const lines = text.split("\n");
  let chunk = "";
  for (const line of lines) {
    if ((chunk + "\n" + line).length > limit) {
      await sendOne(chunk.trim());
      chunk = line;
    } else {
      chunk = chunk ? chunk + "\n" + line : line;
    }
  }
  if (chunk.trim()) await sendOne(chunk.trim());
}

/**
 * 将 Top N 文章格式化后推送到 Telegram
 * @param {Array}  topArticles  已排好序的 Top N 文章（含 score 字段）
 * @param {string} dateYmd      当日日期，如 "2026-02-23"
 * @param {string|null} siteUrl  网站 URL（可选，用于在消息末尾附链接）
 */
export async function pushToTelegram(topArticles, dateYmd, siteUrl = null) {
  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error("缺少环境变量 BOT_TOKEN 或 TG_CHAT_ID");
  }

  const lines = [
    `<b>📰 Daily News · ${escHtml(dateYmd)}</b>`,
    `<i>Top ${topArticles.length} stories of the day</i>`,
    "",
  ];

  for (let i = 0; i < topArticles.length; i++) {
    const a = topArticles[i];
    const num = i + 1;
    const title = escHtml((a.titleEn ?? a.title).replace(/\s+/g, " ").trim());
    const source = escHtml(a.sourceName);
    const time = a.pubDate.toISOString().slice(11, 16) + " UTC";

    lines.push(`<b>${num}. <a href="${a.link}">${title}</a></b>`);
    lines.push(`<i>${source} · ${time}</i>`);

    // 摘要（LLM 点评或原文摘要）
    if (a.llmComment) {
      lines.push(`💡 ${escHtml(a.llmComment)}`);
    } else if (a.summary) {
      const snippet = escHtml(a.summary.slice(0, 150));
      lines.push(snippet + (a.summary.length > 150 ? "…" : ""));
    }

    lines.push("");
  }

  if (siteUrl) {
    lines.push(`🌐 <a href="${siteUrl}">查看今日完整新闻列表</a>`);
  }

  await sendChunked(lines.join("\n"));
  console.log(`  ✓ Telegram 推送完成（${topArticles.length} 条）`);
}
