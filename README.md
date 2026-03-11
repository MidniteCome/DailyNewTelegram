# DailyNewTelegram

Automated daily news + podcast pipeline:
- Fetches configured feeds
- Ranks and summarizes content
- Pushes Top stories to Telegram
- Publishes static site output under `docs/`

## Runtime
- Node.js 20 (GitHub Actions)
- ESM scripts (`scripts/*.mjs`)

## Required Secrets (GitHub Actions)
- `BOT_TOKEN`: Telegram bot token
- `TG_CHAT_ID`: target Telegram chat id
- `GROQ_API_KEY`: Groq API key (when `USE_LLM=true`)

## Workflows
- `daily-telegram-news` (`.github/workflows/main.yml`)
  - Scheduled daily at `07:30 UTC`
  - Supports manual run (`workflow_dispatch`) with optional `force=true`
- `podcast-update` (`.github/workflows/podcast.yml`)
  - Scheduled at `14:00 UTC` and `20:00 UTC`
  - Supports manual run

## Local Run
```bash
npm ci
node scripts/run.mjs            # normal mode
node scripts/run.mjs --force    # force rerun for test/debug
```

## Stability Notes
- Workflows use `npm ci` with lockfile for reproducible installs.
- Concurrency guards prevent overlapping runs in the same workflow.
- Manual rerun is preserved for testing.

## Troubleshooting
- If Telegram send fails: verify `BOT_TOKEN` and `TG_CHAT_ID`.
- If LLM fails: verify `GROQ_API_KEY` or set `USE_LLM=false`.
- If feed failures rise: inspect `.feed-health.json`.
