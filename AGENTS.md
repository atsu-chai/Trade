# AGENTS.md

## Project

- GitHub: https://github.com/atsu-chai/Trade
- Purpose: 日本株AIシグナルbot

## Supabase

- SUPABASE_URL: https://brdlwwoyunxvigkaxhav.supabase.co
- SUPABASE_ANON_KEY: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyZGx3d295dW54dmlna2F4aGF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1MzY1MjYsImV4cCI6MjA5MjExMjUyNn0.JtWJkia_Gxi7nPe6HOJ50pO0nbZ7BPgT5Or7sBBQN9E`
- SUPABASE_SERVICE_ROLE_KEY: Do not write the service role key into repository files. Store it in GitHub Actions Secrets, Vercel Environment Variables, or local `.env`.

Note: The value provided for `SUPABASE_SERVICE_ROLE_KEY` decodes as a token with `role: anon`, so it appears to be an anon key, not a service role key.

## Auth Direction

Google Cloud OAuth setup is not available, so do not depend on Google login for the next implementation.

Use an alternative authentication approach:

1. Supabase Email OTP / Magic Link for the Vercel web app.
2. Owner-only access by allowlisting the user's email in app settings or an `allowed_emails` table.
3. Keep bot execution server-side through Supabase Edge Functions or scheduled jobs using secrets.

## Implementation Direction

- Keep Vercel responsible for the web UI only.
- Keep Supabase responsible for Auth, PostgreSQL, scheduled execution, and LINE notification state.
- Do not place LINE tokens, Supabase service role keys, or other secrets in tracked files.
- Use environment variables for secrets:
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `LINE_CHANNEL_ACCESS_TOKEN`
  - `LINE_TO_USER_ID`

