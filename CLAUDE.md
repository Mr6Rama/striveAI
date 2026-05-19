# StriveAI — Claude Code Configuration

## Product

**StriveAI MVP v2** — a 7-day AI execution agent for young builders: students, indie builders, young founders, creators, portfolio builders, and people developing skills or projects.

**Source of truth**: `docs/STRIVEAI_V2_PRODUCT_SPEC.md`

The product helps users execute today's specific step inside the app — not just generate a plan. Agent Mode is guided 3–5 micro-step execution, not a general chatbot.

---

## Hard Rules (always enforced)

### Security
- **NEVER print secrets**, API keys, tokens, or credential values in any output
- **NEVER commit `.env`** — it is gitignored; keep it that way
- **NEVER hardcode credentials** in source files — all secrets via `process.env.*`

### Code discipline
- Do what has been asked; nothing more, nothing less
- ALWAYS read a file before editing it
- Prefer editing existing files over creating new ones
- NEVER create documentation files unless explicitly requested
- NEVER save scripts or tests to the repo root — use `/scripts`, `/tests`, `/docs`
- Keep files under 500 lines; split if a file grows beyond that
- Keep changes small and reviewable — one logical change per commit
- Validate input at system boundaries

### After every change
- Run `npm run smoke` to verify the server starts and `/health` responds
- If tests exist, run them too: `npm test`
- Report changed files and any remaining risks

---

## Product Decisions (enforced in all code)

| Decision | Rule |
|---|---|
| Auth | Email/password only. Firebase Auth. **No Google, no social, no magic link.** |
| Accountability | Telegram only. **No email, no push notifications.** |
| Billing | None. Freemium. **No PayPal, no Stripe, no pricing screens, no pay intent.** |
| STEM mode | **Completely removed.** No STEM labels, prompts, routes, fallbacks, or UI. |
| AI chat | **No generic open-ended chatbot.** Agent Mode only — guided, task-scoped execution. |
| Agent Mode | 3–5 ordered micro-steps for today's specific task. Not a free-form chat. |
| Day 7 | Recap screen → user chooses: continue same goal (new 7-day run) or start a new track. |
| Data namespace | Fresh `sv2_*` keys. Do not write to `sa_*` v1 keys. Read them only for migration guard. |
| Deployment | Vercel. `vercel.json` required before any deploy. |
| AI backend | Existing Express proxy at `POST /api/openai/generate`. Reuse — do not replace. |
| Buddy accounts | Not in scope. |
| MCP | Not in scope. |

---

## Architecture: What to Keep vs Replace

### Keep (reuse, minimal changes)
- `backend/server.js` — AI proxy core: rate limiting, caching, JSON repair, retry logic
- `backend/utils/logger.js` — structured logger, clean, no product logic
- `frontend/services/auth.js` — email/password Firebase auth, no Google
- `frontend/core/store.js` — generic pub/sub state store
- `frontend/ui/router.js` — pushState router (remove `/billing` route)
- `firebase.json` — hosting config (public dir = `frontend/`)
- Vercel deployment structure

### Rewrite for v2
- `frontend/core/state-model.js` → v2 schema with `sv2_*` keys and 7-day track model
- `frontend/services/persistence.js` → use new v2 keys; keep dual-write pattern
- `frontend/services/ai.js` → v2 action prompts (track_generate, agent_steps, rescue_action, etc.)
- `frontend/domain/plan-engine.js` → replace stage/milestone model with 7-day day-by-day track
- `frontend/domain/today-engine.js` → v2 action outcomes (done/blocked/skipped/missed/rescued)
- `frontend/app.js` → v2 product loop boot
- `frontend/index.html` → remove STEM/billing UI; add v2 screens
- `frontend/ui/pages/*` → rewrite for v2 screens

### Delete later (after v2 is stable)
- `frontend/script.js` — 11,560-line v1 monolith; superseded by `app.js` + modules
- `_design_tmp/` — scratch prototype, not served
- `chrome-extension/` — not in v2 scope
- PayPal constants and routes in `backend/server.js`
- `/api/notify/reminder` email route in `backend/server.js`

---

## File Layout

```
backend/
  server.js           ← Express server, AI proxy, API routes
  utils/logger.js     ← Structured logger
frontend/             ← Firebase hosting public dir
  index.html          ← Single SPA shell
  style.css
  app.js              ← Boot, auth, route dispatch (module system)
  script.js           ← LEGACY — do not extend; delete after v2 lands
  core/
    state-model.js    ← v2 schema + default factories
    store.js          ← pub/sub state store
    migrations.js     ← v1→v2 migration guard (read-only)
  domain/
    plan-engine.js    ← 7-day track model (rewrite)
    today-engine.js   ← Day outcome engine (rewrite)
  services/
    auth.js           ← Firebase email/password auth
    ai.js             ← AI action calls
    persistence.js    ← localStorage + Firestore dual-write
  ui/
    router.js         ← pushState router
    pages/
      onboarding.js
      today.js
      settings.js
      roadmap.js      ← rename to track.js in v2
docs/                 ← All spec documents
scripts/
  smoke.js            ← Smoke test (server start + /health check)
```

---

## v2 AI Actions

These must exist in the `AI_ACTIONS` set in `backend/server.js`:

```
track_generate   — build initial 7-day track from onboarding data
track_continue   — generate continuation track after Day 7
agent_steps      — generate 3–5 micro-steps for today's task
agent_hint       — inline hint for a stuck agent step
rescue_action    — generate rescue task for a blocked day
action_kit       — generate curated resources for today's task
day7_recap       — generate Day 7 reflection paragraph
adapt_day        — adapt tomorrow's task based on today's outcome
```

Full prompt specs in `docs/STRIVEAI_V2_AI_ACTIONS.md`.

---

## State Namespace

All v2 state lives under `sv2_*` localStorage keys, mirrored to Firestore `users/{uid}/kv/{key}`.

| Key | Domain |
|---|---|
| `sv2_user` | User profile (name, email, goal category, experience) |
| `sv2_track` | Active 7-day track |
| `sv2_today` | Current day's execution state |
| `sv2_history` | Outcome log, failure patterns, archived tracks |
| `sv2_telegram` | Telegram connection state |

Full schema in `docs/STRIVEAI_V2_STATE_MODEL.md`.

---

## Routes

| Route | Screen |
|---|---|
| `/` | Landing |
| `/auth` | Sign in |
| `/register` | Register |
| `/onboarding` | Onboarding (3 steps) |
| `/generating` | Track generating |
| `/today` | Today's Action (primary screen) |
| `/agent` | Agent Workspace |
| `/kit` | Action Kit |
| `/track` | 7-day track overview |
| `/history` | History log |
| `/settings` | Settings |
| `/recap` | Day 7 recap |

**Removed**: `/dashboard`, `/work`, `/goals`, `/notes`, `/analytics`, `/billing`, `/roadmap`, `/progress`

Full screen specs in `docs/STRIVEAI_V2_ROUTES_AND_SCREENS.md`.

---

## Environment Variables

Required for v2. All read via `process.env.*` in `backend/server.js`. See `.env.example` and `docs/SECURITY_NOTES.md`.

```
OPENAI_API_KEY
OPENAI_MODEL
FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID,
FIREBASE_STORAGE_BUCKET, FIREBASE_MESSAGING_SENDER_ID,
FIREBASE_APP_ID, FIREBASE_MEASUREMENT_ID
FIREBASE_SERVICE_ACCOUNT_JSON
TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_USERNAME
TELEGRAM_WEBHOOK_SECRET
CRON_SECRET
APP_BASE_URL
PORT
```

---

## Scripts

```bash
npm start          # Production: node backend/server.js
npm run dev        # Dev with auto-reload: node --watch backend/server.js
npm run smoke      # Start server, hit /health, exit 0 or 1
```

---

## Agent Coordination

Named agents coordinate via `SendMessage`, not polling or shared state.

```
Lead ←→ architect ←→ coder ←→ tester ←→ reviewer
```

Spawn ALL agents in one message with `run_in_background: true`. After spawning: stop, tell the user what is running, wait for results. Never poll.

### When to use multiple agents
- YES: 3+ files touched, new feature, cross-module refactor, API change, security work
- NO: single-file edit, 1–2 line fix, doc update, config change, questions

### Agent types for this repo

| Task | Agents |
|---|---|
| Bug fix | researcher → coder → tester |
| Feature | architect → coder → tester → reviewer |
| Refactor | architect → coder → reviewer |
| Security | security-architect → auditor |
| AI prompts | researcher → coder |
