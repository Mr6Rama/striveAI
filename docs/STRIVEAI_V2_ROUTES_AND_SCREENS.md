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
| `/onboarding` | auth | `onboarding.js` | Multi-step setup wizard (includes Commitment + Rest day) |
| `/confirm-track` | auth | `confirm-track.js` | Minimal "track ready" confirmation (overlaps with `/plan-preview`) |
| `/plan-preview` | auth + track | `plan-preview.js` | Full plan preview after generation |
| `/today` | auth + track | `today.js` | Primary daily screen |
| `/agent` | auth + track | `agent.js` | Agent Mode — 3–5 micro-steps + proof |
| `/action-kit` | auth + track | `action-kit.js` | AI-generated material for today's task |
| `/proof` | auth + track | `proof.js` | Proof of Progress submission + AI verdict |
| `/blocked` | auth + track | `blocked.js` | Blocker reason → Rescue Action |
| `/progress` | auth + track | `progress.js` | Vertical Journal Spine + stats + pattern |
| `/recap` | auth | `recap.js` | End-of-track recap (Spark or Track variant) |
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

**Known gaps**: landing copy and preview still describe the 7-day model
only — needs to surface both Spark and Track and let the user understand
the two-tier offer before signup. No inline goal capture; no social proof;
secondary CTA only scrolls to the loop section.

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

### `/onboarding` — Onboarding (multi-step)

**Purpose**: Capture enough context for AI to build a meaningful Day 1,
and let the user pick their commitment length (Spark vs Track).

**Steps** (state persisted in `localStorage` key `sv2_onboarding_draft`).
Step 6 (Rest day) is **conditionally rendered** — shown only when
Step 5 Commitment was `track`; skipped when `spark`. Step numbers below
assume Track is selected; with Spark, Step 6 is omitted and subsequent
steps shift up by one.

| Step | Title | Input |
|---|---|---|
| 1 | Goal category | One of 9 cards (project, startup, content, skill, career, study, habit, fitness, other) |
| 2 | Goal template + specific goal | Pick template card OR type specific goal |
| 3 | Main blocker | One of 8 (procrastinate, forget, overwhelmed, no_start, motivation, avoid, no_time, too_big) |
| 4 | Daily intensity | 10 / 25 / 45 / 60+ min per day |
| **5 (NEW)** | **Commitment** | Two-card pill picker: **Spark** (7-day probe — "see if it fits, ship a first artifact") vs **Track** (30-day execution — "4 phases, weekly rest day, real artifact by week 4"). Writes `trackKind: 'spark' \| 'track'` to the draft. |
| **6 (NEW, Track only)** | **Rest day** | Weekday picker (Sun … Sat as 7 pills). User picks the weekday they want as their weekly rest day. Writes `restDay: 0–6` to the draft. Hidden entirely when `trackKind === 'spark'`. |
| 7 | If-then rules | Pick 2–4 of 6 fallback behaviors |
| 8 | Telegram | Ping time (morning/afternoon/evening/custom) + optional bot connect |
| 9 | Escalation | What happens after 2 missed days (stricter message / friend message / restart promise / Tiny Mode / none) |
| 10 | Confirm | Setup summary + `Build my track →` (label switches per `trackKind`: "Build my 7-day Spark →" or "Build my 30-day Track →") |

**Main UI elements**: progress strip sized to the active step count (9 dots
for Spark, 10 for Track), kicker `Step N of M`, large headline per step,
`v2-sel-grid` of selection cards, error div, primary "Continue →" button,
secondary "← Back" button. Step 5 Commitment uses a two-card large pill
layout (not the small `v2-sel-grid`) so the trade-off is obvious. Step 6
Rest day uses a 7-pill row with weekday short names.

**Primary CTA on final step**: branches on `trackKind`:
- `spark` → fires `spark_generate` and navigates to `/plan-preview`.
- `track` → fires `track_generate_30` (with `preferredRestDay` injected
  into the prompt) and navigates to `/plan-preview`.

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

**Purpose**: Show the freshly generated Spark (7-day) or Track (30-day) plan and onboarding summary.

**Main UI elements**:

- "Plan ready" badge + goal headline.
- Setup summary card: Category, Blocker, Daily time, Commitment
  (Spark / Track), Rest day (Track only), Telegram ping.
- **Narrative arc** (Track only): a one-line "story arc" summary
  describing the 30 days by phase. Example:
  *"Week 1 you lay the skeleton; Week 2 you build the core; Week 3 you
  validate with users; Week 4 you ship."*
  Rendered above the Day 1 hero, with each phase name bolded.
- Day 1 hero card (`v2-card--blue`): title, why, "Done when" pill, estimate.
- Day 2 secondary card.
- Remaining-day outline (in a single card):
  - **Spark**: Days 3–7 as quiet rows.
  - **Track**: collapsed weekly groups (Week 1 expanded, Weeks 2–4
    collapsed). Rest days are visually marked with a `Rest` chip.
- "StriveAI helps you execute each day" promise block (5 bullets).
- `Start Day 1 →` primary button.
- `Connect Telegram in Settings` secondary button.

**Primary CTA**: `Start Day 1 →` → fires `actions.onStartDay1` then
navigates to `/today`.

**Next route**: `/today`.

**Known gaps**: hardcoded blue tones on the Day 1 / Day 2 numbered circles
(color drift); `track_generate_30` must output the per-phase narrative line
used by the Track arc summary.

---

### `/today` — Today's Action (primary screen)

**Purpose**: The product. One concrete action per day, with execution CTAs.

**Main UI elements** (active state):

- **Breadcrumb header** (replaces the old SVG roadmap on this page):
  - Track: `Week {N} · Day {D} of {totalDays} — {phaseName}` (e.g.
    "Week 2 · Day 9 of 30 — Build").
  - Spark: `Day {D} of 7 — Spark`.
  - Followed by status badge + goal as sub-text.
- Bracketed focus card (`v2-card v2-card--focus v2-bracketed`):
  `// Today's mission` eyebrow, `v2-today-title`, why, `v2-done-criteria`
  pill, estimate + category meta.
- Insight banner (if a failure pattern has been detected) using `v2-insight`.
- Primary CTA: `Start with Agent →`.
- Row 1: `Action Kit` | `I already did it`.
- Row 2: `I'm blocked` | `Skip today`.
- Telegram ping note (if connected).
- Quiet footer link: `See the full journey →` → `/progress` (where the
  Vertical Journal Spine now lives).

**Variants**:

- `done` / `rescued`: green/blue card, proof line if present,
  "come back tomorrow" message — or, on the final day of the cycle,
  `Go to Recap →` (Spark Day 7 or Track Day 30).
- `blocked`: amber card + `Get Rescue Action →` + `Try Agent instead`.
- `skipped` / `missed`: muted card + "track will adapt" message + retry CTA.
- `rest` (Track only): cream/sand card, `// Rest day` eyebrow, short
  "Recover and reflect" prompt, no action CTAs, optional `Open Journal →`
  link to `/progress`. Day is not recorded as missed and does not impact
  the streak.

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

### `/progress` — Progress (Vertical Journal Spine)

**Purpose**: Show the entire journey as a **Vertical Journal Spine** —
collapsible weekly sections with always-visible day titles. Replaces the
v2 SVG sinusoid roadmap component (and absorbs the old "7-Day Timeline"
section).

**Main UI elements**:

- Section head:
  - Track: `30-Day Track` kicker + "Your journey" headline + goal
    sub-text + "Day {D} of 30 · Week {N} — {phaseName}" line.
  - Spark: `7-Day Spark` kicker + "Your week" headline + goal sub-text.
  - `View Recap →` button if `track.status === 'complete'`.
- Completion card: `v2-progress` bar + "X of Y days complete · N%"
  (rest days excluded from the denominator).
- Stats grid (`v2-stats-grid`): Done, Rescued, Missed, Skipped,
  Rest (Track only), Agent sessions.
- **Vertical Journal Spine** (primary content):
  - Track: 4 collapsible week sections. Each section header shows the
    AI-generated phase name (`{phaseName}`), week number, role pill,
    and per-week completion mini-bar. The **active week is expanded by
    default**; past weeks are collapsed; future weeks are collapsed and
    visually dimmed. Inside each section: one row per day with
    always-visible day title, status chip, and a colored left-stripe
    (done / rescued / blocked / missed / skipped / today / rest /
    locked). Clicking a row expands an artifact panel underneath:
    submitted proof text/link plus collapsed agent steps from that day.
    The "today" row is bracketed.
  - Spark: a single un-collapsible section (no phase header) containing
    7 day rows in the same format. No rest rows (Spark has none).
- Recurring-pattern amber card if 2+ patterns of the same category.
- `← Back to Today` ghost.

**Primary CTA**: `View Recap →` (end-of-cycle) or `← Back to Today`.

**Next route**: `/recap` or `/today`.

**Known gaps**: artifact-panel expansion state is per-session only (not
persisted); week-header mini-bars and stat-grid colors may compete and
need a single muted palette.

---

### `/recap` — End-of-Track Recap

**Purpose**: Reflect on the completed cycle and decide what's next. Two
variants, selected by `track.kind`.

---

#### Variant A — Spark Recap (`track.kind === 'spark'`)

Short layout. Designed to convert Spark → Track.

**Main UI elements**:

- "Spark complete" badge + "Your 7-day Spark is complete." headline + goal.
- Results grid (`v2-stats-grid`): Done, Rescued, Missed, Skipped,
  Agent sessions.
- Top-pattern amber card if `failurePatterns` exist.
- AI reflection card: generated on-demand via the `day7_recap` action
  (Spark variant prompt).
- **Track value-prop inline block** (short, 3 bullets): explains what a
  30-day Track adds — 4 weekly phases, weekly rest day, shippable
  artifact by week 4.
- CTA stack:
  - `Continue → 30-day Track` (primary) — fires `spark_to_track_extend`.
    If `user.preferredRestDay` is null, first prompt for a weekday pick
    inline before submitting.
  - `Start something new` (secondary) — restarts `/onboarding` from Step 1.
- Bottom row: `Export my pattern` (copies plain text), optional
  `Adjust Telegram ping` if connected.
- `View full journey →` link to `/progress`.

**Primary CTA**: `Continue → 30-day Track`.

**Next routes**: `/today` (after extension), `/onboarding` (start new),
`/progress`, `/settings`.

---

#### Variant B — Track Recap (`track.kind === 'track'`)

Full layout. Designed for a real "what now" decision after 30 days.

**Main UI elements**:

- "Track complete" badge + "Your 30-day Track is complete." headline + goal.
- Results grid (`v2-stats-grid`): Done, Rescued, Missed, Skipped, Rest,
  Agent sessions. Rest is shown for transparency and is excluded from
  any "missed" calculation.
- **Phase result cards** (4 cards in a row): one per week. Each shows
  week number, AI-generated phase name, phase role pill, completion %,
  and the top outcome ("strong week", "wobbled", "mostly missed").
- **Artifact timeline grouped by week**: 4 collapsible groups, each
  listing the submitted proofs (text + links) from that week's days,
  ordered by day.
- Top-pattern amber card if `failurePatterns` exist.
- Best-working-format insight ("Agent mode helped you finish more days"
  / "Self-directed" / "Mixed").
- AI reflection card: generated on-demand via the `day7_recap` action
  (Track variant prompt — names the strongest and weakest phase).
- CTA stack:
  - `Extend +30 days` (primary) — fires `track_continue_30`.
    Inherits the existing `restDayOfWeek`.
  - `Pivot to a new goal` (secondary) — restarts `/onboarding` from
    Step 1; Commitment defaults to Track.
  - `Pause` (tertiary, ghost) — sets `track.status = 'paused'`.
- Bottom row: `Export my pattern` (copies plain text), optional
  `Adjust Telegram ping` if connected.
- `View full journey →` link to `/progress`.

**Primary CTA**: `Extend +30 days`.

**Next routes**: `/today` (extension or paused state), `/onboarding`
(pivot), `/progress`, `/settings`.

**Known gaps**: variant switching is internal to `recap.js`; "Generate
reflection" still a weak ghost link in early implementations.

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
[StriveAI logo]    [Today] [Journey] [Settings]    [Day N of {totalDays} · {phaseName}] [avatar]
```

- `Today` tab is active for `/today`, `/agent`, `/action-kit`, `/proof`,
  `/blocked`, `/recap`, `/onboarding`, `/confirm-track`, `/plan-preview`.
- `Journey` tab is active for `/progress` (label updated from `Track` to
  reflect the Vertical Journal Spine model).
- `Settings` tab is active for `/settings`.
- The day chip shows:
  - Track: `Day {N} of 30 · {phaseName}` (e.g., "Day 9 of 30 · Build").
  - Spark: `Day {N} of 7 · Spark`.
  Chip is shown when a track exists.

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
