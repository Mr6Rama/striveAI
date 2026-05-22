# StriveAI MVP v2 — Routes and Screens

## Router Overview

Client-side pushState router. Single HTML shell (`frontend/index.html`)
mounts `frontend/bundle.js` into `#app-v2`. Routes are logical screen
states inside one SPA, not separate pages.

The allowlist of valid routes is defined in `frontend/ui/router.js` as
`V2_ROUTES`. Any path outside the allowlist resolves to `/not-found`.
Each route maps to a render function in `frontend/ui/pages/`.

### Guards (enforced in `frontend/app.js` and individual page modules)

- **Public routes** (no auth required): `/landing`, `/auth`.
- **Authenticated routes** (Firebase user required): everything else.
  Unauthenticated visits redirect to `/landing` (or `/auth` for explicit
  sign-in intent).
- **Track-required routes**: `/today`, `/agent`, `/action-kit`, `/proof`,
  `/blocked`, `/progress`, `/recap` all check for an active
  `state.track.days[]`. If missing, they redirect to `/onboarding`.
- **Recap guard**: `/today` redirects to `/recap` when
  `track.status === 'complete'`.

### Default routes

- Signed-in user with active track → `/today`
- Signed-in user without track → `/onboarding`
- Unauthenticated visitor → `/landing`

---

## Route Table

| Route | Guard | Screen module | Purpose |
|---|---|---|---|
| `/landing` | public | `landing.js` | Marketing / product-native front door |
| `/auth` | public | `auth.js` | Sign in / Create account |
| `/onboarding` | auth | `onboarding.js` | 8-step setup wizard |
| `/confirm-track` | auth | `confirm-track.js` | Minimal "track ready" confirmation (overlaps with `/plan-preview`) |
| `/plan-preview` | auth + track | `plan-preview.js` | Full plan preview after generation |
| `/today` | auth + track | `today.js` | Primary daily screen |
| `/agent` | auth + track | `agent.js` | Agent Mode — 3–5 micro-steps + proof |
| `/action-kit` | auth + track | `action-kit.js` | AI-generated material for today's task |
| `/proof` | auth + track | `proof.js` | Proof of Progress submission + AI verdict |
| `/blocked` | auth + track | `blocked.js` | Blocker reason → Rescue Action |
| `/progress` | auth + track | `progress.js` | 7-day timeline + stats + pattern |
| `/recap` | auth | `recap.js` | Day 7 reflection + continuation choice |
| `/settings` | auth | `settings.js` | Account + Telegram + sign out |
| `/not-found` | public | `not-found.js` | 404 fallback |

---

## Screen Specifications

### `/landing` — Landing

**Purpose**: Front door for unauthenticated visitors. Product-native, not a
generic SaaS marketing template.

**Main UI elements**:

- Editorial hero with kicker `7-DAY AI EXECUTION AGENT`, italic-serif
  accented headline ("Your roadmap should _not_ be passive."), sub-copy,
  primary CTA, secondary "See how it works" scroll button, trust line.
- Hero preview card rendered with real product primitives
  (`v2-card--focus v2-bracketed`, `v2-today-action` "// Today's mission",
  `v2-today-title`, `v2-done-criteria`, `v2-badge--today`).
- Execution loop section: numbered milestone rail with route badges
  (`/track`, `/today`, `/agent`, `/proof`, `/blocked`) and a return arrow
  closing the loop.
- Comparison section: ChatGPT / Notion / Trello vs StriveAI (bracketed card).
- 7-day track preview using `v2-day-card` styling (done / rescued / today /
  next / locked / recap).
- Final CTA card (bracketed, focused).

**Primary CTA**: `Start 7-day track →` → `/auth?mode=signup`.

**Next route**: `/auth`.

**Known gaps**: no inline goal capture; no social proof; secondary CTA only
scrolls to the loop section.

---

### `/auth` — Sign In / Create Account

**Purpose**: Get the user into the product.

**Main UI elements**:

- StriveAI logo + name.
- Tabs: `Sign in` | `Create account`. URL `?mode=signup` pre-selects
  Create account.
- Email input, password input.
- Inline error / success divs.
- Submit button (`Sign in` or `Create account` depending on mode).
- `Forgot password?` link (only on Sign in tab).
- `← Back` to `/landing`.

**Primary CTA**: Submit button — calls `actions.onSignIn` or
`actions.onSignUp` (Firebase Auth email/password).

**Next route**: after success → `/today` if user has an active track, else
`/onboarding`.

**Known gaps**: screen is visually disconnected from the editorial landing
(no kicker, no italic accent, no preview). Highest-priority UX fix.

---

### `/onboarding` — Onboarding (8 steps)

**Purpose**: Capture enough context for AI to build a meaningful Day 1.

**Steps** (state persisted in `localStorage` key `sv2_onboarding_draft`):

| Step | Title | Input |
|---|---|---|
| 1 | Goal category | One of 9 cards (project, startup, content, skill, career, study, habit, fitness, other) |
| 2 | Goal template + specific goal | Pick template card OR type specific goal |
| 3 | Main blocker | One of 8 (procrastinate, forget, overwhelmed, no_start, motivation, avoid, no_time, too_big) |
| 4 | Daily intensity | 10 / 25 / 45 / 60+ min per day |
| 5 | If-then rules | Pick 2–4 of 6 fallback behaviors |
| 6 | Telegram | Ping time (morning/afternoon/evening/custom) + optional bot connect |
| 7 | Escalation | What happens after 2 missed days (stricter message / friend message / restart promise / Tiny Mode / none) |
| 8 | Confirm | Setup summary + `Build my 7-day track →` |

**Main UI elements**: 8-dot progress strip, kicker `Step N of 8`, large
headline per step, `v2-sel-grid` of selection cards, error div, primary
"Continue →" button, secondary "← Back" button.

**Primary CTA on Step 8**: `Build my 7-day track →` — fires
`track_generate` AI action and navigates to `/plan-preview` on success.

**Next route**: `/plan-preview`.

**Known gaps**: 8 steps is long; Telegram + Escalation + If-Then could be
deferred to Settings. Step 2 has color drift on the selected-card sub-text
(hardcoded `#60a5fa`).

---

### `/confirm-track` — Confirm Track (minimal)

**Purpose**: Currently a stripped-down clone of `/plan-preview`. Shows the
goal + a flat list of all 7 day titles + a single `Start Day 1 →` button.

**Status**: Redundant with `/plan-preview`. Should be removed (the v2 client
currently does not route to it from onboarding).

---

### `/plan-preview` — Plan Preview

**Purpose**: Show the freshly generated 7-day plan and onboarding summary.

**Main UI elements**:

- "Plan ready" badge + goal headline.
- Setup summary card: Category, Blocker, Daily time, Telegram ping.
- Day 1 hero card (`v2-card--blue`): title, why, "Done when" pill, estimate.
- Day 2 secondary card.
- Days 3–7 as quiet rows in a single card.
- "StriveAI helps you execute each day" promise block (5 bullets).
- `Start Day 1 →` primary button.
- `Connect Telegram in Settings` secondary button.

**Primary CTA**: `Start Day 1 →` → fires `actions.onStartDay1` then
navigates to `/today`.

**Next route**: `/today`.

**Known gaps**: hardcoded blue tones on the Day 1 / Day 2 numbered circles
(color drift); no AI-generated rationale for the 7-day arc.

---

### `/today` — Today's Action (primary screen)

**Purpose**: The product. One concrete action per day, with execution CTAs.

**Main UI elements** (active state):

- Kicker: `Day {N} of 7` + status badge + goal as sub-text.
- Bracketed focus card (`v2-card v2-card--focus v2-bracketed`):
  `// Today's mission` eyebrow, `v2-today-title`, why, `v2-done-criteria`
  pill, estimate + category meta.
- Insight banner (if a failure pattern has been detected) using `v2-insight`.
- Primary CTA: `Start with Agent →`.
- Row 1: `Action Kit` | `I already did it`.
- Row 2: `I'm blocked` | `Skip today`.
- Telegram ping note (if connected).

**Variants**:

- `done` / `rescued`: green/blue card, proof line if present,
  "come back tomorrow" message or "Go to Day 7 Recap →" on Day 7.
- `blocked`: amber card + `Get Rescue Action →` + `Try Agent instead`.
- `skipped` / `missed`: muted card + "track will adapt" message + retry CTA.

**Primary CTA**: `Start with Agent →` → `/agent`.

**Next routes**: `/agent`, `/action-kit`, `/proof?source=main`,
`/blocked?type=blocked`, `/blocked?type=skipped`.

**Known gaps**: insight banner sits between the action card and the agent
button — easy to miss. "I already did it" feels like a secondary CTA
visually but is conceptually a Proof entry point.

---

### `/agent` — Agent Mode Workspace

**Purpose**: Guided execution via 3–5 ordered micro-steps + end-of-session
proof submission.

**Main UI elements**:

- Sticky left context panel (260px): Day N kicker, goal, task title, done
  criteria pill, estimate + category, optional pattern insight.
- Right column:
  - Step pills strip (`v2-step-pills`) showing done / active / upcoming
    states + `Step N of M` kicker.
  - Active step card: bracketed, `// Step N` eyebrow, instruction, textarea
    for note, `Complete Step →` and `I'm stuck` buttons.
  - Done steps as compact rows with ✓.
  - Upcoming steps as quiet rows.
  - `← Back to Today` ghost button.
- After last step: proof input view with type radio (`text` / `link` /
  `statement`), textarea, `Submit proof →`.
- After proof: verdict view (partial → resubmit + Get Rescue / Try Again,
  not-met → retry options).

**Primary CTA**: `Complete Step →` (per step), then `Submit proof →`.

**Next routes**: `/today` on success, `/blocked?type=blocked` on stuck.

**Known gaps**: sticky sidebar wraps awkwardly at medium widths; clicking
`I'm stuck` discards the in-progress step note.

---

### `/action-kit` — Action Kit

**Purpose**: Generate task-specific support material (templates, references,
questions, tools, quick tips) for today's task.

**Main UI elements**:

- Kicker `Action Kit · Day N of 7` + "Tools for today" headline +
  task title.
- Empty state with single `Generate Action Kit` button (calls
  `actions.onKitGenerate`).
- Item list with colored left-border per type (`v2-kit-item--template /
  --reference / --question / --tool / --tip`). Template items have a
  monospaced content area + `Copy` button.
- Row of `Start with Agent` (primary) + `I used this` (secondary) once a
  kit is generated.
- `← Back to Today` ghost.

**Primary CTA**: `Start with Agent` (after kit is generated).

**Next route**: `/agent` or `/today`.

**Known gaps**: 5 colored borders on type variants overlap with status
colors used elsewhere; no "Regenerate kit" option.

---

### `/proof` — Proof of Progress

**Purpose**: Submit proof and receive AI verdict.

**Main UI elements**:

- Header: `Proof of progress · Day N` (or `· Rescue` if `?source=rescue`).
- `Done means: …` pill above the form.
- Category-aware prompt + hint (e.g., "What did you build or fix today?"
  for `coding`).
- Radio list with allowed proof types per category
  (`v2-proof-type-option`).
- Textarea (`v2-textarea`) with category-aware placeholder.
- Submit button (currently `v2-btn--green` — color drift; should be
  `v2-btn--primary`).

**Verdict states** (after `v2_proof_check`):

- `met` — green card, "Day complete!" / "Rescue complete!" + optional note.
- `partial` — amber card, "Almost there", textarea + `Resubmit →` + `Start over`.
- `not_met` — red card, "Needs more work", `← Try again` + `Back to Today`.

**Primary CTA**: `Submit proof →`.

**Next route**: `/today` on completion.

**Known gaps**: submit color drift; no example of "what counts as proof"
above the form; no explicit "accept partial as rescue" path.

---

### `/blocked` — Blocked / Skipped

**Purpose**: Capture the blocker, generate a Rescue Action.

**Query string**: `?type=blocked` (default) or `?type=skipped`.

**Main UI elements**:

- Kicker: `Day N` + `Blocked` or `Skip` badge.
- Headline: "What blocked you?" or "Why are you skipping?".
- 7 reason pills (`v2-reason-pill`): no_time, too_big, unclear_start,
  low_energy, avoiding, forgot, not_important.
- `Get rescue action →` (amber) — fires `actions.onBlockerDiagnose` which
  calls the `rescue_action` AI action.
- Loading view with amber spinner.
- Rescue view: optional "Pattern repeating" amber call-out, reframe note
  insight block, rescue card with rescue title + numbered steps + minutes.
- Outcome buttons: `Start Rescue with Agent` (primary), `Mark Rescued`
  (green), `Accept missed day` (ghost).

**Primary CTA**: `Get rescue action →`, then `Start Rescue with Agent` or
`Mark Rescued`.

**Next routes**: `/agent` (run the rescue), `/today` (after outcome).

**Known gaps**: reasons are all visually equal — no signal that some are
root-causes vs symptoms; no "switch tracks" CTA on repeating patterns.

---

### `/progress` — Progress

**Purpose**: Show the week's timeline, stats, and pattern.

**Main UI elements**:

- Section head: `7-Day Track` kicker + "Your progress" headline + goal
  sub-text. `View Recap →` button if `track.status === 'complete'`.
- Completion card: `v2-progress` bar + "X of Y days complete · N%".
- Stats grid (`v2-stats-grid`): Days returned, Done, Rescued, Missed,
  Skipped, Agent sessions.
- 7-Day Timeline: `v2-day-card` rows with colored left-stripes (done /
  rescued / blocked / missed / skipped / today). Today card is bracketed.
- Recurring-pattern amber card if 2+ patterns of the same category.
- `← Back to Today` ghost.

**Primary CTA**: `View Recap →` (Day 7) or `← Back to Today`.

**Next route**: `/recap` or `/today`.

**Known gaps**: six different stat colors compete with the timeline;
day cards are not clickable.

---

### `/recap` — Day 7 Recap

**Purpose**: Reflect on the completed track, choose to continue or start
fresh.

**Main UI elements**:

- "Week complete" badge + "Your 7-day track is complete." headline + goal.
- Results grid (`v2-stats-grid`): Days returned, Done, Rescued, Missed,
  Unanswered, Agent sessions.
- Top-pattern amber card if `failurePatterns` exist.
- Best-working-format insight ("Agent mode helped you finish more days"
  / "Self-directed" / "Mixed").
- AI reflection card: generated on-demand via the `day7_recap` action.
  Empty state shows "Generate reflection →" ghost link.
- CTA stack:
  - `Continue this goal — next 7 days →` (primary) — fires
    `track_continue`.
  - `Start a new 7-day track` (secondary).
- Bottom row: `Export my pattern` (copies plain text), optional
  `Adjust Telegram ping` if connected.
- `View full progress →` link to `/progress`.

**Primary CTA**: `Continue this goal — next 7 days →`.

**Next routes**: `/today` (continuation), `/onboarding` (new track),
`/progress`, `/settings`.

**Known gaps**: continue / new-track presented equally; "Generate
reflection" is a weak ghost link; no structured "What changed about you"
insight.

---

### `/settings` — Settings

**Purpose**: Manage account + Telegram.

**Main UI elements**:

- Kicker `Settings` + "Your account" headline.
- **Profile** card: email + experience level (read-only display).
- **Telegram** card: connection status, ping hour, connect/disconnect
  button.
- **Account** card: `Sign out` (danger).

**Primary CTA**: contextual per card.

**Next route**: `/landing` on sign-out.

**Known gaps**: cannot edit daily intensity, blocker, if-then rules,
escalation rule, ping hour, profile name, or goal category — all captured
in onboarding but not exposed here. No restart/pause-track or
delete-account affordance. The Telegram connect button currently routes
to `/today` instead of running the full link flow on this page.

---

### `/not-found` — 404

**Purpose**: Catch any path outside the `V2_ROUTES` allowlist.

**Main UI elements**: kicker + large "404" + "Page not found" headline +
`Go to Today →` button.

**Primary CTA**: `Go to Today →`.

---

## Navigation Shell

The authenticated app shell (`buildShellNav` in `frontend/app.js`) renders
a top nav on every authenticated route:

```
[StriveAI logo]    [Today] [Track] [Settings]    [Day N of 7] [avatar]
```

- `Today` tab is active for `/today`, `/agent`, `/action-kit`, `/proof`,
  `/blocked`, `/recap`, `/onboarding`, `/confirm-track`, `/plan-preview`.
- `Track` tab is active for `/progress`.
- `Settings` tab is active for `/settings`.
- The `Day N of 7` chip is shown when a track exists.

Public routes (`/landing`, `/auth`) render without the nav shell.

---

## Removed Routes (v1 → v2)

| v1 Route | v2 Status | Replaced by |
|---|---|---|
| `/` | Removed | `/landing` (no implicit landing at `/`) |
| `/register` | Removed | `/auth?mode=signup` |
| `/generating` | Removed | Inline loading state in onboarding Step 8 |
| `/kit` | Renamed | `/action-kit` |
| `/track` | Renamed | `/progress` |
| `/history` | Merged | `/progress` (timeline) + `/recap` (results) |
| `/dashboard` | Removed | `/today` is the primary screen |
| `/work` | Removed | Replaced by the 7-day track model |
| `/goals` | Removed | Single goal per track |
| `/notes` (AI Chat) | Removed | Replaced by Agent Mode (task-scoped) |
| `/analytics` | Removed | Not in MVP scope |
| `/billing` | Removed | No billing in MVP |
| `/roadmap` | Removed | Replaced by 7-day linear track |
