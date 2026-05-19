# StriveAI MVP v2 — Product Specification

## What This Document Is

Engineering and design reference for the StriveAI v2 rebuild. Not a pitch doc. All decisions here are final for MVP scope unless explicitly marked `[LATER]`.

---

## Core Principle

StriveAI does not stop at generating a plan. It helps the user execute today's specific step inside the product — through guided micro-steps (Agent Mode), optional self-service kits (Action Kit), and a proof-of-progress check before the day closes.

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
| Auth | Email/password only. No Google, no magic link. |
| Accountability channel | Telegram only. No email ping. No push notification. |
| Deployment | Vercel |
| AI backend | Existing Express OpenAI proxy at `/api/openai/generate` |
| Database namespace | Fresh `sv2_*` keys. No migration of old v1 data except crash guard. |
| Billing | None. Freemium. No pricing screens. |
| Agent Mode | Required. Guided 3–5 micro-step execution. Not an open chatbot. |
| Day 7 | Recap screen. User chooses: continue same goal for 7 more days, or start a new track. |

---

## Core Product Loop

```
Landing / Auth
  ↓
Onboarding (new user) OR load state (returning user)
  ↓
AI generates 7-day execution track
  ↓
Today's Action screen
  ↓
User picks one of:
  [Start with Agent]  → Minimal Agent Workspace (3–5 guided micro-steps)
  [Action Kit]        → Curated self-serve resources for the day's task
  [Proof]             → Submit proof of completion
  [Blocked]           → Rescue Action flow
  [Skip]              → Logged as skipped; track adapts next day
  ↓
Outcome recorded
  ↓
Failure Pattern Memory updated (if blocked/skipped)
  ↓
Telegram daily ping (if connected) — sent by server at scheduled time
  ↓
AI adapts next day's action based on outcome + pattern
  ↓
Day 7 → Recap screen → Continue or new track
```

---

## Full User Journey

### New User

1. **Landing screen** — brief product description, Sign Up / Log In buttons.
2. **Auth screen** — email + password registration. Error handling inline.
3. **Onboarding** — 3 steps:
   - Step 1: Goal category + goal text + timeframe hint ("what do you want to achieve in 7 days?")
   - Step 2: Daily time available + experience level + biggest current blocker
   - Step 3: Telegram connection (optional but recommended) — "Connect Telegram for daily pings"
4. **Track generation** — AI builds a 7-day execution track. Shown as a loading state with preview of first action.
5. **Today's Action** — Day 1 action card. User picks how to engage.
6. **Execution** — Agent/Kit/Proof/Blocked/Skip flow.
7. **Day closes** — outcome recorded; next day's action adapted.
8. **Days 2–6** — same loop. Track adapts based on outcomes and failure patterns.
9. **Day 7** — recap screen. Continue or new track decision.

### Returning User

1. Auth → load state from Firestore (`sv2_*` keys).
2. Rollover check: if yesterday's action is still `pending`, auto-mark as `missed` and adapt.
3. Land on Today's Action for the current day.

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

Purpose: track repeated blockers across days so the AI can adapt intelligently instead of resurfacing the same unworkable task.

What is recorded per `blocked` or `skipped` event:
- `dayNumber` — which day in the track
- `taskTitle` — text of the action that failed
- `blockerText` — user's description of the blocker (from Blocked modal)
- `category` — inferred blocker category: `time` | `skill_gap` | `no_access` | `unclear` | `motivation` | `external` | `other`
- `rescueOffered` — boolean, was a rescue action generated
- `rescueCompleted` — boolean
- `date` — ISO date

Pattern triggers (MVP):
- Same blocker category appears 2+ times → AI receives the pattern summary in the next day's adaptation prompt.
- 3+ consecutive `missed` days → AI offers a track reset or goal re-scope suggestion.

Pattern data lives in `sv2_history.failurePatterns[]`.

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

## Proof-of-Progress Logic

User can submit proof from Today's Action or from the Agent Workspace end screen.

Proof types (user chooses one):
- `text` — free text note: "I did X, result was Y"
- `link` — URL to artifact (GitHub commit, doc, post, etc.)
- `statement` — checkbox-style: "I confirm I completed this task"

What happens on submission:
- `sv2_today.proof` is saved with type, value, and timestamp.
- Day status → `done`.
- Outcome recorded in history.
- If Telegram connected: optional proof-submitted ping sent to user.

Proof is not verified. It is for the user's own accountability log.

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

### In MVP

- Email/password auth
- 9 goal categories
- 7-day track generation
- Today Action screen
- Agent Mode (guided micro-steps)
- Action Kit (AI-generated)
- Proof of progress
- Blocked flow + Rescue Action
- Skip + auto-missed rollover
- Failure Pattern Memory (stored, feeds adaptation prompts)
- Day 7 recap
- Continue same goal / start new track
- Telegram ping (one per day)
- Settings: name, goal edit, Telegram disconnect/reconnect
- Fresh v2 state namespace, crash-safe v1 guard

### Explicitly out of MVP

- Google / social auth
- Billing, plans, pricing
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
