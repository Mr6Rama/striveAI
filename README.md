# StriveAI v2

7-day AI execution agent for builders, founders, and creators.
Helps users execute a specific daily action — not just generate a plan.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla ES modules, no framework |
| Backend | Node.js + Express (AI proxy, Telegram, cron) |
| Auth | Firebase Auth — email/password only |
| Database | Firestore (`users/{uid}/kv/{sv2_*}`) + localStorage mirror |
| AI | OpenAI via `/api/openai/generate` proxy |
| Deployment | Vercel (serverless Node) |
| Notifications | Telegram Bot (optional) |

---

## Local development

```bash
npm install
# Copy and fill in environment variables
cp .env.example .env   # edit with real values
npm run dev            # auto-reload with node --watch
```

Open `http://localhost:3000`.

```bash
npm run smoke          # quick health check (server start + /health)
npm start              # production mode
```

---

## Environment variables

All required vars are in `.env.example`. Copy it to `.env` — never commit `.env`.

| Variable | Required | Notes |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `OPENAI_MODEL` | No | Default: `gpt-4o-mini` |
| `FIREBASE_API_KEY` … `FIREBASE_APP_ID` | Yes | Firebase web config (served to browser) |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes* | Firebase Admin — required for Telegram + cron. Routes return 503 without it. |
| `TELEGRAM_BOT_TOKEN` | Optional | Required to enable Telegram pings |
| `TELEGRAM_BOT_USERNAME` | Optional | Used to build the `/start` link |
| `TELEGRAM_WEBHOOK_SECRET` | Optional | Required to validate Telegram webhook requests |
| `CRON_SECRET` | Optional | Required to protect `/api/cron/telegram-pings` |
| `APP_BASE_URL` | Optional | Used when registering the Telegram webhook |
| `PORT` | No | Default: `3000` |

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Set all environment variables in **Vercel → Project → Settings → Environment Variables**.
4. The build is zero-config — `vercel.json` handles routing and the daily cron.

### Vercel cron

`vercel.json` schedules `/api/cron/telegram-pings` at `0 9 * * *` (09:00 UTC daily).
This is the Vercel Hobby plan limit (one daily job only).
The cron endpoint is protected by `CRON_SECRET` — set it in Vercel env vars.

### Firebase Hosting

`firebase.json` is present but **Firebase Hosting is not the active deployment path.**
Vercel is the canonical host. Firebase Hosting may be used as a CDN fallback but
requires a separate deploy pipeline and is not tested for this app.

---

## Telegram setup

1. Create a bot via [@BotFather](https://t.me/BotFather) — `/newbot`.
2. Copy the token to `TELEGRAM_BOT_TOKEN`.
3. Set `TELEGRAM_BOT_USERNAME` to your bot's username (without `@`).
4. Generate a webhook secret: `openssl rand -hex 32` → `TELEGRAM_WEBHOOK_SECRET`.
5. After deploy, register the webhook:
   ```
   POST https://api.telegram.org/bot<TOKEN>/setWebhook
   {
     "url": "https://your-app.vercel.app/api/telegram/webhook",
     "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
   }
   ```
6. Users connect from the app's onboarding Telegram step.

---

## Architecture

```
frontend/
  app.js              ← v2 boot, auth, route dispatch
  core/
    state-model.js    ← sv2_* schema and defaults
    store.js          ← pub/sub state store
  domain/
    today-engine.js   ← daily rollover, pattern analysis, adapt trigger
  services/
    auth.js           ← Firebase email/password auth
    ai-v2.js          ← v2 AI action calls with fallbacks
    persistence.js    ← localStorage + Firestore dual-write
  ui/
    router.js         ← pushState router
    pages/            ← one file per route

backend/
  server.js           ← Express: AI proxy, Telegram, cron, auth middleware
  utils/logger.js     ← Structured logger

docs/
  STRIVEAI_V2_PRODUCT_SPEC.md   ← product decisions
  STRIVEAI_V2_STATE_MODEL.md    ← data schema
  STRIVEAI_V2_AI_ACTIONS.md     ← AI prompt specs
  LEGACY_NOTES.md               ← v1 code still present + cutover checklist
  SECURITY_NOTES.md             ← credential rotation guide
```

### State namespace

All v2 state lives under `sv2_*` keys in localStorage and Firestore.
Do not read from or write to the old `sa_*` v1 keys.

| Key | Domain |
|---|---|
| `sv2_user` | User profile |
| `sv2_track` | Active 7-day track |
| `sv2_today` | Current day execution state |
| `sv2_history` | Outcome log, failure patterns, archived tracks |
| `sv2_telegram` | Telegram connection state |

---

## v2 routes

| Route | Screen |
|---|---|
| `/landing` | Landing |
| `/auth` | Sign in / Create account |
| `/onboarding` | 8-step onboarding |
| `/plan-preview` | 7-day track preview |
| `/today` | Today's Action (primary screen) |
| `/agent` | Agent Workspace — guided micro-steps |
| `/action-kit` | AI-generated task material |
| `/proof` | Proof of Progress |
| `/blocked` | Blocked / Skipped rescue flow |
| `/progress` | 7-day track grid + stats |
| `/recap` | Day 7 recap + continuation choice |
| `/settings` | Settings |

---

## Security notes

- All secrets are in environment variables — never in source code.
- `.env` is gitignored. `.env.example` has only placeholder values.
- Firebase Admin JSON is never logged or exposed to the frontend.
- The Telegram webhook validates `x-telegram-bot-api-secret-token` — rejects requests if the secret is not set.
- The cron endpoint returns 401 if `CRON_SECRET` is not configured.
- The AI endpoint has a rate limit: 20 requests per 15 minutes per IP.
- Firebase Admin routes return 503 (not 401) when the service account is missing, to distinguish a config error from an auth error.

See `docs/SECURITY_NOTES.md` for credential rotation procedures.

---

## Known limitations / next steps

See `docs/LEGACY_NOTES.md` for the full v1 cutover checklist.

Short list:
- `frontend/script.js` (v1 monolith) is still loaded by `index.html`. It runs the old product loop. The v2 app mounts into `#app-v2` which does not yet exist in `index.html`. **Cutover step**: add `<div id="app-v2">`, remove the `<script src="script.js">` tag, delete `script.js`.
- Telegram cron fires at 09:00 UTC for all users. Per-user timezone scheduling requires a Vercel Pro plan (multiple cron jobs) or an external scheduler.
- Action Kit usage is not tracked per history entry yet (`actionKits` stat is always 0 in Progress/Recap).
- `/confirm-track` page is a stub — onboarding currently navigates straight to `/plan-preview`.
