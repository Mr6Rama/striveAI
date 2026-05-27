# StriveAI v2

**28-day AI execution agent for builders.**  
StriveAI is not a planner. It generates an execution track (7-day Spark or
28-day Track), surfaces one concrete daily action, guides execution inside
the product with Agent Mode (3–5 micro-steps), checks Proof of Progress,
runs a Rescue Action when the user is blocked, adapts the next day based on
what actually happened, and delivers a weekly ship checkpoint on Track runs.

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

The frontend is a single-page app bundled via esbuild. Re-run `npm run build`
after editing any file under `frontend/app.js`, `frontend/core/`,
`frontend/domain/`, `frontend/services/`, or `frontend/ui/`.

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
  bundle.js           ← Build output (never edit by hand; rebuild with npm run build)
  app.js              ← v2 boot, auth, state, route dispatch (bundled by esbuild)
  core/
    state-model.js    ← sv2_* schema and default factories
    store.js          ← pub/sub state store
    migrations.js     ← v1 → v2 read-only migration guard
  domain/
    today-engine.js   ← rollover, pattern analysis, adapt trigger, pace warning
    morning-brief.js  ← contextual morning message builder
    streak.js         ← streak calculation
    plan-engine.js    ← v1 leftover (not referenced at runtime)
  services/
    auth.js           ← Firebase email/password auth
    ai-v2.js          ← v2 AI action calls + fallbacks
    ai-v2-coaching.js ← coaching AI actions: goal sharpening, step feedback, week recap, inline hint
    ai-v2-fallbacks.js← deterministic fallback data
    ai.js             ← v1 leftover (not referenced at runtime)
    persistence.js    ← localStorage + Firestore dual-write under sv2_*
  ui/
    router.js         ← pushState router with V2_ROUTES allowlist
    pages/            ← one file per route (see routes table below)

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
  FRONTEND_CANONICAL_DIR.md         ← frontend/ is the only frontend dir
```

### State namespace

All v2 state lives under `sv2_*` keys in localStorage and Firestore.
Do not read from or write to the old `sa_*` v1 keys.

| Key | Domain |
|---|---|
| `sv2_user` | User profile (goal, category, artifact target, experience) |
| `sv2_track` | Active track (Spark 7-day or Track 28-day with 4 phases) |
| `sv2_today` | Current day execution state (agent session, proof, rescue, blocker diagnosis) |
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
| `/onboarding` | Onboarding | 8-step setup: goal → sharpening → blocker → intensity → commitment (Spark/Track) → rest day → Telegram → generate |
| `/confirm-track` | Confirm track | Minimal stub (overlaps with `/plan-preview`; to be removed) |
| `/plan-preview` | Plan preview | Setup summary + Day 1 hero + Day 2–N outline |
| `/today` | Today's Action | Primary daily screen. Action card (with first-step preview) + Start with Agent / Action Kit / Proof / Blocked / Skip. Pace warning banner + weekly recap card. |
| `/agent` | Agent Mode | 3–5 ordered micro-steps, per-step note, inline step hint, end-of-session proof |
| `/action-kit` | Action Kit | AI-generated templates, questions, tips for today's task |
| `/proof` | Proof of Progress | Submit text / link / statement → AI verdict (met / partial / not-met) |
| `/blocked` | Blocked / Skipped | Reason picker → diagnosis (where stuck, what tried) → Rescue Action |
| `/progress` | Progress | Track timeline + stats + failure pattern summary + pace indicator |
| `/recap` | Recap | Results grid, AI reflection, artifact portfolio, Continue / Pivot / Pause |
| `/settings` | Settings | Email, experience, Telegram connect/disconnect, sign out |
| `/not-found` | 404 | Fallback for any unknown route |

---

## AI actions

All AI calls go through `POST /api/openai/generate`. The full action catalogue
is in `docs/STRIVEAI_V2_AI_ACTIONS.md`.

| Action | When | Module |
|---|---|---|
| `spark_generate` | Onboarding — Spark chosen | `ai-v2.js` |
| `track_generate_30` | Onboarding — Track chosen | `ai-v2.js` |
| `spark_to_track_extend` | Spark Recap → Continue to Track | `ai-v2.js` |
| `track_continue_30` | Track Recap → Extend +30 | `ai-v2.js` |
| `agent_steps` | `/agent` init | `ai-v2.js` |
| `agent_hint` | Inline step help in Agent Mode | `ai-v2-coaching.js` |
| `rescue_action` | `/blocked` diagnosis → rescue | `ai-v2.js` |
| `action_kit` | `/action-kit` generate | `ai-v2.js` |
| `v2_proof_check` | `/proof` submit + `/agent` end | `ai-v2.js` |
| `day7_recap` | `/recap` load | `ai-v2.js` |
| `adapt_day` | After any day outcome | `ai-v2.js` |
| `sharpen_goal` | Onboarding Step 7 — goal sharpening | `ai-v2-coaching.js` |
| `agent_step_feedback` | After each agent step note ≥10 chars | `ai-v2-coaching.js` |
| `week_recap` | After Day 7/14/21 completion on Track | `ai-v2-coaching.js` |

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

- `frontend/script.js` (v1 monolith) is still on disk but **not loaded** at runtime. Can be deleted once `frontend/services/ai.js` and `frontend/domain/plan-engine.js` (also unreferenced) are removed.
- Telegram cron fires at 09:00 UTC for all users. Per-user timezone scheduling requires a Vercel Pro plan.
- `/confirm-track` route exists but overlaps with `/plan-preview`. One should be removed.
- `/settings` exposes email, experience level, and Telegram connect/disconnect. Daily intensity, ping hour, and rest-day preference captured in onboarding cannot yet be edited from Settings.
- No automated tests yet. `npm run smoke` is the only check.
