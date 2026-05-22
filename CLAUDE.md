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
- For code changes: run `npm run smoke` to verify the server starts and `/health` responds
- For frontend JS changes: run `npm run build` so `frontend/bundle.js` reflects the change
- If tests exist, run them too: `npm test`
- Documentation-only changes (`*.md`) do not require smoke unless `package.json` or scripts were touched
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

## Architecture: Current State

The v2 cutover at the HTML shell is done. `frontend/index.html` mounts
`frontend/bundle.js` into `<div id="app-v2">` and no longer loads
`frontend/script.js`. The v1 files still exist on disk but nothing at
runtime references them.

### Active v2 code (the product)
- `backend/server.js` — Express: AI proxy (`/api/openai/generate`), Telegram bot, cron, Firebase Admin middleware
- `backend/utils/logger.js` — structured logger
- `frontend/index.html` — SPA shell, single `<div id="app-v2">`
- `frontend/style.css` — paper/editorial design system + per-page styles
- `frontend/app.js` — v2 boot, auth, route dispatch, state wiring
- `frontend/core/state-model.js` — `sv2_*` schema and default factories
- `frontend/core/store.js` — pub/sub store
- `frontend/core/migrations.js` — v1 → v2 read-only migration guard
- `frontend/domain/today-engine.js` — rollover, pattern analysis, adapt trigger
- `frontend/services/auth.js` — Firebase email/password
- `frontend/services/ai-v2.js` — v2 AI action calls with deterministic fallbacks
- `frontend/services/persistence.js` — localStorage + Firestore dual-write under `sv2_*`
- `frontend/ui/router.js` — pushState router with `V2_ROUTES` allowlist
- `frontend/ui/pages/*.js` — one module per route
- `vercel.json` — canonical deployment config (daily cron `0 9 * * *`)
- `firebase.json` — kept as a record; Firebase Hosting is not the active host

### Inactive v1 leftovers (still on disk, not referenced at runtime)
- `frontend/script.js` (~500 KB v1 monolith) — `index.html` no longer loads it
- `frontend/services/ai.js` (v1 AI service) — only imports `plan-engine.js`
- `frontend/domain/plan-engine.js` (v1 roadmap/milestone model)
- `chrome-extension/` — not in v2 scope
- v1 AI actions inside `AI_ACTIONS` set in `backend/server.js` (`roadmap`, `tasks`, `chat`, etc.) — kept on the allowlist but the v2 client never calls them

These can be removed once any final cross-references are cleared.
See `docs/LEGACY_NOTES.md` for the cleanup tracker.

---

## File Layout

```
backend/
  server.js           ← Express: AI proxy, Telegram, cron, Firebase Admin middleware
  utils/logger.js     ← Structured logger
frontend/             ← Single canonical frontend dir (see docs/FRONTEND_CANONICAL_DIR.md)
  index.html          ← SPA shell: loads /style.css + /bundle.js into #app-v2
  style.css           ← Paper/editorial design system
  app.js              ← v2 boot, auth, state, route dispatch (bundled by esbuild)
  bundle.js           ← Build output (do not edit by hand; rebuild with `npm run build`)
  script.js           ← LEGACY v1 monolith — not loaded at runtime; do not extend
  core/
    state-model.js    ← sv2_* schema + default factories
    store.js          ← pub/sub state store
    migrations.js     ← v1 → v2 migration guard (read-only)
  domain/
    today-engine.js   ← v2 outcome engine (active)
    plan-engine.js    ← v1 leftover (not referenced at runtime)
  services/
    auth.js           ← Firebase email/password auth (active)
    ai-v2.js          ← v2 AI action calls + fallbacks (active)
    ai.js             ← v1 AI service (not referenced at runtime)
    persistence.js    ← localStorage + Firestore dual-write under sv2_*
  ui/
    router.js         ← pushState router with V2_ROUTES allowlist
    pages/
      landing.js
      auth.js
      onboarding.js
      confirm-track.js
      plan-preview.js
      today.js
      agent.js
      action-kit.js
      proof.js
      blocked.js
      progress.js
      recap.js
      settings.js
      not-found.js
      index.js        ← Route dispatcher
docs/                 ← All product + engineering spec documents
scripts/
  smoke.js            ← Smoke test (server start + /health check)
```

---

## v2 AI Actions

Allowlisted in the `AI_ACTIONS` set in `backend/server.js`. All v2 actions go
through `POST /api/openai/generate`. None of these is a generic chatbot —
each is task-scoped with a JSON schema and a deterministic fallback.

```
track_generate   — build initial 7-day track from onboarding data
track_continue   — generate continuation track after Day 7 recap
agent_steps      — generate 3–5 micro-steps for today's task
agent_hint       — inline hint for a stuck agent step (allowlisted; not yet wired in v2 client)
rescue_action    — generate Rescue Action for a blocked day
action_kit       — generate Action Kit (templates / questions / tips)
v2_proof_check   — judge submitted proof: met / partial / not_met
day7_recap       — generate Day 7 reflection paragraph
adapt_day        — adapt tomorrow's task based on today's outcome
```

Full prompt specs and fallbacks in `docs/STRIVEAI_V2_AI_ACTIONS.md`.

Note: v1 actions (`roadmap`, `tasks`, `chat`, etc.) are still in the
backend allowlist but the v2 client never calls them. They will be removed
when the legacy files are deleted.

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

Defined in `frontend/ui/router.js` (`V2_ROUTES` allowlist). Any path not in the
allowlist resolves to `/not-found`.

| Route | Screen |
|---|---|
| `/landing` | Landing |
| `/auth` | Sign in / Create account |
| `/onboarding` | Onboarding (8 steps) |
| `/confirm-track` | Confirm track (minimal; overlaps with `/plan-preview`) |
| `/plan-preview` | 7-day plan preview |
| `/today` | Today's Action (primary screen) |
| `/agent` | Agent Mode workspace |
| `/action-kit` | Action Kit |
| `/proof` | Proof of Progress |
| `/blocked` | Blocked / Skipped → Rescue Action |
| `/progress` | 7-day progress timeline |
| `/recap` | Day 7 Recap |
| `/settings` | Settings |
| `/not-found` | 404 fallback |

**Removed in v2**: `/`, `/register`, `/generating`, `/kit`, `/track`,
`/history`, `/dashboard`, `/work`, `/goals`, `/notes`, `/analytics`,
`/billing`, `/roadmap`.

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
