# StriveAI v2 — Security Notes

## Credential Status (as of audit)

| Status | Finding |
|---|---|
| `.env` in `.gitignore` | Yes — confirmed on line 2 |
| `.env` ever committed | No — git log shows no history for `.env` |
| Hardcoded API keys in source | None found — all credentials read from `process.env.*` |
| `.env.example` had real-looking values | Yes (Firebase project IDs, SMTP config) — replaced with placeholders |
| Firebase Web SDK values in JS | Not hardcoded — served from backend via `/api/config` |

---

## Action Required: Credential Rotation

### If you suspect any credential was ever exposed

**OpenAI API Key**
- Go to platform.openai.com → API keys → delete the old key → create a new one.
- Update `OPENAI_API_KEY` in your local `.env` and in Vercel project settings.
- The old key stops working immediately once deleted.

**Firebase Web Config**
- Firebase web API keys (`FIREBASE_API_KEY`) are intentionally semi-public — they are embedded in every Firebase web app. Security is enforced by Firebase Security Rules, not by keeping the key secret.
- If you believe your Firestore data was accessed without auth, audit Firestore Security Rules at Firebase Console → Firestore → Rules.
- Rotation of the web API key is possible but rarely necessary. Contact Firebase support if needed.

**Firebase Admin Service Account**
- If `FIREBASE_SERVICE_ACCOUNT_JSON` was ever exposed: Firebase Console → Project Settings → Service Accounts → select the key → Delete. Generate a new one.
- The old key is immediately invalidated.

**Telegram Bot Token**
- If `TELEGRAM_BOT_TOKEN` was exposed: open Telegram → @BotFather → `/revoke` → select your bot.
- This invalidates the old token instantly. Generate a new token and update env.

**CRON_SECRET / TELEGRAM_WEBHOOK_SECRET**
- These are random strings you generated. If exposed, generate new ones:
  ```
  openssl rand -hex 32
  ```
- Update in Vercel project settings. Update Telegram webhook registration if webhook is active.

---

## Required Environment Variables (v2)

Set all of these in Vercel project settings (and locally in `.env`).

### Core

| Variable | Description | Where to get it |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI API key for AI proxy | platform.openai.com → API keys |
| `OPENAI_MODEL` | Model ID for AI calls | e.g. `gpt-4o-mini`. Default if omitted. |
| `APP_BASE_URL` | Production URL of the app | e.g. `https://your-app.vercel.app` |

### Firebase Web (served to browser via `/api/config`)

| Variable | Description |
|---|---|
| `FIREBASE_API_KEY` | Firebase web API key |
| `FIREBASE_AUTH_DOMAIN` | `your-project-id.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_STORAGE_BUCKET` | `your-project-id.appspot.com` |
| `FIREBASE_MESSAGING_SENDER_ID` | Numeric sender ID |
| `FIREBASE_APP_ID` | Web app ID (`1:...:web:...`) |
| `FIREBASE_MEASUREMENT_ID` | Google Analytics ID (`G-...`), optional |

Get all of these at: Firebase Console → Project Settings → General → Your apps → SDK setup and configuration.

### Firebase Admin (backend Firestore writes)

| Variable | Description |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Full service account JSON as a single-line string |

Setup:
1. Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key" → download JSON
3. Minify the JSON to one line: `jq -c . service-account.json`
4. Paste the single-line JSON as the value of `FIREBASE_SERVICE_ACCOUNT_JSON`
5. Delete the downloaded JSON file — do not commit it

The service account needs these Firestore permissions: `roles/datastore.user` (read/write).

### Telegram Bot

| Variable | Description | How to get |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot API token | @BotFather → /newbot → copy token |
| `TELEGRAM_BOT_USERNAME` | Bot username (without @) | @BotFather → /mybots |
| `TELEGRAM_WEBHOOK_SECRET` | Random secret for webhook verification | `openssl rand -hex 32` |

Webhook registration (after Vercel deployment):
```
curl -X POST https://api.telegram.org/bot{TOKEN}/setWebhook \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.vercel.app/api/telegram/webhook",
    "secret_token": "{TELEGRAM_WEBHOOK_SECRET}"
  }'
```

Verify webhook:
```
curl https://api.telegram.org/bot{TOKEN}/getWebhookInfo
```

For local dev, Telegram webhook cannot reach localhost. Use long-polling mode instead (the server falls back to polling if `APP_BASE_URL` is `localhost`).

### Cron

| Variable | Description |
|---|---|
| `CRON_SECRET` | Random string. Sent as `Authorization: Bearer {CRON_SECRET}` by Vercel Cron |

Generate:
```
openssl rand -hex 32
```

The `/api/cron/telegram-pings` route rejects any request without this header.

---

## Vercel Environment Variable Setup

1. Go to Vercel dashboard → your project → Settings → Environment Variables.
2. Add each variable from the list above.
3. Set scope to `Production` + `Preview` for non-secret defaults; `Production` only for real credentials.
4. Do **not** use Vercel's "plain text" display for sensitive values — use the default encrypted storage.
5. After adding variables, redeploy for changes to take effect.

Vercel Cron setup (in `vercel.json`):
```json
{
  "crons": [
    {
      "path": "/api/cron/telegram-pings",
      "schedule": "0 9 * * *"
    }
  ]
}
```

The active schedule is `0 9 * * *` — one daily run at 09:00 UTC. This is the
Vercel Hobby plan limit (one cron job per project). Per-user timezone
scheduling is not implemented; all pings fire at the same UTC hour.

Vercel automatically sends `Authorization: Bearer {CRON_SECRET}` to the cron
path when `CRON_SECRET` is set in project settings.

---

## Local Development

1. Copy `.env.example` to `.env`:
   ```
   cp .env.example .env
   ```
2. Fill in real values. Never commit `.env`.
3. Run the server:
   ```
   npm run dev
   ```
4. Telegram pings will not work in local dev (no public URL for webhook). The server handles this gracefully — Telegram routes return `{ ok: false, reason: 'webhook_not_available_locally' }` when `APP_BASE_URL` contains `localhost`.

---

## Removed from v2 (no longer required)

The following were used in v1 and remain in `.env.example` only to prevent the current `server.js` from crashing during the transition. They are marked as legacy and will be deleted from the codebase in the v2 rewrite.

| Variable | Was used for | v2 status |
|---|---|---|
| `PAYPAL_CLIENT_ID` | PayPal billing | Removed — no billing in v2 |
| `PAYPAL_PLAN_PRO` | PayPal Pro plan ID | Removed |
| `PAYPAL_PLAN_TEAM` | PayPal Team plan ID | Removed |
| `PAYPAL_SDK_URL` | PayPal JS SDK URL | Removed |
| `SMTP_HOST` | Email notifications | Removed — Telegram replaces email |
| `SMTP_PORT` | Email SMTP port | Removed |
| `SMTP_USER` | SMTP username | Removed |
| `SMTP_PASS` | SMTP password | Removed |
| `SMTP_FROM` | Sender email address | Removed |

---

## Firestore Security Rules (required before production)

Current Firestore rules must enforce that users can only read/write their own `kv` documents. Minimum required rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/kv/{document} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Deploy via Firebase Console → Firestore → Rules, or via `firebase deploy --only firestore:rules`.

---

## Files That Must Never Be Committed

```
.env
firebase-service-account*.json
*-service-account.json
*.pem
*.p12
```

Add to `.gitignore` if any of these appear in the repo:
```
*service-account*.json
*.pem
*.p12
```
