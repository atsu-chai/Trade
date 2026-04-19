# 日本株AIシグナルbot MVP

Python標準ライブラリだけで動く、日本株シグナル監視MVPです。

## 現在できること

- 銘柄の追加、編集、削除
- CSV一括登録
- 通常監視 / 強監視 / 停止の管理
- 保有単価、保有株数、買い増し設定の管理
- J-Quants APIによる日足OHLCVデータ取得
  - 表示用の最新終値は通常の `Close` を使用
  - バックテストと指標も保存済み日足データから計算
- テクニカル指標計算
  - 5MA / 25MA / 75MA
  - RSI
  - MACD
  - ボリンジャーバンド
  - VWAP
  - 出来高急増率
- ルールベースのシグナル生成
  - 買い候補
  - 利確売り候補
  - 損切り候補
  - 見送り
  - データ不足
  - 監視停止
- スコア内訳と根拠表示
- LINE Messaging API送信口
- 通知履歴
- データ取得ログ

## 起動

```bash
python3 app/server.py
```

ブラウザで以下を開きます。

```text
http://127.0.0.1:8000
```

## LINE通知設定

`.env` または環境変数で以下を設定します。

```bash
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_TO_USER_ID=...
```

未設定の場合、通知は送信せず、通知履歴には `skipped` として記録されます。

## GitHub Actionsで無料運用する

このリポジトリには `.github/workflows/signal-bot.yml` を含めています。

GitHubへpushしたあと、リポジトリの `Settings` で以下を設定してください。

### Actions Secrets

`Settings` → `Secrets and variables` → `Actions` → `New repository secret` で追加します。

```text
LINE_CHANNEL_ACCESS_TOKEN
LINE_TO_USER_ID
```

### GitHub Pages

`Settings` → `Pages` で以下を選びます。

```text
Source: Deploy from a branch
Branch: main
Folder: /docs
```

定期実行後、`docs/index.html` が更新されます。

### 監視銘柄

GitHub Actionsで使う監視銘柄は `config/watchlist.csv` で管理します。

```csv
code,name,tags,memo,watch_status
7203,トヨタ自動車,"大型株,自動車",サンプル,normal
```

### 手動実行

GitHub上では `Actions` → `Stock Signal Bot` → `Run workflow` で手動実行できます。

ローカルでは以下で同じ処理を実行できます。

```bash
python3 app/runner.py --watchlist config/watchlist.csv --notify --export-report docs/index.html
```

## Supabase + Vercelで中期構成にする

Google Cloud OAuthは使わず、Supabase Email OTP / Magic Linkを使います。

追加済みの構成:

```text
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_schedule_signal_bot.sql
supabase/functions/run-signal-bot/index.ts
web/
```

セットアップ手順:

```text
docs/SUPABASE_VERCEL_SETUP.md
docs/WEB_DEPLOYMENT.md
docs/SPEC_COVERAGE.md
```

VercelではRoot Directoryを `web` にしてください。

ローカルでWebを動かすにはNode.js 20以上が必要です。

```bash
cd web
cp .env.example .env.local
npm install
npm run dev
```

LINE通知だけをテストする場合:

```bash
curl -X POST \
  https://brdlwwoyunxvigkaxhav.supabase.co/functions/v1/test-line \
  -H 'x-bot-secret: YOUR_RUN_SIGNAL_BOT_SECRET'
```

MVP画面:

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

## 実データ連携について

Supabase Edge Function版はJ-Quants APIの日足データを使います。Supabase Secretsに以下のいずれかを設定してください。

```bash
npx supabase secrets set JQUANTS_EMAIL="J-Quantsのメールアドレス"
npx supabase secrets set JQUANTS_PASSWORD="J-Quantsのパスワード"
```

または、J-Quantsの画面で取得したリフレッシュトークンを使う場合:

```bash
npx supabase secrets set JQUANTS_REFRESH_TOKEN="J-Quantsのリフレッシュトークン"
```

`JQUANTS_REFRESH_TOKEN` は有効期限があるため、常時運用では `JQUANTS_EMAIL` / `JQUANTS_PASSWORD` をSupabase Secretsに置く構成の方が安定します。

デモ用サンプルデータに戻す場合のみ、明示的に以下を設定します。

```bash
npx supabase secrets set MARKET_DATA_PROVIDER="sample"
```

## 免責

本システムは投資助言ではありません。表示内容は売買を推奨・保証するものではなく、最終判断は利用者本人が行ってください。
