# StriveAI — Legacy Code Inventory

This file tracks v1 code that is still on disk and what has already been
cleaned up. Update it when anything changes.

---

## ✅ Resolved (cutover complete)

| Item | Resolution |
|---|---|
| `index.html` mounted v1 directly | `frontend/index.html` now contains only `<div id="app-v2">` and loads `/bundle.js`. v1 `<script src="script.js">` is gone. |
| `frontend/ui/pages/roadmap.js` | Deleted. Not imported by any v2 module. |
| PayPal constants (`PAYPAL_CLIENT_ID`, `PLAN_PRO`, `PLAN_TEAM`, `PAYPAL_SDK_URL`) in `backend/server.js` | Removed — never wired to a real PayPal account. |
| PayPal fields on `/api/config` | Removed. v1 `script.js` falls back to its own hardcoded defaults via `||`, so removing from config is safe. |
| STEM project-type card in v1 onboarding | Removed from `frontend/index.html`. |
| STEM project-type button in v1 check-in modal | Removed from `frontend/index.html`. |
| `<div id="app-v2">` mount point | Present in `frontend/index.html`. |
| v2 routes registered | `frontend/ui/router.js` enforces a `V2_ROUTES` allowlist; unknown paths resolve to `/not-found`. |

---

## 🟡 On disk, not loaded (safe to delete once cross-references are cleared)

### `frontend/script.js` (~500 KB v1 monolith)

`frontend/index.html` no longer loads this file. It is dead at runtime.
The file is still on disk only to make the git diff easy to review.

**Delete when**: ready to remove the file from the repo. No other v2 code
imports from it.

### `frontend/services/ai.js` (v1 AI service)

Only import: `import { normalizePlan } from '../domain/plan-engine.js';`
Not referenced by `frontend/app.js` or any v2 page module. Dead at runtime.

### `frontend/domain/plan-engine.js` (v1 roadmap/milestone model)

Only referenced by the dead `frontend/services/ai.js`. Safe to delete in
the same pass as `ai.js`.

### v1 actions in `backend/server.js` `AI_ACTIONS` set

The set still contains:

| Action | Originally called by |
|---|---|
| `roadmap` | `script.js` plan generation |
| `tasks` | `script.js` task list generation |
| `tasks_skeleton` | `script.js` task skeleton |
| `task_detail` | `script.js` task detail expansion |
| `task_audit` | `script.js` task audit |
| `goals_review` | `script.js` goals review |
| `note_process` | `script.js` notes processing |
| `session_review` | `script.js` session review |
| `chat` | `script.js` general AI chat |
| `goal_complete` | `script.js` goal completion |

The v2 client never calls any of these. They can be removed from the
allowlist in the same commit that deletes `frontend/script.js`.

### `POST /api/notify/reminder` (email reminder route in `backend/server.js`)

Was called by `script.js` for v1 email reminders. Guarded by
`EMAIL_ENABLED` so it is a no-op unless SMTP env vars are configured.
Safe to leave until `script.js` is deleted; remove in the same pass.

### `chrome-extension/`

Not in v2 scope. Documented in `chrome-extension/README.md`. Has its own
config and is independent of the v2 web app.

---

## ❌ Out of scope for v2 — do not extend

| Concept | Reason |
|---|---|
| Roadmap / milestone view | Replaced by the linear 7-day track. |
| Generic AI chat | Replaced by task-scoped Agent Mode. |
| AI Notes / notes processing | Out of MVP scope. |
| Billing, pricing, PayPal | Removed product decision. Freemium only. |
| Email notifications | Telegram is the only ping channel. |
| Google / social auth | Email + password only. |
| STEM mode | Completely removed. |
| Analytics dashboard | Out of MVP scope. |
| Admin dashboard | Out of MVP scope. |

---

## Recommended cleanup pass (single PR)

1. Delete `frontend/script.js`.
2. Delete `frontend/services/ai.js` (v1).
3. Delete `frontend/domain/plan-engine.js`.
4. Remove v1 entries from `AI_ACTIONS` in `backend/server.js`.
5. Remove `POST /api/notify/reminder` route and `EMAIL_ENABLED` plumbing.
6. Remove SMTP-related env var documentation from `.env.example` and
   `docs/SECURITY_NOTES.md` "Removed from v2" section (the variables
   themselves are already documented as removed).
7. Re-run `npm run build && npm run smoke` and confirm `/health` passes.
8. Confirm every v2 route still loads and the legacy files no longer
   appear in any grep for `script\.js|plan-engine|services/ai\.js`.

This pass is purely deletion. No behavior changes.
