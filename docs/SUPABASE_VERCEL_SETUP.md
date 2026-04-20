# Supabase + Vercel セットアップ手順

この手順は `AGENTS.md` の方針に沿って、Google Cloud OAuthを使わずに Email OTP / Magic Link で運用するためのものです。

## 0. Supabase CLIをセットアップする

このMac環境では `brew` / `supabase` / `docker` が未インストールでした。

Supabase CLIは、Node.js 20以上を入れて `npx supabase` として実行するのが手軽です。`npm install -g supabase` は公式に非推奨/非対応なので使いません。

1. Node.js 20以上をインストール

   公式サイトからmacOS Installerを入れてください。

   ```text
   https://nodejs.org/
   ```

2. ターミナルを開き直して確認

   ```bash
   node --version
   npm --version
   ```

3. このリポジトリでSupabase CLIを確認

   ```bash
   cd /Users/ooshitaatsushinin/program/trade
   npx supabase --version
   ```

4. Supabaseへログイン

   ```bash
   npx supabase login
   ```

5. プロジェクトとリンク

   ```bash
   npx supabase init
   npx supabase link --project-ref brdlwwoyunxvigkaxhav
   ```

Dockerは `supabase start` でローカルSupabase一式を起動する場合に必要です。今回のようにリモートSupabaseへSecrets設定・Edge Functionデプロイだけを行う場合、まずはNode.js + `npx supabase` で進められます。

## 1. SupabaseにSQLを適用する

Supabase DashboardのSQL Editorで以下を順番に実行します。

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_schedule_signal_bot.sql` は中のコメントを編集してから実行
3. `supabase/migrations/003_mvp_completion.sql`

`002_schedule_signal_bot.sql` は `REPLACE_WITH_RUN_SIGNAL_BOT_SECRET` を実値に置き換えてください。

## 2. 利用メールを許可する

Email OTPでログインできるメールを `allowed_emails` に登録します。

```sql
insert into public.allowed_emails (email)
values ('YOUR_EMAIL@example.com')
on conflict (email) do nothing;
```

## 3. Supabase AuthをEmail OTPにする

Supabase Dashboardで以下を確認します。

- Authentication → Providers → Email を有効化
- Magic Link / OTP を有効化
- Site URL にVercel URLを設定
- Redirect URLs に以下を追加

```text
http://localhost:3000/auth/callback
https://YOUR_VERCEL_DOMAIN.vercel.app/auth/callback
```

## 4. Edge FunctionのSecretsを設定する

Supabase CLIで設定します。

`SUPABASE_` で始まる環境変数名はSupabase側の予約名なので、`npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...` は実行しません。Edge FunctionではSupabaseが用意する `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` を参照します。

```bash
RUN_SIGNAL_BOT_SECRET=$(openssl rand -hex 32)

supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=...
supabase secrets set LINE_TO_USER_ID=...
supabase secrets set RUN_SIGNAL_BOT_SECRET="$RUN_SIGNAL_BOT_SECRET"
```

`LINE_CHANNEL_ACCESS_TOKEN` と `LINE_TO_USER_ID` は必ず実値を入れてください。日本語の説明文をそのまま入れると正常に動きません。値に空白や記号がある場合はクォートします。

`npx` でCLIを使う場合は以下のように実行します。

```bash
npx supabase secrets set LINE_CHANNEL_ACCESS_TOKEN="実際のLINEチャネルアクセストークン"
npx supabase secrets set LINE_TO_USER_ID="実際のLINEユーザーID"
npx supabase secrets set RUN_SIGNAL_BOT_SECRET="$RUN_SIGNAL_BOT_SECRET"
```

既定ではYahoo Financeの日足データを使います。J-Quants認証情報は不要です。明示する場合は以下を設定します。

```bash
npx supabase secrets set MARKET_DATA_PROVIDER="yahoo"
```

J-Quants APIを使う場合だけ、Supabase SecretsにProviderとJ-Quants認証情報を設定します。

```bash
npx supabase secrets set MARKET_DATA_PROVIDER="jquants"
```

常時運用ではメールアドレスとパスワードを使う構成が扱いやすいです。

```bash
npx supabase secrets set JQUANTS_EMAIL="J-Quantsのメールアドレス"
npx supabase secrets set JQUANTS_PASSWORD="J-Quantsのパスワード"
```

リフレッシュトークンを使う場合は以下です。ただし有効期限があるため、期限切れ時は更新が必要です。

```bash
npx supabase secrets set JQUANTS_REFRESH_TOKEN="J-Quantsのリフレッシュトークン"
```

デモ用サンプルデータに戻す場合だけ以下を設定してください。

```bash
npx supabase secrets set MARKET_DATA_PROVIDER="sample"
```

## 5. Edge Functionをデプロイする

```bash
supabase functions deploy run-signal-bot --no-verify-jwt
supabase functions deploy test-line --no-verify-jwt
```

`npx` でCLIを使う場合:

```bash
npx supabase functions deploy run-signal-bot --no-verify-jwt
npx supabase functions deploy test-line --no-verify-jwt
```

手動テスト:

```bash
curl -X POST \
  https://brdlwwoyunxvigkaxhav.supabase.co/functions/v1/run-signal-bot \
  -H 'x-bot-secret: YOUR_RUN_SIGNAL_BOT_SECRET'
```

LINEだけをテスト:

```bash
curl -X POST \
  https://brdlwwoyunxvigkaxhav.supabase.co/functions/v1/test-line \
  -H 'x-bot-secret: YOUR_RUN_SIGNAL_BOT_SECRET'
```

任意メッセージでテスト:

```bash
curl -X POST \
  https://brdlwwoyunxvigkaxhav.supabase.co/functions/v1/test-line \
  -H 'x-bot-secret: YOUR_RUN_SIGNAL_BOT_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"message":"LINE通知テストです"}'
```

## 6. Vercelへ環境変数を設定する

Vercel Project Settings → Environment Variables:

```text
NEXT_PUBLIC_SUPABASE_URL=https://brdlwwoyunxvigkaxhav.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SITE_URL=https://YOUR_VERCEL_DOMAIN.vercel.app
RUN_SIGNAL_BOT_SECRET=...
```

Web画面はAnonキー + RLSで動きます。Service role keyはVercelのブラウザ側に出さないでください。
`RUN_SIGNAL_BOT_SECRET` はWeb画面の「設定」からBot手動実行とLINEテストを呼ぶためにVercelサーバー側だけで使います。

## 7. Vercelにデプロイする

VercelでGitHubリポジトリをImportし、Root Directoryを `web` にします。

```text
Framework Preset: Next.js
Root Directory: web
Build Command: npm run build
Output Directory: .next
```

## 8. 現時点の制限

- Edge Functionの株価データはまだサンプル生成です。
- 実運用前に実データProviderへ差し替えてください。
- Googleログインは使いません。
- LINE通知は `should_notify = true` のシグナルだけ送信します。

## 9. MVP画面

```text
/dashboard       ダッシュボード
/stocks          銘柄管理
/stocks/[id]     銘柄詳細、チャート、指標、編集
/signals         シグナル履歴
/backtest        バックテスト
/notifications   LINE通知履歴
/runs            Bot実行履歴
/settings        手動実行、LINEテスト、設定確認
```
