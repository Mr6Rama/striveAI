# StriveAI MVP v2 — Product Specification

## What This Document Is

Engineering and design reference for the StriveAI v2 MVP. Not a pitch doc.
All decisions here are final for MVP scope unless explicitly marked `[LATER]`.

This is the **source of truth** for product behavior. Route specs are in
`STRIVEAI_V2_ROUTES_AND_SCREENS.md`, state in `STRIVEAI_V2_STATE_MODEL.md`,
AI actions in `STRIVEAI_V2_AI_ACTIONS.md`.

---

## Core Principle

StriveAI is a **7-day AI execution agent for builders.** It is not a planner,
not a STEM app, not a billing product, and not a general chatbot.

The product does not stop at generating a plan. Every day it:

1. Surfaces one concrete daily action with a clear "done means" criterion.
2. Helps the user execute that action inside the product via **Agent Mode**
   (3–5 ordered micro-steps).
3. Optionally produces an **Action Kit** of task-specific templates,
   questions, and tips.
4. Asks for **Proof of Progress** and judges it as met / partial / not-met.
5. Runs a **Rescue Action** flow when the user is blocked or skipping.
6. Updates **Failure Pattern Memory** based on the outcome.
7. Adapts the next day's task to reflect what actually happened.

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
| Day 7 | Recap screen. User chooses: continue same goal for 7 more days, or start a new track. |
| STEM mode | Completely removed. No STEM labels, prompts, routes, fallbacks, or UI. |

---

## Core Product Loop

```
Landing  →  Auth  →  Onboarding
                        ↓
              AI generates 7-day execution track
                        ↓
                   Plan Preview
                        ↓
              ┌────  Today's Action  ◀───────────────┐
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
              Day 7 Recap  →  Continue same goal
                          \\→ Start a new track
```

---

## Full User Journey

### New User

1. **`/landing`** — paper-editorial front door with product-native preview card.
   Single CTA: "Start 7-day track →".
2. **`/auth`** — email + password (Firebase Auth). Tab to switch sign-in /
   create-account. Inline errors.
3. **`/onboarding`** — 8 steps (current implementation):
   - Step 1: Goal category (9 categories)
   - Step 2: Goal template + specific goal text
   - Step 3: Main blocker (8 options)
   - Step 4: Daily intensity (4 levels)
   - Step 5: If-then rules (pick 2–4 of 6)
   - Step 6: Telegram ping time + optional bot connect
   - Step 7: Escalation rule (what should happen after 2 missed days)
   - Step 8: Confirm & generate
   - The 8-step flow is on the long side; deferring Telegram + Escalation +
     If-Then to Settings is a known improvement.
4. **Track generation** — fires `track_generate` AI action. UI shows
   "Building your track…" with deterministic fallback if AI fails.
5. **`/plan-preview`** — setup summary + Day 1 hero card + Day 2 secondary
   + Days 3–7 outline + "StriveAI helps you execute each day" promise block.
6. **`/today`** — Day 1 action card with the bracketed focus styling.
   Buttons: `Start with Agent` (primary), `Action Kit`, `I already did it`,
   `I'm blocked`, `Skip today`.
7. **Execution** — Agent Mode / Action Kit / Proof / Blocked flow.
8. **Day closes** — outcome recorded; `adapt_day` is called for tomorrow.
9. **Days 2–6** — same loop. Track adapts based on outcomes + failure patterns.
10. **Day 7** — `/recap` screen. Continue or new track decision.

### Returning User

1. Auth → load state from Firestore (`sv2_*` keys), mirror to localStorage.
2. Rollover: if yesterday's action is still `pending`, auto-mark as `missed`
   and run pattern analysis.
3. Land on `/today` for the current day (or `/recap` if track is complete).

---

## Status System

### Track-level statuses

| Status | Meaning |
|---|---|
| `generating` | AI is building the 7-day track |
| `active` | Track is running |
| `paused` | User manually paused (day is frozen) [LATER] |
| `complete` | Day 7 recap reached |
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

### Action outcomes (recorded in history)

`done` | `blocked` | `skipped` | `missed` | `rescued`

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

## Day 7 Recap

Shown when all 7 days have passed (or user has acted on Day 7).

Recap screen shows:
- Days completed vs missed vs blocked vs skipped (7-cell grid)
- Streak count
- Number of proof submissions
- Number of rescue completions
- Failure patterns encountered (brief summary)
- Goal text restated
- AI-generated 1-paragraph reflection: what patterns emerged, what to carry forward

Then: choice card.

```
What's next?

[Continue this goal for another 7 days]
[Start a new 7-day track with a different goal]
```

### Continue same goal

- AI receives: original goal, day 7 outcomes, failure patterns, proof entries.
- Generates a new 7-day track that picks up where day 7 left off.
- Old track archived to `sv2_archivedTracks[]`.
- New track becomes active with `dayNumber = 1` but goal text unchanged.

### Start new track

- Current track archived.
- Onboarding Step 1 and Step 2 presented again (goal + constraints).
- New track generated.

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
- 8-step onboarding with 9 goal categories
- 7-day track generation (`track_generate` + deterministic fallback)
- Plan Preview screen
- Today's Action screen with bracketed focus card
- Agent Mode (3–5 guided micro-steps with per-step notes)
- Action Kit (AI-generated templates / references / questions / tips)
- Proof of Progress with AI verdict (met / partial / not-met)
- Blocked + Skip flows producing a Rescue Action
- Auto-missed rollover on a new day
- Failure Pattern Memory (stored; feeds `adapt_day` and `/today` insight)
- Day 7 Recap with stats + AI reflection + pattern export
- Continue same goal (`track_continue`) / Start new track
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
- Roadmap/milestone view (replaced by 7-day linear track)
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
