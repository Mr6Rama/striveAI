# striveAI Full-Stack Audit Report

**Date:** 2026-05-10  
**Audited by:** 8 specialist agents running in parallel  
**Project root:** `striveAI-main/`

---

## Executive Summary

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Backend (server.js, logger.js) | 3 | 10 | 10 | 6 |
| Frontend Core (store, domain, services) | 5 | 9 | 12 | 6 |
| Frontend UI (pages, router, index.html, script.js) | 5 | 14 | 11 | 12 |
| Chrome Extension | 1 | 5 | 6 | 7 |
| Performance | 5 | 7 | 7 | — |
| Testing | — | — | — | (zero tests exist) |
| **TOTAL** | **19** | **45** | **46** | **31** |

### Top Findings

1. **`app.js` and its entire ES module tree is never loaded** — `index.html` only loads `script.js`. The modular architecture (`app.js`, `ui/pages/*.js`, `ui/router.js`) is dead code at runtime.
2. **Three unauthenticated Critical endpoints** — `/api/openai/generate` (API key drain), `/api/config` (credential disclosure), `/api/notify/reminder` (email relay).
3. **Stored XSS in Chrome extension popup** — `root.innerHTML` built from untrusted page data with no escaping.
4. **Zero test coverage** — no test runner, no test files, no CI configuration.
5. **60-second timer unconditionally calls AI + Firestore** — major performance regression in production.

---

## Agent 1 — Backend Audit

**Files:** `backend/server.js` (2585 lines), `backend/utils/logger.js` (133 lines), `package.json`

### Critical

**ISSUE-001 | server.js:1443–1453 | Unauthenticated credential disclosure**  
`GET /api/config` is fully public and returns Firebase API key, auth domain, project ID, messaging sender ID, app ID, measurement ID, PayPal client ID, and PayPal plan IDs. No auth check, no rate limit.  
Fix: Require Firebase ID-token verification. Return payment IDs only to authenticated sessions. Bake Firebase config into the frontend build instead of exposing via an endpoint.

**ISSUE-002 | server.js:1284–1295 | Unauthenticated AI proxy / API key drain**  
`POST /api/openai/generate` has a rate limiter (20 req/15 min by IP) but zero authentication. Any anonymous internet user can proxy prompts through the server's `OPENAI_API_KEY`. The IP-based rate limit is trivially bypassable via `X-Forwarded-For` header spoofing when `trust proxy 1` is set.  
Fix: Add Firebase ID-token middleware before `aiLimiter`. Key the rate limit to the verified `uid`, not IP.

**ISSUE-003 | server.js:2530–2573 | Unauthenticated email relay**  
`POST /api/notify/reminder` sends emails to arbitrary addresses from the request body with no authentication. The per-email-per-day guard is in-memory (resets on restart) and bypassed by cycling addresses.  
Fix: Authenticate with Firebase ID token. Derive the `email` from the verified token, never from the request body.

### High

**ISSUE-004 | server.js:152–163 | Stub route reachable without auth**  
`POST /api/goals/:id/complete` returns `200 { success: true }` with no DB logic, no auth, no param validation. Returns false success.  
Fix: Return HTTP 501 until implemented. Add auth middleware. Validate `id` against Firestore doc ID format.

**ISSUE-005 | server.js:16 | Proxy trust misconfiguration**  
`app.set('trust proxy', 1)` is unconditional. Makes rate limiter bypassable via `X-Forwarded-For` spoofing outside of proxied deployments.  
Fix: Gate with `if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)`.

**ISSUE-006 | server.js:1436 | No HTTP security headers**  
No `helmet`. No CSP, X-Frame-Options, X-Content-Type-Options, HSTS, Referrer-Policy.  
Fix: `npm install helmet` and `app.use(helmet())` before route definitions.

**ISSUE-007 | server.js:2534 | Weak email validation**  
`!email.includes('@')` passes `"@"`, `"a@"`, multi-MB strings.  
Fix: `const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/; if (!EMAIL_RE.test(email)) return res.status(400)...`

**ISSUE-008 | server.js:2482–2513 | XSS in HTML email templates**  
`name` and `goal` are embedded into HTML email bodies with only `.slice()`, no HTML entity escaping.  
Fix: Add `escHtml(s)` function using `div.textContent = s; return div.innerHTML` and apply it to all interpolated user values.

**ISSUE-009 | server.js:1428 | Rate limit scope too narrow**  
Only `/api/openai/generate` is rate-limited. `/api/config` and `/api/goals/:id/complete` have none.  
Fix: Add a global rate limiter: `app.use(rateLimit({ windowMs: 60_000, max: 100 }))`.

**ISSUE-010 | server.js:1458 | Session ID logged verbatim**  
`sessionId` from request headers is written raw into every log record. If used as an auth token, this is credentials-in-logs.  
Fix: Log only a hash prefix: `hashText(sessionId).slice(0, 12)`.

**ISSUE-023 | logger.js:82 | Full stack traces in production logs**  
`normalizeError` returns the full `error.stack` string, including server file system paths.  
Fix: In production, truncate to 3 lines: `error.stack.split('\n').slice(0,3).join('\n')`.

**ISSUE-026 | .env.example | Missing startup guard for required vars**  
`OPENAI_API_KEY` silently defaults to undefined, disabling AI with no error. At least 19 env vars consumed by server.js need documentation.  
Fix: Add startup validation: `if (!process.env.OPENAI_API_KEY) { console.error('FATAL: OPENAI_API_KEY not set'); process.exit(1); }`

**ISSUE-027 | package.json:6–8 | No crash recovery**  
`"start": "node backend/server.js"` — process dies permanently on unhandled rejection.  
Fix: Add `process.on('unhandledRejection', ...)` handler + use pm2 or systemd with restart policy.

**ISSUE-028 | package.json:9–13 | Missing security dependencies**  
`helmet`, `cors`, `firebase-admin` are not in dependencies. `nodemailer` is optional (should be required).  
Fix: Add all four to `dependencies`.

### Medium

**ISSUE-011 | server.js:1025–1029** — Deduplication fingerprint keyed on IP, not user ID. NAT users collide.  
**ISSUE-012 | server.js:148–150** — In-memory cache never swept by interval, only on write.  
**ISSUE-013 | server.js:299** — In-flight deduplication key not cleaned up if process hangs.  
**ISSUE-014 | server.js:1437** — No CORS configuration; all origins accepted.  
**ISSUE-015 | server.js:2415–2417** — No explicit 404 for API paths; catch-all serves index.html.  
**ISSUE-016 | server.js:2451–2465** — Nodemailer init failure silently swallowed.  
**ISSUE-017 | server.js:1436** — 100 KB JSON limit applied to simple routes that need only 4 KB.  
**ISSUE-018 | server.js:1499** — `opts` object spread without prototype pollution guard.  
**ISSUE-024 | logger.js:29** — Payload spread can overwrite log record fields.

### Low

**ISSUE-019** — `createRequestTrace()` called with no args; all log entries have empty traces.  
**ISSUE-020** — Stub route returns false `200` success.  
**ISSUE-021** — `logInfo` called with wrong arity (3 args instead of 1).  
**ISSUE-022** — `OPENAI_MODEL` env var has no effect on most actions (misleading docs).  
**ISSUE-025** — Log level env var not length-limited.  
**ISSUE-029** — No `test` script in package.json.

---

## Agent 2 — Frontend Core Audit

**Files:** `core/store.js`, `core/state-model.js`, `core/migrations.js`, `domain/plan-engine.js`, `domain/today-engine.js`, `services/ai.js`, `services/auth.js`, `services/persistence.js`

### Critical

**store.js:7 — `getState()` returns live mutable reference**  
Any caller can silently corrupt store state without going through `updateState`.  
Fix: Return `clone(state)` from `getState()`.

**store.js:15–20 — `updateState` uses falsy coercion on return value**  
`const result = updater(draft) || draft` — if updater returns `null`, `0`, or `false`, `draft` is used instead.  
Fix: `const result = updater(draft); state = result !== undefined ? result : draft;`

**today-engine.js:23–68 — `markOutcome` records history entry before confirming plan mutation succeeds**  
`history.entries.push(entry)` fires before `markTaskDone`. If `taskId` is stale, history claims "done" but task stays `'todo'`.  
Fix: Move `history.entries.push` and streak updates to after plan mutation is confirmed.

**today-engine.js:87–98 — `ensureTaskAssigned` wipes `skippedTaskIds` on same-date reset**  
After any outcome, tasks the user manually skipped are forgotten; engine may re-assign an unwanted task.  
Fix: Preserve when `allowSameDateReset: true`: `skippedTaskIds: options.allowSameDateReset ? (next.today.skippedTaskIds || []) : []`.

**persistence.js:5–21 — Cloud always wins over local without timestamp comparison**  
If user made offline changes, cloud version (hours old) silently overwrites fresh local data on next online load.  
Fix: Compare `updatedAt` timestamps; use whichever is newer per domain.

### High

**migrations.js:70–73** — Legacy `today` fields spread without validation; could corrupt `adjustmentLevel`, `attemptCount`.  
**today-engine.js:54–57** — `applyMissedAdaptation` feedback overwritten inconsistently across paths.  
**today-engine.js:44–68** — Concurrent `markOutcome` calls create race: both read same snapshot, last write wins.  
**ai.js:81–101** — No `AbortController` timeout on `fetch` to backend; hangs indefinitely on slow server.  
**ai.js:96–100** — `res.json()` parse failure silently returns `{}`, losing original response body.  
**auth.js:9–17** — Firebase SDK accessed as bare global `firebase` not `window.firebase`; throws in strict-mode modules.  
**auth.js:1–3** — Module-level mutable Firebase globals; no `resetAuth()` for test teardown.  
**persistence.js:29–42** — `firebase.firestore.FieldValue.serverTimestamp()` called as bare global.  
**persistence.js:122–128** — `normalizePlan` called on every load, regenerating plan `id` spuriously.

### Medium

**state-model.js:34** — `isoDateNow` not injectable for tests; date-based tests will be flaky.  
**state-model.js:82** — `JSON.parse(JSON.stringify(...))` clone drops `Date`, `undefined`, functions.  
**migrations.js:146–153** — `toHours` text-match is order-dependent; `"20"` matches `"2"` producing 2 hours for a 20-min task. (Actual bug.)  
**migrations.js:112–125** — `looseMatch` 0.6 ratio produces false positives on 2-token titles.  
**plan-engine.js:72–91** — `recalculatePlan` hard-resets non-`done`/`todo` task statuses silently.  
**plan-engine.js:85–91** — Empty-task stage computation: `isStageDone` returns `false` for 0-task stages, creating permanent lock.  
**plan-engine.js:275–277** — `isStageDone` returns `false` for 0-task stages (also causes permanent active stage lock).  
**today-engine.js:11–13** — Rollover date comparison uses string `<` which fails for non-ISO formats.  
**today-engine.js:262–280** — `maybeRebuildCurrentStage` uses `recalculatePlan` on unvalidated AI output; should use `normalizePlan`.  
**ai.js:294–305** — `safeParseJson` uses `lastIndexOf('}')` which can merge two independent JSON objects.  
**persistence.js:53–70** — Firestore collection scan has no `.limit()`.  
**persistence.js:73–78** — `JSON.stringify` calls not wrapped in try-catch; partial write on serialization error.

### Low

**plan-engine.js:61** — Plan `id` not idempotent; two calls same second produce different IDs.  
**auth.js:25–32** — Returns raw Firebase `UserCredential`; callers coupled to SDK internal shape.  
**auth.js:40–47** — `authErrorMessage` may expose internal SDK error messages to users.  
**persistence.js:130–141** — Unknown fields from localStorage spread into user object (e.g. legacy `role: 'admin'`).  
**XC-1** (cross-cutting) — No optimistic-update rollback; failed cloud write causes next-device load to revert last action.  
**XC-2** (cross-cutting) — `history.entries` grows unboundedly; cap at 90 entries.

---

## Agent 3 — Frontend UI Audit

**Files:** `ui/pages/*.js`, `ui/router.js`, `frontend/index.html`, `frontend/app.js`, `frontend/script.js`

### Critical (architecture-level)

**index.html:874 — `app.js` is never loaded by `index.html`**  
`index.html` loads only `script.js`. The entire `app.js` module tree (`ui/pages/onboarding.js`, `today.js`, `settings.js`, `roadmap.js`, `ui/router.js`) is dead code at runtime. All live behavior comes from `script.js` globals.  
Fix: Add `<script type="module" src="/app.js"></script>` and remove the `script.js` tag, OR delete `app.js` and the `ui/` modules.

**index.html + script.js — 50+ inline `onclick` attributes + `window` global pollution**  
All interactive behavior wired via `onclick="authSignIn()"`, `onclick="gp('roadmap')"`, etc. Prevents any CSP from blocking inline scripts; exposes the full global scope as XSS attack surface.  
Fix: Remove all inline handlers; use event delegation; enforce CSP.

**script.js:25–27 — PayPal credentials in client source as `let` globals**  
```js
let PAYPAL_CLIENT_ID = 'YOUR_PAYPAL_CLIENT_ID_HERE';
```
Pattern trains developers to commit real values here. If substituted, credentials are public.  
Fix: Fetch only from `/api/config`; never store in source.

**script.js:262–292 — AI requests sent with no auth token**  
`aiRequest` calls `/api/openai/generate` with no `Authorization` header. Any anonymous caller can burn OpenAI quota.  
Fix: Include Firebase ID token: `headers: { 'Authorization': \`Bearer ${await currentUser.getIdToken()}\` }`.

**app.js:329–332 — `loadRuntimeConfig` throws on failure, crashing entire boot**  
`if (!res.ok) throw new Error(...)` caught only by generic `showAuthError`.  
Fix: Retry with exponential backoff, or provide a default config for degraded operation.

### High

**onboarding.js:1, settings.js:1, today.js:1–5 — Module-level `bound` singletons block re-binding after sign-out**  
After sign-out + sign-in, all three pages' event handlers silently fail to re-attach. Done, Missed, Blocked, Skip buttons stop working.  
Fix: Use per-element binding check (`el.dataset.bound`) or export `reset*Handlers()` functions.

**router.js:14–18 — No event delegation; dynamically added `[data-route]` buttons never wired**  
Buttons added to DOM after `initRouter()` calls do not trigger navigation.  
Fix: Single delegated listener on `document`.

**router.js:24 — `window.gp` global navigation function**  
High-value XSS target; any injected content calling `gp()` controls navigation.  
Fix: Remove `window.gp`; use `data-route` delegation.

**index.html — Multiple modals missing `role="dialog"`, `aria-modal="true"`, focus trap, Escape key**  
Check-in, new-project, forgot-password, project-switcher modals all fail WCAG 2.1 SC 2.1.2.  
Fix: Add ARIA roles; implement focus trap; add document-level `keydown` Escape handler.

**app.js:18–21 — `boot().catch` swallows error if auth screen is hidden**  
`showAuthError` writes to `#auth-error` but if auth screen is hidden at boot-fail time, error is invisible.

**app.js:291–293 — All four page renderers fire on every state change regardless of active route**  
(Also a performance critical — see Agent 8.)

**index.html:459 / 579 — Duplicate `id="btn-complete-goal"` violates HTML spec**  
`getElementById` returns only first match; second button is permanently unreachable.

**index.html:724–733 / all modals — No Escape key handler on any modal**  
WCAG 2.1 SC 2.1.2 keyboard trap violation.

**script.js:262–264 — Error message exposes internal env var names to end users**  
`"Set OPENAI_API_KEY in server environment variables..."` shown to user.

**app.js:74–77 — `auth-signout-btn` listener attached to element that does not exist**  
Dead code; no such ID in `index.html`.

**index.html — No CSP meta tag or server CSP header**  
Combined with inline handlers and global scope, no XSS mitigation layer exists.

### Medium

**onboarding.js:9–14** — No inline validation before `onGenerate`; empty goal passes through.  
**roadmap.js:28** — `host.innerHTML` replacement drops all child event listeners on re-render.  
**settings.js:25** — `state.plan.goal` accessed without null guard.  
**router.js:38–43** — `billing` and `analytics` in `ROUTES` but absent from `setActiveView` map; silently redirect to `/`.  
**app.js:267–272** — 60-second rollover timer always active; no `visibilitychange` pause.  
**app.js:356–379** — `alert()` and `confirm()` for goal completion UX.  
**app.js:282** — `#top-user` does not exist; `#user-name-lbl` is the real element. Dead code.  
**script.js:357** — Logs "Gemini JSON parse failed" — wrong product; indicates copy-paste from another codebase.  
**script.js:536–541** — `S.user.goal`, `S.roadmap` etc. accessed without optional chaining; one `S = undefined` cascades.

### Low

**roadmap.js:68–74** — `escapeHtml` does not escape single quotes; fragile for single-quoted attributes.  
**roadmap.js:9** — `overallProgress(plan)` called without null guard; throws if `state.plan` is undefined.  
**index.html:7–8** — Google Fonts loaded from external CDN; blocks rendering, leaks user IP.  
**index.html:267–275** — Many `<button>` elements missing `type="button"`.  
**index.html:870** — CRT overlay `z-index:9998` can block any interactive element assigned lower z-index.  
**onboarding.js:30–31, settings.js:30–31** — `ob-status`, `ob-error`, `set-status`, `set-error` lack `aria-live` regions.  
**app.js:364–368** — `userId` path segment in fetch URL not validated for non-empty/non-path-traversal.  
**app.js:371–373** — `window.location.reload()` used for goal completion reset; full-page reload discards all state.

---

## Agent 4 — CSS / Design Audit

**Status: Partially blocked.** The two prototype files (`strive-design-direction-v1.html`, `strive-landing-v1.html`) are outside the project root at `C:\Users\User\Desktop\Strive\` and were not accessible to the agent. The following is based on `frontend/style.css` and `frontend/index.html`.

### Extracted Production Design System

**Color tokens (`frontend/style.css:1–22`):**
| Token | Value | Role |
|-------|-------|------|
| `--bg` | `#131313` | Page background |
| `--bg-low` | `#0E0E0E` | Auth / sidebar |
| `--surface` | `#1F1F1F` | Card background |
| `--border` | `#2A2A2A` | Default border |
| `--border2` | `#434656` | Prominent border |
| `--blue` | `#0052FF` | Primary accent |
| `--blue-l` | `#B7C4FF` | Labels / links |
| `--ink` | `#E2E2E2` | Primary text |
| `--green` | `#10B981` | Success |
| `--amber` | `#F59E0B` | Warning / streak |
| `--red` | `#EF4444` | Error |

**Typography:**
- `--head: 'Inter', sans-serif` — headings
- `--sans: 'DM Sans', sans-serif` — body
- `--mono: 'JetBrains Mono', monospace` — labels, kickers, inputs

**Known typography issue:** `Manrope` is loaded via Google Fonts (weights 300–900) but `--head` is set to `Inter`. This suggests an incomplete font migration. If the prototype uses Manrope as the primary display face, change `style.css:23` from `--head:'Inter',sans-serif` to `--head:'Manrope',sans-serif`.

**Animations defined:** `fadeIn`, `slideUp`, `pulse`, `spin`, `blink`, `popIn` (spring-like cubic-bezier).

**Design gaps to verify against prototypes (requires read access to prototype files):**
To complete the CSS gap analysis, grant Read access to:
- `C:\Users\User\Desktop\Strive\strive-design-direction-v1.html`
- `C:\Users\User\Desktop\Strive\strive-landing-v1.html`

### Known CSS Issues from Code Review

**style.css — No `font-display: swap` on Google Fonts URL**  
Fonts block rendering. Add `&display=swap` to the Google Fonts `<link>` URL in `index.html`.

**style.css — `.ob-variant-row` layout incomplete**  
Markup uses `.ob-variant-row` for horizontal card layout but only `.ob-variants` (column) is defined. Add:
```css
.ob-variant-row { flex-direction: row; }
.ob-variant-row .ob-variant { flex: 1; }
```

---

## Agent 5 — Chrome Extension Audit

**Files:** `manifest.json`, `background.js`, `content.js`, `popup.js`, `popup.html`, `config.js`

### Critical

**config.js:1 — Extension hardcoded to localhost; non-functional for all users**  
`STRIVEAI_EXTENSION_ENV = 'local'` resolves to `http://localhost:3000`. Any user who installs this gets an extension pointing to a server that doesn't exist on their machine.  
Fix: Implement a build-step (webpack/esbuild) that replaces this at build time for production. Never commit `'local'` as default.

### High

**popup.js:69–172 — Stored XSS via `root.innerHTML` with unsanitized state data**  
`state.goal`, `state.userName`, `state.stageName` interpolated directly into `innerHTML`. These values come from `window.__striveAI` on the page — untrusted. A page-side XSS can inject HTML into the extension popup, which runs at `chrome-extension://` origin with full tab/storage/notification access.  
Fix: Use `el.textContent = value` everywhere, or add `esc(s)` using `div.textContent = s; return div.innerHTML` before any `innerHTML` interpolation.

**manifest.json:13–16 — `host_permissions` targets `example.com` (unowned domain)**  
Production domain is `https://example.com` — a domain the developer does not own. Extension injects content script into it.  
Fix: Replace with the real owned production domain immediately.

**background.js:12–13 — Alarm period `1/60` violates Chrome 30-second minimum**  
`periodInMinutes: 1/60` ≈ 0.017 min; Chrome silently clamps to 0.5 min. "Time's up" check uses `remaining === 0` (strict equality) — with 30-second alarm granularity, this almost never fires.  
Fix: Set `periodInMinutes: 0.5`. Change `remaining === 0` to `remaining <= 0`.

**background.js:1 — `importScripts('config.js')` fragile in service worker**  
If `config.js` fails to load, all `STRIVEAI_APP_URL` references throw `ReferenceError`, silently crashing `openStriveAI()`.  
Fix: Add guard: `const url = typeof STRIVEAI_APP_URL !== 'undefined' ? STRIVEAI_APP_URL : 'http://localhost:3000'`.

**content.js:9 — `window.__striveAI` read from page without validation**  
Content script reads state from the page's `window` object. Any XSS on the app page can feed attacker-controlled data into extension storage.  
Fix: Validate shape and types before forwarding. Only copy known-safe fields with type checks.

### Medium

**manifest.json:10–11** — `tabs` permission over-privileged; `host_permissions` covers the URL-filtered queries. Remove `"tabs"`.  
**background.js:107–123** — Message handler has no `sender` origin validation; confused-deputy attack via page XSS.  
**background.js:159–164** — `setDefaultState` is no-op on reinstall if any prior state exists; stale sessions persist.  
**content.js:23** — `sendMessage` result ignored; `lastSentSignature` updated before send, so failures are invisible and not retried.  
**content.js:35–46** — `onMessage` handler does not validate `sender.id`; any extension can trigger `startSession`/`endSession`.  
**popup.js:200–206** — No `chrome.runtime.lastError` check on `get_state` response.

### Low

**config.js (global scope)** — Top-level `const` globals pollute service worker namespace. Use ES module `"type": "module"` background.  
**background.js:87–88** — `onButtonClicked` calls `openStriveAI()` unconditionally for all notifications and button indices.  
**background.js:17–20** — `onStartup` does not check for stale session from previous browser session.  
**background.js:3–6** — `onStartup` does not re-create alarms if they were cleared.  
**content.js:31** — `syncInterval` never paused on `document.hidden`.  
**popup.js:175** — `tickerInterval` never cleared on popup `unload`.  
**popup.js:58–67** — Creating new tab silently drops the `page_action`; user opens app but session action never fires.  
**popup.html — No explicit CSP meta tag** (though current code complies with implicit MV3 CSP).

---

## Agent 6 — Design Implementation Plan

**Note:** Prototype files at `C:\Users\User\Desktop\Strive\` were not accessible. Plan is based on production files only. Grant Read access to the two prototype HTML files to get a full delta-based plan.

### Priority 1 — Immediate (S effort)

**1a. Font migration: Manrope loaded but unused**  
`style.css:23` — Change `--head:'Inter',sans-serif` → `--head:'Manrope',sans-serif`. Impacts all headings, auth title, logo, page titles, plan prices.

**1b. Horizontal variant card layout**  
Add after `.ob-variants` definition:
```css
.ob-variant-row { flex-direction: row; }
.ob-variant-row .ob-variant { flex: 1; }
```

**1c. Plan chip in header**  
```css
.plan-chip { font-family:var(--mono); font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; padding:3px 8px; border:1px solid var(--border2); color:var(--muted); }
.plan-chip.pro { border-color:var(--blue); color:var(--blue-l); background:rgba(0,82,255,.1); }
```

### Priority 2 — Navigation (S effort)

**Active tab indicator bleed:**
```css
.htab.on { border-bottom: 3px solid var(--blue); margin-bottom: -2px; }
```

### Priority 3 — Content pages (M effort)

**Today card left-border treatment:**
```css
.today-card { border-left: 3px solid var(--blue); }
.today-task-title { font-family:var(--head); font-size:20px; font-weight:900; text-transform:uppercase; }
```

**Stats grid (Today page and Roadmap ribbon):**
```css
.today-stats-row { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; background:var(--border); }
.today-stat { background:var(--surface); padding:14px 12px; text-align:center; }
.today-stat-val { font-family:var(--head); font-size:22px; font-weight:900; }
```

### Priority 4 — Generation overlay (M effort)

Add spinner + copy treatment to `.flow-overlay` / `.flow-card` for AI generation loading screen (see full CSS in Agent 6 output).

---

## Agent 7 — Testing Audit

### Testing Infrastructure: Completely Absent

- No test runner (`jest`, `vitest`, `mocha`) in `package.json`
- No test files (`.test.js`, `.spec.js`, `__tests__/`) anywhere in the repository
- No coverage tooling, no CI configuration, no test fixtures
- Non-trivial domain logic in 7 source files with zero automated verification

### Recommended Setup

```bash
npm install --save-dev vitest @vitest/coverage-v8 supertest
```

Add to `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

Test file locations (per CLAUDE.md — never in root):
```
tests/unit/state-model.test.js
tests/unit/plan-engine.test.js
tests/unit/today-engine.test.js
tests/unit/migrations.test.js
tests/unit/store.test.js
tests/integration/server.test.js
tests/integration/persistence.test.js
```

### Critical Untested Paths (P0 — data corruption risk)

**P0-A: `today-engine.js:23–68` — `markOutcome` + streak mutation**  
Records outcome, mutates streaks, triggers adaptation, picks next task. Silent streak miscounts, double history entries, `forceTaskId` not cleared after `done`.  
Tests needed: `done` increments `successStreak`; `blocked` does NOT increment `missStreak`; `forceTaskId` cleared after `done`.

**P0-B: `today-engine.js:175–207` — `applyMissedAdaptation` execution lock**  
At `missStreak >= 3` AND `adjustmentLevel >= 2`, locks user to `forceTaskId`. Off-by-one in `>=` check blocks users a day early or never.  
Tests needed: `missStreak=2, adjustmentLevel=1` → simplification only; `missStreak=3, adjustmentLevel=2` → sets `forceTaskId`.

**P0-C: `plan-engine.js:72–92` — `recalculatePlan` stage status transitions**  
Determines which stage is `active`, `locked`, or `done`. Bug means user shown wrong stage permanently.  
Tests needed: all stages done → all `'done'`, `currentStageId = ''`; empty stages → no crash.

**P0-D: `migrations.js:112–125` — `looseMatch` text similarity (0.6 threshold)**  
False positive marks incomplete tasks as done on first launch.  
Tests needed: overlap exactly 0.6 → `true`; 0.59 → `false`; minimum 3 tokens before ratio applied.

### High-Risk Paths (P1)

**P1-A: `plan-engine.js:16–70`** — `normalizePlan` fallback: empty stages, vague task titles, cap at 5 tasks.  
**P1-B: `today-engine.js:137–159`** — `selectTask` scoring: skip set exclusion, penalty for blocked/missed, `estimateHours` filter.  
**P1-C: `today-engine.js:6–21`** — `rolloverAndAssign` date rollover: yesterday+pending → auto-miss; yesterday+done → no rollover.  
**P1-D: `state-model.js:75–80`** — `isoDateNow` formatting: months 1–9 and days 1–9 padded correctly.  
**P1-E: `migrations.js:146–153`** — `toHours` parsing: `"20"` contains `"2"` — actual bug: 20-minute task returns 2 hours.  
**P1-F: `server.js:310–360`** — `extractJsonChunk` + `repairTruncatedJsonCandidate`: clean JSON unchanged; truncated repaired; no JSON → `usable: false`.  
**P1-G: `server.js:186–219`** — `applyActionTokenGuard`: per-action caps enforced; unknown action uses `default`.

### Integration Paths (P2)

**P2-A: `persistence.js:122–195`** — `validateDomains` + `hasCoreData`: wrong `false` triggers destructive migration on every startup.  
**P2-B: `store.js:15–35`** — `updateState` subscriber error isolation: one throwing subscriber must not prevent others from firing.

---

## Agent 8 — Performance Audit

### Critical

**1. `app.js:281–295` — All four page renders fire on every state mutation**  
Sign-in sequence alone causes 12+ unnecessary render cycles.  
Fix: Gate each render behind a route check + reference-equality check on the relevant state slice. (See full fix code in Agent 8 output.)

**2. `store.js:16` / `today-engine.js:324` — Full deep-clone (`JSON.parse/stringify`) on every state mutation**  
`markOutcome` calls `cloneState` 4+ times on the full state tree. O(n) in state size; synchronous blocking.  
Fix: Targeted structural spread — only clone mutated sub-trees. Use shallow spreads per slice.

**3. `app.js:267–278` — Rollover timer fires AI round-trip + 4 localStorage writes + Firestore batch every 60 seconds unconditionally**  
Even when today's date has not changed and task is already assigned.  
Fix:
```js
async function rolloverCheckIfNeeded() {
  const todayDate = new Date().toISOString().slice(0, 10);
  const state = getState();
  if (state.today?.date === todayDate && state.today?.primaryTaskId) return;
  await ensureTodayAssignedAndPersist();
}
```

**4. `script.js` — ~490 KB monolithic unminified file, no bundler**  
Blocks main thread 300–800 ms on parse + compile on mid-range mobile.  
Fix: Add `defer` attribute immediately. Medium-term: introduce Vite or esbuild for tree-shaking + minification (expect 40–60% size reduction).

**5. `app.js:297–313` — `querySelectorAll('.view')` called on every render**  
Forces full DOM traversal on every state update.  
Fix: Cache view elements once at boot into `VIEW_ELEMENTS` object; use cached references thereafter.

### High

**6. `persistence.js:23–27` — All 4 domains serialized and written regardless of which changed**  
Fix: Dirty-tracking set; only write changed domains.

**7. `persistence.js:23–120` — No write debounce; Firestore batch on every single outcome**  
Fix: 1500ms debounce timer coalescing writes within the same action sequence.

**8. `today-engine.js:299–310` — History iterated twice with `new Date()` construction per entry in `selectTask`**  
Fix: Combined single-pass function with pre-computed cutoff timestamp.

**9. `plan-engine.js:69` — `normalizePlan` + `recalculatePlan` called 3× per rebuild**  
Fix: Pass `{ skipRecalc: true }` flag to skip redundant traversals.

**10. `script.js:10514` — Unthrottled `mousemove`/`touchmove` on document**  
Fix: Wrap in `requestAnimationFrame` gate.

**11. `script.js:7052` — Unthrottled `resize` triggering `renderGuidedTour` DOM rebuild**  
Fix: 120ms debounce.

**12. `server.js:989` — In-memory response cache not swept periodically**  
Fix: `setInterval(() => pruneOpenAIResponseCache(), 5 * 60 * 1000).unref()` at startup.

### Medium

**13. `app.js:329` / `script.js:187` — `/api/config` fetched twice per load (both files), no client caching**  
Fix: `sessionStorage` cache + server `Cache-Control: public, max-age=300`.

**14. `plan-engine.js:130–139` — `overallProgress` uses `flatMap` + `filter` (two array allocations)**  
Fix: Single-pass accumulation loop.

**15. `today-engine.js:50–52` — Stage progress read from pre-mutation stage reference**  
Fix: Resolve from updated plan after `markTaskDone`.

**16. `app.js:371–373` — `window.location.reload()` for goal completion**  
Full-page reload discards all state. Fix: `replaceState(createInitialState())` + navigate to `/onboarding`.

**17. `script.js:10327` — `refreshContextSummary()` called and written to localStorage twice in same tick**  
Fix: 500ms debounce.

**18. `ai.js:87` — Empty `systemCtx: ''` sent on every AI request**  
Fix: Omit the field when empty; server treats absent as default.

**19. `today-engine.js:140–143` — Two separate `recentTaskOutcomes` traversals constructible as one pass**

---

## Prioritized Remediation Roadmap

### P0 — Fix Before Any Production Use

| # | Issue | File(s) | Effort |
|---|-------|---------|--------|
| 1 | Add auth to `/api/openai/generate` and `/api/notify/reminder` | server.js | M |
| 2 | Remove `/api/config` or restrict to authenticated sessions | server.js | S |
| 3 | Fix Chrome extension popup XSS (`root.innerHTML`) | chrome-extension/popup.js | S |
| 4 | Fix Chrome extension hardcoded localhost env | chrome-extension/config.js | S |
| 5 | Replace Chrome extension `example.com` with real domain | manifest.json, config.js | S |
| 6 | Add `<script type="module" src="/app.js">` or consolidate to single entry | index.html | M |
| 7 | Remove PayPal `let` globals from `script.js` | script.js | S |
| 8 | Add auth token to all `aiRequest` calls | script.js | S |

### P1 — Security Hardening

| # | Issue | File(s) | Effort |
|---|-------|---------|--------|
| 9 | Install `helmet` + `cors` + `firebase-admin` | backend | S |
| 10 | Add HTTP security headers | server.js | S |
| 11 | Fix XSS in HTML email templates | server.js | S |
| 12 | Fix email validation regex | server.js | S |
| 13 | Fix prototype pollution in `opts` spread | server.js | S |
| 14 | Add sender origin validation to Chrome extension message handlers | background.js, content.js | S |
| 15 | Fix `window.__striveAI` state validation before forwarding | content.js | S |
| 16 | Remove all inline `onclick` handlers; enforce CSP | index.html | L |

### P2 — Data Integrity

| # | Issue | File(s) | Effort |
|---|-------|---------|--------|
| 17 | Fix `getState()` returning mutable reference | store.js | S |
| 18 | Fix `updateState` falsy coercion | store.js | S |
| 19 | Move history push after plan mutation confirms | today-engine.js | S |
| 20 | Preserve `skippedTaskIds` on same-date reset | today-engine.js | S |
| 21 | Add timestamp comparison to cloud-vs-local load | persistence.js | M |
| 22 | Fix `isStageDone` for empty-task stages | plan-engine.js | S |
| 23 | Fix `toHours` substring matching bug (`"20"` → 2 hrs) | migrations.js | S |
| 24 | Fix Chrome extension alarm period (`1/60` → `0.5`) and `remaining === 0` → `<= 0` | background.js | S |

### P3 — Performance

| # | Issue | File(s) | Effort |
|---|-------|---------|--------|
| 25 | Gate `renderApp` by active route + state slice equality | app.js | M |
| 26 | Replace full deep-clone with targeted structural spread | store.js, today-engine.js | M |
| 27 | Add date-change guard to rollover timer | app.js | S |
| 28 | Add dirty tracking to persist only changed domains | app.js, persistence.js | M |
| 29 | Add write debounce to Firestore saves | persistence.js | S |
| 30 | Cache `.view` elements at boot | app.js | S |
| 31 | Cache `/api/config` in sessionStorage | app.js, script.js | S |
| 32 | Add `defer` to `script.js`; introduce Vite/esbuild | index.html, package.json | L |
| 33 | Throttle `mousemove`/`touchmove`/`resize` with rAF/debounce | script.js | S |

### P4 — Testing

| # | Issue | Effort |
|---|-------|--------|
| 34 | Install vitest + supertest | S |
| 35 | Write P0 unit tests (markOutcome, recalculatePlan, looseMatch) | M |
| 36 | Write P1 unit tests (selectTask, rollover, normalizePlan, store) | M |
| 37 | Write integration tests (server routes, persistence) | L |

### P5 — Design & UX

| # | Issue | Effort |
|---|-------|--------|
| 38 | Font migration: Manrope as `--head` | S |
| 39 | Fix `.ob-variant-row` horizontal layout | S |
| 40 | Add focus trapping and Escape key to all modals | M |
| 41 | Add `aria-live` regions to status/error elements | S |
| 42 | Add `type="button"` to all non-submit buttons | S |
| 43 | Grant Read access to prototype files; complete CSS gap analysis | — |

---

## File Change Index

| File | Issues |
|------|--------|
| `backend/server.js` | ISSUE-001 through ISSUE-022 (29 issues) |
| `backend/utils/logger.js` | ISSUE-023 through ISSUE-025 |
| `package.json` | ISSUE-027 through ISSUE-029 |
| `frontend/core/store.js` | Mutable getState, falsy updater coercion, subscriber isolation |
| `frontend/core/state-model.js` | Date injection gap, JSON clone fragility |
| `frontend/core/migrations.js` | `toHours` bug, `looseMatch` false positives, missing validation |
| `frontend/domain/plan-engine.js` | Stage status computation, `isStageDone`, `recalculatePlan` redundancy |
| `frontend/domain/today-engine.js` | History before plan, skippedTaskIds wipe, 4× clone, stale stage ref |
| `frontend/services/ai.js` | No timeout, malformed JSON handling, empty `systemCtx` |
| `frontend/services/auth.js` | Bare global `firebase`, mutable singletons, raw UserCredential |
| `frontend/services/persistence.js` | Cloud-wins-without-timestamp, no dirty tracking, no write debounce |
| `frontend/index.html` | 50+ inline `onclick`, dead `app.js` script tag, duplicate IDs, no CSP |
| `frontend/app.js` | All-render on state change, rollover timer, dead element references |
| `frontend/script.js` | PayPal globals, no auth on AI calls, unthrottled events, 490 KB |
| `frontend/ui/pages/onboarding.js` | `bound` singleton |
| `frontend/ui/pages/settings.js` | `bound` singleton, missing null guard |
| `frontend/ui/pages/today.js` | `bound` singleton |
| `frontend/ui/pages/roadmap.js` | innerHTML re-render drops listeners, missing null guard |
| `frontend/ui/router.js` | No event delegation, `window.gp` global, routing gaps |
| `frontend/style.css` | Manrope loaded but unused, missing `.ob-variant-row` layout |
| `chrome-extension/manifest.json` | Over-privileged `tabs`, `example.com` host permission |
| `chrome-extension/config.js` | Hardcoded `'local'` env, `example.com` placeholder |
| `chrome-extension/background.js` | Alarm period violation, no sender validation, `importScripts` fragility |
| `chrome-extension/content.js` | Untrusted `window.__striveAI`, no sender validation, interval leak |
| `chrome-extension/popup.js` | Stored XSS via `innerHTML`, no `lastError` checks |
| `chrome-extension/popup.html` | No CSP meta, inline styles |
