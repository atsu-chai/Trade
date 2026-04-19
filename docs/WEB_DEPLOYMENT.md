# Web管理画面URLの作成手順

Web管理画面はVercelで公開します。

## 1. VercelでGitHubリポジトリをImport

Vercelで以下を選びます。

```text
Add New Project
→ Import Git Repository
→ atsu-chai/Trade
```

## 2. Project Settings

必ずRoot Directoryを `web` にします。

```text
Framework Preset: Next.js
Root Directory: web
Build Command: npm run build
Install Command: npm install
Output Directory: .next
```

## 3. Environment Variables

Vercel Project Settings → Environment Variables に設定します。

```text
NEXT_PUBLIC_SUPABASE_URL=https://brdlwwoyunxvigkaxhav.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=Supabaseのanon public key
NEXT_PUBLIC_SITE_URL=https://Vercelで発行されたURL
```

`NEXT_PUBLIC_SITE_URL` は初回デプロイ後にVercel URLが分かってから設定して、再デプロイしてください。

## 4. Supabase Auth Redirect URL

Supabase Dashboardで以下を追加します。

```text
Authentication
→ URL Configuration
→ Site URL: https://Vercelで発行されたURL
→ Redirect URLs:
  https://Vercelで発行されたURL/auth/callback
  http://localhost:3000/auth/callback
```

## 5. 確認URL

デプロイ後、以下で確認します。

```text
https://Vercelで発行されたURL/login
https://Vercelで発行されたURL/dashboard
https://Vercelで発行されたURL/api/health
```

`/api/health` が以下を返せばWebアプリは起動しています。

```json
{
  "ok": true,
  "service": "trade-signal-web"
}
```

## 6. 独自ドメインを使う場合

Vercel Project Settings → Domains で設定します。

独自ドメインを使った場合も、Supabase AuthのSite URLとRedirect URLsを独自ドメインに更新してください。

