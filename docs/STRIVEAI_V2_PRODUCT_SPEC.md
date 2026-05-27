# StriveAI MVP v2 — Product Specification

## What This Document Is

Engineering and design reference for the StriveAI v2 MVP. Not a pitch doc.
All decisions here are final for MVP scope unless explicitly marked `[LATER]`.

This is the **source of truth** for product behavior. Route specs are in
`STRIVEAI_V2_ROUTES_AND_SCREENS.md`, state in `STRIVEAI_V2_STATE_MODEL.md`,
AI actions in `STRIVEAI_V2_AI_ACTIONS.md`.

---

## Core Principle

StriveAI is a **two-tier AI execution agent for builders.** It offers two
commitment lengths, chosen during onboarding:

- **Spark** — a **7-day probe cycle**. Linear, no phases, no rest days. Its
  purpose is proof-of-fit and producing a first artifact. Spark is optional
  and is the lighter on-ramp for users who aren't ready to commit to 28 days.
- **Track** — a **28-day execution cycle** (4 weeks × 7 days). Structured
  into **4 weekly phases** whose names are AI-generated per goal (e.g.,
  fitness: "Baseline / Build / Peak / Maintain"; project: "Foundations /
  Build / Validate / Ship"). Includes exactly **1 rest day per week** on a
  weekday the user picks during onboarding. Rest days never count as missed.

StriveAI is not a planner, not a STEM app, not a billing product, and not a
general chatbot.

The product does not stop at generating a plan. Every day it:

1. **Sharpens the goal** during onboarding — turns vague intent into a
   specific artifact-anchored sentence before the track is generated.
2. Surfaces one concrete daily action with a clear "done means" criterion.
   The **first agent step is previewed** on the Today screen to break inertia.
3. Helps the user execute that action inside the product via **Agent Mode**
   (3–5 ultra-specific micro-steps with exact commands, file names, snippets).
   Users can tap **"Help with this step →"** for targeted inline unblocking.
4. After each step: fires a **micro-coaching chip** (fire-and-forget) noting
   whether the step output looks right.
5. Optionally produces an **Action Kit** of task-specific templates,
   questions, and tips.
6. Asks for **Proof of Progress** and judges it as met / partial / not-met.
7. Runs a **Diagnosis-First Rescue** when blocked: asks where they got stuck
   and what they tried, then answers the specific blocker (or shrinks the task
   if no diagnosis was given).
8. Updates **Failure Pattern Memory** based on the outcome.
9. Adapts the next day's task to reflect what actually happened.
10. On Track: delivers a **Weekly Ship Checkpoint** (what shipped, on-track flag,
    next-week focus) after each completed week.
11. Shows a **Pace Warning** when the user is behind 70% completion rate.

Telegram is an optional accountability ping, not the core of the product.

### Design direction

- Paper/editorial visual language: warm cream background, ink text, one
  Strive blue accent.
- Heavy sans display headlines with italic serif accent words.
- Brackets on focus surfaces (Today action card, Plan preview Day 1,
  Progress today card).
- Roadmap / milestone rail as the signature visual identity.
- Product-native landing — not a generic AI SaaS marketing template.
- No rainbow gradients. No childish startup illustrations. No generic
  "AI orbs".

---

## Target Users

Young builders in execution mode:
- Student working on a portfolio project or exam
- Indie builder shipping an MVP
- Founder validating a startup idea
- Creator building a content presence
- Person changing careers or learning a skill
- Habit or health goal in progress

Common profile: 16–30, working alone or in a small group, motivated but prone to stalling, needs a daily execution structure, not a motivational coach.

---

## Goal Categories (Onboarding Step 1)

| ID | Label |
|---|---|
| `project` | Build a project / MVP |
| `startup` | Startup / idea validation |
| `content` | Content / personal brand |
| `skill` | Learn a skill |
| `career` | Career / portfolio |
| `study` | Study / exam |
| `habit` | Habit / self-development |
| `fitness` | Fitness / health |
| `other` | Other |

No STEM category. No locked-down per-category logic at MVP. The category feeds the AI prompt context only.

---

## MVP Decisions (Hard)

| Decision | Chosen |
|---|---|
| Auth | Email/password only. No Google, no social login, no magic link. |
| Accountability channel | Telegram only. No email ping. No push notification. |
| Deployment | Vercel (canonical). `firebase.json` kept as a record but Firebase Hosting is not active. |
| AI backend | Existing Express OpenAI proxy at `POST /api/openai/generate`. Reused, not replaced. |
| Database namespace | Fresh `sv2_*` keys. v1 `sa_*` keys are read-only (migration guard). |
| Billing | None. Freemium. No pricing screens. No Stripe, no PayPal. |
| Agent Mode | Required. Guided 3–5 micro-step execution. Not an open chatbot. |
| Track length | Two-tier model: optional **Spark** = 7 days (linear), default **Track** = 30 days (4 weekly phases). Chosen in onboarding "Commitment" step. |
| Phase structure | Track only. 4 weekly phases. **Phase names are AI-generated per goal** (no fixed list). Spark has no phases. |
| Rest day | Track only. Exactly 1 rest day per week, on a weekday the user picks during onboarding. Rest days are auto-set to `rest` status and never count as missed. Spark has no rest days. |
| Spark Day 7 | Recap screen. Primary CTA "Continue → 30-day Track" (calls `spark_to_track_extend`). Secondary CTA "Start something new". |
| Track Day 30 | Recap screen. CTAs: Extend +30 days (`track_continue_30`) / Pivot to new goal / Pause. |
| STEM mode | Completely removed. No STEM labels, prompts, routes, fallbacks, or UI. |

---

## Track Models: Spark and Track

Two commitment lengths. The user picks one in the onboarding Commitment step.
The rest of the product (Today, Agent Mode, Action Kit, Proof, Blocked,
Rescue, Failure Pattern Memory, Telegram) is identical between them — only
the length, structure, and recap differ.

| Dimension | Spark | Track |
|---|---|---|
| Length | 7 days | 30 days |
| Structure | Linear, no phases | 4 weekly phases (weeks 1–4) |
| Phase names | n/a | AI-generated per goal (e.g., "Baseline / Build / Peak / Maintain") |
| Rest day | None — work every day | 1 per week, on a weekday the user picks during onboarding |
| Rest-day handling | n/a | `day.status = 'rest'`; never recorded as missed |
| Purpose | Proof-of-fit; produce a first artifact | Sustained execution; ship a real artifact by week 4 |
| AI generator | `spark_generate` | `track_generate_30` |
| Recap | Spark Recap (Day 7): short, upsell to Track | Track Recap (Day 30): full results by phase |
| Primary next step | "Continue → 30-day Track" (`spark_to_track_extend`) | "Extend +30 days" (`track_continue_30`) |
| Secondary next step | "Start something new" | "Pivot to new goal" / "Pause" |

---

## Core Product Loop

```
Landing  →  Auth  →  Onboarding
                        ↓
              Commitment step: Spark (7d) or Track (30d)
                        ↓
         ┌───────────────┴──────────────────┐
         ▼                                  ▼
  AI: spark_generate                AI: track_generate_30
  (7 days, linear)                  (30 days, 4 AI-named phases,
                                     1 rest day/week)
         ↓                                  ↓
              Plan Preview (Spark or Track variant)
                        ↓
              ┌────  Today's Action  ◀───────────────┐
              │            ↓                          │
              │  Rest day? → today.status = 'rest'    │
              │            ↓                          │
              │  User picks one of:                   │
              │    [Start with Agent] → Agent Mode    │
              │    [Action Kit]       → Action Kit    │
              │    [Proof]            → Proof flow    │
              │    [Blocked]          → Rescue Action │
              │    [Skip]             → logged        │
              │            ↓                          │
              │  Outcome recorded                     │
              │            ↓                          │
              │  Failure Pattern Memory updated       │
              │            ↓                          │
              │  Telegram daily ping (if connected)   │
              │            ↓                          │
              └──  AI adapts tomorrow's task  ────────┘
                        ↓
         ┌──────────────┴──────────────┐
         ▼                             ▼
  Spark Recap (Day 7)           Track Recap (Day 30)
   ├─ Continue → 30-day Track    ├─ Extend +30 (track_continue_30)
   │  (spark_to_track_extend)    ├─ Pivot to new goal
   └─ Start something new        └─ Pause
```

---

## Full User Journey

### New User

1. **`/landing`** — paper-editorial front door with product-native preview card.
   Primary CTA: "Start your track →" (commitment is chosen in onboarding).
2. **`/auth`** — email + password (Firebase Auth). Tab to switch sign-in /
   create-account. Inline errors.
3. **`/onboarding`** — multi-step setup wizard. The Commitment step
   branches the rest of the journey:
   - Step 1: Goal category (9 categories)
   - Step 2: Goal template + specific goal text
   - Step 3: Main blocker (8 options)
   - Step 4: Daily intensity (4 levels)
   - **Step 5 (NEW): Commitment** — Spark (7-day probe) or Track (30-day).
   - **Step 6 (NEW, Track only): Rest day** — pick the weekday for the
     weekly rest day (Sun–Sat). Skipped entirely when Spark was chosen.
   - Step 7: If-then rules (pick 2–4 of 6)
   - Step 8: Telegram ping time + optional bot connect
   - Step 9: Escalation rule (what should happen after 2 missed days)
   - Step 10: Confirm & generate
   - Numbering shifts; canonical step table in
     `STRIVEAI_V2_ROUTES_AND_SCREENS.md`.
4. **Track generation** — branches on Commitment:
   - Spark → `spark_generate` (7 days, linear).
   - Track → `track_generate_30` (30 days, AI-named 4 weekly phases, rest
     day woven in on the chosen weekday).
   UI shows "Building your track…" with deterministic fallback if AI fails.
5. **`/plan-preview`** — setup summary + Day 1 hero card + Day 2 secondary.
   For Track: a one-line "story arc" narrative across the 4 phases.
   For Spark: Days 3–7 outline. Both end with the "StriveAI helps you
   execute each day" promise block.
6. **`/today`** — Day 1 action card with bracketed focus styling. Header
   breadcrumb is `Week {N} · Day {D} of {totalDays} — {phaseName}` (Track)
   or `Day {D} of 7 — Spark` (Spark). Buttons: `Start with Agent` (primary),
   `Action Kit`, `I already did it`, `I'm blocked`, `Skip today`.
7. **Execution** — Agent Mode / Action Kit / Proof / Blocked flow.
8. **Day closes** — outcome recorded; `adapt_day` is called for tomorrow
   (Track: phase-aware prompt — does not violate phase role boundaries).
9. **Subsequent days** — same loop. Track adapts based on outcomes +
   failure patterns. Rest days (Track) auto-set to `rest` and not counted
   as missed.
10. **End of cycle**:
    - Spark Day 7 → `/recap` Spark Recap (short, upsell-focused) →
      Continue to 30-day Track OR Start something new.
    - Track Day 30 → `/recap` Track Recap (full, results by phase) →
      Extend +30 / Pivot to new goal / Pause.

### Returning User

1. Auth → load state from Firestore (`sv2_*` keys), mirror to localStorage.
2. Rollover: if yesterday's action is still `pending`, auto-mark as `missed`
   and run pattern analysis.
3. Land on `/today` for the current day (or `/recap` if track is complete).

---

## Status System

### Track-level fields

Every active cycle (Spark or Track) lives at `sv2_track` with:

- `track.kind: 'spark' | 'track'` — which model is running.
- `track.totalDays: 7 | 30` — derived from `kind`.
- `track.phases: Phase[] | null` — `null` for Spark; length 4 for Track
  (one per week, AI-named).
- `track.currentWeekNumber: 1–4 | null` — `null` for Spark.
- `track.restDayOfWeek: 0–6 | null` — weekday (Sun=0) chosen during
  onboarding; `null` for Spark.

### Track-level statuses

| Status | Meaning |
|---|---|
| `generating` | AI is building the track (Spark or Track) |
| `active` | Track is running |
| `paused` | User manually paused (day is frozen). For Track, used by the "Pause" recap CTA. |
| `complete` | End-of-cycle recap reached (Day 7 for Spark, Day 30 for Track) |
| `abandoned` | User started a new track mid-run [LATER] |

### Day-level statuses

| Status | Meaning |
|---|---|
| `pending` | Not yet acted on |
| `in_progress` | Agent/Kit session open |
| `done` | Proof submitted or marked done |
| `blocked` | User reported blocked; rescue action triggered |
| `skipped` | User explicitly skipped |
| `missed` | Day passed without action (auto-set on rollover) |
| `rescued` | Blocked but completed rescue action |
| `rest` | Track only. Auto-set on the weekly rest day. **Never counts as missed.** Not recorded in `history.entries` as an outcome. |

### Action outcomes (recorded in history)

`done` | `blocked` | `skipped` | `missed` | `rescued`

`rest` is a day status only — it is **not** an action outcome and is **not**
appended to `sv2_history.entries`.

---

## Failure Pattern Memory

Purpose: track repeated blockers across days so the AI can adapt intelligently
instead of resurfacing the same unworkable task.

What is recorded per `blocked` or `skipped` event in
`sv2_history.failurePatterns[]`:

- `id` — `fp-{timestamp}`
- `date` — ISO date
- `dayNumber` — which day in the track
- `trackId` — owning track
- `taskTitle` — text of the action that failed
- `blockerText` — user's description of the blocker (from the Blocked reason picker)
- `blockerCategory` — inferred category: `time` | `skill_gap` | `no_access` | `unclear` | `motivation` | `external` | `other`
- `rescueOffered` — was a Rescue Action generated
- `rescueCompleted` — did the user complete it

Pattern triggers (MVP):

- Same blocker category appears 2+ times → AI receives the pattern summary in
  the next day's `adapt_day` prompt, and `/today` shows an insight banner.
- 3+ consecutive `missed` days → AI is asked to offer a track reset or
  re-scope suggestion (planned; currently surfaces only as the recurring-
  pattern card on `/blocked`).

Pattern data is summarised by `buildPatternSummary()` before being injected
into AI prompts (see `STRIVEAI_V2_AI_ACTIONS.md`).

---

## Rescue Action Logic

Triggered when user taps **Blocked** on Today's Action.

Flow:
1. User opens Blocked modal. Prompted: "What's stopping you? (optional short note)"
2. User submits. Backend calls `rescue_action` AI action with: task title, stage context, blocker text, past failure patterns (if any).
3. AI returns a `rescueAction` object: smaller/rephrased version of the task, 1–3 concrete sub-steps, optional reframe note.
4. Rescue Action card replaces the blocked action card for the remainder of the day.
5. If user completes rescue: day status = `rescued`. Outcome = `rescued`.
6. If user does not complete rescue: day status stays `blocked`.

Fallback (if AI fails): deterministic rescue — break the blocked task into 3 fixed 20-minute micro-steps.

---

## Minimal Agent Workspace

Triggered when user taps **Start with Agent** on Today's Action.

This is NOT a general chatbot. It is a guided execution session for today's specific action.

### Session structure

1. **Agent reads the day's action** and generates 3–5 ordered micro-steps specific to that task. These are shown as a checklist.
2. **User works through steps** one at a time. Can tap "Done" on each step.
3. **Per step, user can**: mark done, say they're stuck (inline hint generated), or skip this step.
4. **At the end**: user is prompted to submit a proof (text or link). Optional.
5. **Session closed**: outcome = `done` (or `blocked` if no steps completed).

### Agent rules

- Steps are task-specific, not generic. "Write 3 cold DM scripts" not "reach out to people".
- Max 5 steps per session.
- Each step is 15–45 minutes of work.
- No open-ended chat. The agent responds only to the current step's context.
- If user types a question outside the step, agent answers briefly and redirects to the step.

### State saved during session

`sv2_today.agentSession`: `{ steps[], currentStepIndex, startedAt, closedAt, outcome }`

---

## Action Kit Logic

Alternative to Agent Mode. For users who prefer to work independently.

Content: 3–5 curated resources relevant to the day's task type. At MVP these are dynamically generated by AI (`action_kit` action), not a static library.

Kit contents (AI-generated per task):
- 1 template or framework (e.g., "user interview script")
- 1 reference or definition (e.g., "what PMF means concretely")
- 1 specific prompt or question to guide the work
- 1 optional tool suggestion (no installs required)

Kit does not require internet resources to be fetched — AI generates the text inline. No external URL lookups.

---

## Proof of Progress

User can submit proof from `/today` ("I already did it"), from the Agent Mode
end screen, or from the Rescue Action flow.

Proof types (user chooses one):

- `text` — free-text note: "I did X, result was Y"
- `link` — URL to artifact (GitHub commit, doc, post, etc.)
- `statement` — short confirmation: "I confirm I completed this task"

Submission flow:

1. User fills `proofText`, selects `proofType`, and submits.
2. Frontend calls the `v2_proof_check` AI action with the day's
   `successCriteria` + user input.
3. AI returns a verdict: `met` | `partial` | `not_met`, plus a short note.
4. UI shows the verdict in a colored card:
   - **met** — day status → `done` (or `rescued` if entered via Rescue flow);
     outcome recorded in `sv2_history.entries`.
   - **partial** — show "Almost there" amber state. User can add more proof
     and resubmit, or start over.
   - **not_met** — show red state with the verdict note. User can try again
     or return to `/today`.
5. `sv2_today.proof` is saved with `{ type, value, submittedAt }`.
6. On `met`, `adapt_day` is fired for tomorrow.

Proof is judged for the user's own accountability. The `v2_proof_check`
action falls back to `partial` when AI is unavailable.

---

## End-of-Track Recap

The `/recap` screen has **two variants**, selected by `track.kind`.

### Variant A — Spark Recap (Day 7, `track.kind === 'spark'`)

Short, upsell-focused. Designed to convert a successful Spark into a Track.

Shows:
- Days completed vs missed vs blocked vs skipped (7-cell grid)
- Streak count
- Proof submissions count
- Rescue completions count
- Failure patterns encountered (brief summary)
- Goal text restated
- AI-generated 1-paragraph reflection (`day7_recap` action)
- Short inline value-prop block explaining what a 30-day Track adds
  (phase structure, weekly rest day, shippable artifact by week 4)

CTAs:

```
What's next?

[ Continue → 30-day Track ]    ← primary, calls spark_to_track_extend
[ Start something new ]        ← secondary, returns to onboarding Step 1
```

**Continue → 30-day Track**
- Calls `spark_to_track_extend` with the original goal, all 7 days of
  outcomes, all proof texts, failure patterns.
- AI generates a 30-day Track that explicitly continues the user's
  progress from Spark — does not restart from scratch.
- Old Spark archived to `sv2_history.archivedTracks[]` (with `kind: 'spark'`).
- New active `track.kind = 'track'`, `totalDays = 30`, `phases` populated,
  `restDayOfWeek` set from `user.preferredRestDay` (prompt the user to pick
  if it wasn't set during Spark onboarding).
- `today = createDefaultTodayV2(today's date, 1)`.

**Start something new**
- Current Spark archived.
- Onboarding restarts from Step 1 (Goal category).

### Variant B — Track Recap (Day 30, `track.kind === 'track'`)

Full reflection. Designed for a "what now" decision after a real
30-day execution cycle.

Shows:
- Goal text + 4 phase cards (one per week) with completion %, top
  outcome, and the AI-generated phase name.
- Results grid across the full 30 days: done / missed / blocked /
  skipped / rescued counts + rest-day count (excluded from "missed").
- Streak / proof / rescue stats.
- Artifact timeline grouped by week (links + text from `today.proof`
  across the 30 days).
- Failure patterns summary.
- AI-generated reflection paragraph (see `day7_recap` action — receives
  30-day data including phase performance; document parametrizes the
  same action for both variants).

CTAs:

```
What's next?

[ Extend +30 days ]            ← primary, calls track_continue_30
[ Pivot to a new goal ]        ← secondary, restarts onboarding from Step 1
[ Pause ]                      ← tertiary, sets track.status = 'paused'
```

**Extend +30 days**
- Calls `track_continue_30` with phase performance, all proofs,
  failure patterns from the just-finished Track.
- AI generates the next 30-day Track with a fresh 4-phase arc that
  builds on what was shipped.
- Old Track archived to `sv2_history.archivedTracks[]` (with `kind: 'track'`).
- New active Track inherits `restDayOfWeek` and `user.preferredRestDay`.

**Pivot to a new goal**
- Current Track archived.
- Onboarding restarts from Step 1; Commitment step defaults to Track.

**Pause**
- `track.status = 'paused'`. Today screen shows a "Track paused" state
  with a "Resume Track" button. No outcome rollovers fire while paused.

---

## Telegram Daily Ping

Full spec in `STRIVEAI_V2_TELEGRAM_SPEC.md`.

Summary:
- User connects Telegram during onboarding Step 3 or later in Settings.
- Server sends one ping per day at a user-configured or default time.
- Ping contains: day number, today's action title, a direct link back to the app.
- Server route: `POST /api/notify/telegram`
- Ping triggered by: a cron job or Vercel cron function, not the client.

---

## MVP Scope vs Later Scope

### In MVP (implemented)

- Email/password auth (Firebase Auth)
- Multi-step onboarding with 9 goal categories, Commitment step (Spark vs Track), and Rest-day picker (Track only)
- Two-tier track model:
  - Spark generation (`spark_generate`, 7 days, linear)
  - Track generation (`track_generate_30`, 30 days, 4 AI-named weekly phases, 1 user-picked rest day per week)
  - Spark → Track extension (`spark_to_track_extend`)
  - Track → Track extension (`track_continue_30`)
- Vertical Journal Spine roadmap UI (collapsible weeks, always-visible day titles) — replaces the v2 SVG sinusoid roadmap component
- Plan Preview screen with phase narrative (Track) or 7-day outline (Spark)
- Today's Action screen with bracketed focus card
- Agent Mode (3–5 guided micro-steps with per-step notes)
- Action Kit (AI-generated templates / references / questions / tips)
- Proof of Progress with AI verdict (met / partial / not-met)
- Blocked + Skip flows producing a Rescue Action
- Auto-missed rollover on a new day
- Failure Pattern Memory (stored; feeds `adapt_day` and `/today` insight)
- End-of-Track Recap: Spark Recap (Day 7, short upsell) and Track Recap (Day 30, full results by phase + artifact timeline)
- Spark → 30-day Track CTA, Track → Extend +30 / Pivot / Pause CTAs
- Telegram ping (one per day at 09:00 UTC, optional)
- Settings: email, experience level, Telegram connect/disconnect, sign out
- Fresh `sv2_*` state namespace, crash-safe v1 read-only guard
- Paper/editorial design system with watermark, brackets, italic serif accents

### Explicitly out of MVP

- Google / social auth, magic links
- Billing, plans, pricing screens, Stripe, PayPal
- Buddy accounts / shared tracks
- Multi-goal dashboard
- Web push notifications
- Email notifications
- Analytics dashboard
- STEM-specific mode
- Public proof sharing
- AI chat as a general assistant
- Native mobile app
- Track "pause" or "abandon" flows
- Adaptive track mid-run rebuild (AI re-generates remaining days)
- Team/group tracks
- Per-user timezone scheduling for Telegram pings
- Full Settings editing of intensity / blocker / if-then / escalation / ping hour
- `agent_hint` inline help (allowlisted on the backend; not yet wired in
  `frontend/services/ai-v2.js`)
