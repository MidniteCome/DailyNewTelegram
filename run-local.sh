#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  本地运行脚本（带 Qwen2.5 LLM 点评）
#  用法：
#    ./run-local.sh          正常运行（今天已发则跳过）
#    ./run-local.sh --force  强制运行，忽略"今天已发"检查
# ─────────────────────────────────────────────────────────────

set -e

# ── 填入你的 Telegram 信息 ──────────────────────────────────
export BOT_TOKEN="8091409152:AAHwMLbS89TNOrBvrq5JBo6GxhpY5vGU_O8"
export TG_CHAT_ID="-1003759166821"

# ── LLM 配置（使用本地 Qwen2.5）──────────────────────────────
export USE_LLM="true"
export OLLAMA_URL="http://localhost:11434"
export LLM_MODEL="qwen2.5"

# ── 网站链接（可选）──────────────────────────────────────────
export SITE_URL="https://midnitecome.github.io/DailyNewTelegram/"

# ── 检查 Ollama 是否在运行 ────────────────────────────────────
echo "🔍 检查 Ollama 连接..."
if ! curl -s --max-time 3 "${OLLAMA_URL}/api/tags" > /dev/null 2>&1; then
  echo ""
  echo "❌ 无法连接到 Ollama（${OLLAMA_URL}）"
  echo "   请先启动 Ollama：ollama serve"
  echo "   或确认模型已下载：ollama pull ${LLM_MODEL}"
  exit 1
fi
echo "   ✓ Ollama 已就绪"
echo ""

# ── 运行 ─────────────────────────────────────────────────────
node scripts/run.mjs "$@"
