# StriveAI v2

**7-day AI execution agent for builders.**
StriveAI is not just a planner. It generates a 7-day execution track, gives one
concrete daily action, guides execution inside the product with Agent Mode,
checks Proof of Progress, runs a Rescue Action when the user is blocked, and
adapts the next day based on what actually happened.

This is a focused MVP. **No billing, no STEM mode, no generic AI chatbot,
no Google/social auth, no email notifications.** See `CLAUDE.md` for the
full list of enforced product decisions.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla ES modules, bundled by esbuild into `frontend/bundle.js` |
| Backend | Node.js + Express (AI proxy, Telegram, cron) |
| Auth | Firebase Auth — email/password only (no Google, no magic link) |
| Database | Firestore (`users/{uid}/kv/{sv2_*}`) + localStorage mirror |
| AI | OpenAI via `POST /api/openai/generate` proxy |
| Deployment | Vercel (serverless Node) — canonical |
| Notifications | Telegram Bot (optional accountability ping) |
| Design system | Paper/editorial: warm cream surface, ink text, one Strive blue accent |

---

## Local development

```bash
npm install
cp .env.example .env   # fill in real values; never commit .env
npm run build          # bundle frontend/app.js → frontend/bundle.js
npm run dev            # backend with node --watch
```

Open `http://localhost:3000`.

```bash
npm run smoke          # health check: server start + /health
npm start              # production mode
npm run build          # re-bundle the frontend after JS changes
```

The frontend is a single-page app bundled via esbuild (`npm run build` →
`frontend/bundle.js`). Re-run `npm run build` after editing files under
`frontend/app.js`, `frontend/core/`, `frontend/domain/`, `frontend/services/`,
or `frontend/ui/`.

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
This is the Vercel Hobby plan limit (one daily job only). All connected users
receive their daily ping at 09:00 UTC — per-user timezones are not implemented.
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
  index.html          ← SPA shell. Loads /style.css + /bundle.js into #app-v2.
  style.css           ← Paper/editorial design system + page styles
  app.js              ← v2 boot, auth, state, route dispatch (bundled by esbuild)
  core/
    state-model.js    ← sv2_* schema and default factories
    store.js          ← pub/sub state store
    migrations.js     ← v1 → v2 read-only migration guard
  domain/
    today-engine.js   ← v2 engine: rollover, pattern analysis, adapt trigger
    plan-engine.js    ← v1 leftover (no longer referenced at runtime)
  services/
    auth.js           ← Firebase email/password auth
    ai-v2.js          ← v2 AI action calls with fallbacks (active)
    ai.js             ← v1 leftover (no longer referenced at runtime)
    persistence.js    ← localStorage + Firestore dual-write under sv2_*
  ui/
    router.js         ← pushState router with V2_ROUTES allowlist
    pages/            ← one file per route (see “v2 routes” table below)

backend/
  server.js           ← Express: AI proxy, Telegram bot, cron, auth middleware
  utils/logger.js     ← Structured logger

docs/
  STRIVEAI_V2_PRODUCT_SPEC.md       ← product decisions
  STRIVEAI_V2_ROUTES_AND_SCREENS.md ← per-route screen specs
  STRIVEAI_V2_STATE_MODEL.md        ← sv2_* data schema
  STRIVEAI_V2_AI_ACTIONS.md         ← AI action prompts and fallbacks
  STRIVEAI_V2_TELEGRAM_SPEC.md      ← Telegram bot + ping flow
  SECURITY_NOTES.md                 ← credential rotation guide
  V2_BACKEND_AUTH.md                ← Firebase Admin token verification
  LEGACY_NOTES.md                   ← v1 code still on disk + cleanup tracker
  FRONTEND_CANONICAL_DIR.md         ← frontend/ is the only frontend dir
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

Defined in `frontend/ui/router.js`. Any path not in this allowlist is
rewritten to `/not-found`.

| Route | Screen | Purpose |
|---|---|---|
| `/landing` | Landing | Product-native marketing front door |
| `/auth` | Sign in / Create account | Email + password (Firebase Auth) |
| `/onboarding` | Onboarding | 8-step setup: goal → blocker → intensity → if-then → Telegram → escalation → confirm |
| `/confirm-track` | Confirm track | Minimal stub. Currently overlaps with `/plan-preview`. |
| `/plan-preview` | Plan preview | Setup summary + Day 1 hero + Day 2–7 outline |
| `/today` | Today's Action | Primary daily screen. Action card + Start with Agent / Action Kit / Proof / Blocked / Skip |
| `/agent` | Agent Mode | 3–5 ordered micro-steps, per-step note, end-of-session proof |
| `/action-kit` | Action Kit | AI-generated templates, questions, tips for today's task |
| `/proof` | Proof of Progress | Submit text / link / statement → AI verdict (met / partial / not-met) |
| `/blocked` | Blocked / Skipped | Reason picker → AI Rescue Action → Mark Rescued / Accept Missed |
| `/progress` | Progress | 7-day timeline + stats + failure pattern summary |
| `/recap` | Day 7 Recap | Results grid, AI reflection, Continue same goal / Start new track |
| `/settings` | Settings | Email, experience, Telegram connect/disconnect, sign out |
| `/not-found` | 404 | Fallback for any unknown route |

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

See `docs/LEGACY_NOTES.md` for the full v1 cleanup tracker.

Short list:
- `frontend/script.js` (v1 monolith, ~500 KB) is still on disk but **no longer loaded** — `index.html` mounts `bundle.js` into `#app-v2`. The file can be deleted once nothing else in the repo references it (currently only `frontend/services/ai.js` and `frontend/domain/plan-engine.js` link back to v1, and they are also unreferenced at runtime).
- Telegram cron fires at 09:00 UTC for all users. Per-user timezone scheduling requires a Vercel Pro plan (multiple cron jobs) or an external scheduler.
- `/confirm-track` route exists but overlaps with `/plan-preview`. Pick one; the other should be removed.
- Onboarding is 8 steps. Compressing to 5 by deferring Telegram + Escalation + If-Then to Settings is a known improvement.
- `/settings` exposes only email, experience level, and Telegram connect/disconnect. Daily intensity, ping hour, escalation rule, and if-then rules captured in onboarding cannot yet be edited.
- `agent_hint` is allowlisted on the backend but not yet called from the v2 client (`frontend/services/ai-v2.js`).
- No automated tests yet. `npm run smoke` is the only check.
