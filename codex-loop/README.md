# Codex analysis loop worker

This worker runs on a Mac or persistent server where Codex is installed and logged in. It does not run on Vercel or Supabase Edge Functions.

The web app inserts a queued job from `/loop`. This worker claims it, asks Codex app-server to research the web three times, and stores the evidence and affordable share count in Supabase.

## Start

```bash
cd codex-loop
set -a
source .env
set +a
npm run start
```

Use `npm run once` to process at most one queued run and exit.

Required secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional:

- `CODEX_BIN`: Codex executable path. Defaults to `codex`.
- `CODEX_MODEL`: model override. Empty uses the Codex default.
- `LOOP_POLL_INTERVAL_MS`: queue polling interval.
- `LOOP_TURN_TIMEOUT_MS`: timeout per iteration.

The worker only researches and records candidates. It never places an order with SBI Securities.

## Keep it running on this Mac

1. Create `codex-loop/.env` from `.env.example` and set the real service role key. This file is ignored by Git.
2. Confirm `CODEX_BIN=/Applications/ChatGPT.app/Contents/Resources/codex` in `.env`.
3. Install the LaunchAgent:

```bash
cp codex-loop/com.trade.codex-loop.plist.example ~/Library/LaunchAgents/com.trade.codex-loop.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.trade.codex-loop.plist
launchctl kickstart -k gui/$(id -u)/com.trade.codex-loop
```

Logs are written to `/tmp/trade-codex-loop.log` and `/tmp/trade-codex-loop-error.log`.
