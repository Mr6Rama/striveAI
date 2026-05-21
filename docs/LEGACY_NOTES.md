# StriveAI — Legacy Code Inventory

This file tracks v1 code that is still active and cannot be deleted yet, plus
what has already been cleaned up. Update it when anything changes.

---

## What was removed (this cleanup pass)

| Item | File | Reason |
|---|---|---|
| `frontend/ui/pages/roadmap.js` | Deleted | Not imported by any v2 module; v1 DOM-manipulation roadmap renderer with no active callers in v2 |
| `PAYPAL_CLIENT_ID`, `PLAN_PRO`, `PLAN_TEAM`, `PAYPAL_SDK_URL` constants | `backend/server.js` lines 23–26 | Placeholder values only; never wired to a real PayPal account |
| PayPal fields from `/api/config` response | `backend/server.js` | `script.js` falls back to its own hardcoded defaults via `||` so removing from config is safe |
| STEM project-type card (v1 onboarding) | `frontend/index.html` line 113–118 | Active STEM mode removed per product decision |
| STEM project-type button (check-in modal) | `frontend/index.html` line 751 | Same as above |

---

## What is intentionally left

### `frontend/script.js` (11 560 lines — v1 monolith)

Still loaded by `index.html` as a global script. The v2 app mounts into
`#app-v2` which does not yet exist in `index.html`; until the HTML shell is
cut over, script.js runs the v1 product loop for any user landing on the
existing page.

**Do not delete until**: `index.html` has `<div id="app-v2">` as the primary
shell and the v1 boot path (`script.js`) is fully superseded.

### v1 AI actions in `backend/server.js` `AI_ACTIONS` set

`script.js` calls these via `POST /api/openai/generate`:

| Action | Called by |
|---|---|
| `roadmap` | `script.js` plan generation |
| `tasks` | `script.js` task list generation |
| `tasks_skeleton` | `script.js` task skeleton |
| `task_detail` | `script.js` task detail expansion |
| `task_audit` | `script.js` task audit |
| `goals_review` | `script.js` goals review |
| `note_process` | `script.js` notes processing |
| `session_review` | `script.js` session review |
| `chat` | `script.js` chat |
| `goal_complete` | `script.js` goal completion |

**Do not remove** any of these until `script.js` is deleted.

### `POST /api/notify/reminder` — email reminder route

Called by `script.js` line 10631. Guarded by `EMAIL_ENABLED` flag so it
is a no-op unless email is configured. Safe to leave until `script.js` is
deleted.

### `frontend/domain/plan-engine.js` (v1 plan model)

Imported by `frontend/services/ai.js` (v1) and was previously imported by
`roadmap.js` (now deleted). Still needed by `ai.js` (v1), which is loaded
by `script.js`.

### `frontend/domain/today-engine.js` (v1 — not the v2 engine)

The original v1 today engine. Still imported by `frontend/services/ai.js`
indirectly. Do not confuse with the v2 engine at the same path — the v2
rewrite replaced this file in place.

### `frontend/services/ai.js` (v1 AI service)

Used by `script.js`. Contains `normalizePlan`, `generatePlan`, etc.

### v1 HTML in `frontend/index.html`

The following sections are part of the v1 shell and are still rendered by
`script.js`. They should be removed together when the HTML shell is cut over
to v2:

- Lines ~34–61: Register screen form
- Lines ~268–275: v1 navigation tabs (dashboard, roadmap, analytics, notes)
- Lines ~529–541: AI Chat / notes page
- Lines ~601–644: Analytics page
- Lines ~681–692: Billing page (PayPal button markup)

### `frontend/services/ai.js` PayPal references

`script.js` still reads `PAYPAL_CLIENT_ID` etc. from its own hardcoded
defaults (not from `/api/config` any more). The v1 billing flow was never
connected to a real PayPal account; the markup and JS are inert.

---

## Next steps when cutting over to v2 shell

1. Add `<div id="app-v2"></div>` to `index.html` as the primary mount point.
2. Remove the v1 `<script src="script.js">` tag.
3. Delete `frontend/script.js`.
4. Delete `frontend/domain/plan-engine.js`.
5. Delete `frontend/services/ai.js` (v1).
6. Remove v1 AI actions from `AI_ACTIONS` in `backend/server.js`.
7. Remove `POST /api/notify/reminder` route.
8. Remove remaining v1 HTML sections from `index.html`.
