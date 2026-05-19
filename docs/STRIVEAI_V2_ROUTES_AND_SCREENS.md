# StriveAI MVP v2 — Routes and Screens

## Router Overview

Client-side pushState router. Single HTML file (`frontend/index.html`). Routes are logical screen states, not separate pages.

Auth guard: all routes except `/` (landing), `/auth`, `/register` require a signed-in user. If not signed in, redirect to `/auth`.

Track guard: routes `/today`, `/track`, `/history`, `/settings` require an active track. If no track, redirect to `/onboarding`.

---

## Route Table

| Route | Guard | Screen | Component/Section |
|---|---|---|---|
| `/` | none | Landing | `#landing-screen` |
| `/auth` | none | Sign In | `#auth-screen` |
| `/register` | none | Register | `#register-screen` |
| `/onboarding` | auth | Onboarding | `#onboarding-screen` |
| `/generating` | auth | Track generating | `#generating-screen` |
| `/today` | auth + track | Today's Action | `#today-screen` |
| `/agent` | auth + track | Agent Workspace | `#agent-screen` |
| `/kit` | auth + track | Action Kit | `#kit-screen` |
| `/track` | auth + track | 7-day track overview | `#track-screen` |
| `/history` | auth + track | History log | `#history-screen` |
| `/settings` | auth | Settings | `#settings-screen` |
| `/recap` | auth | Day 7 recap | `#recap-screen` |

Default route for signed-in user with active track: `/today`.

Default route for signed-in user without track: `/onboarding`.

---

## Screen Specifications

---

### `/` — Landing

Purpose: First screen for unauthenticated visitors.

Elements:
- Product name + one-line description: "A 7-day AI execution agent for young builders."
- Two buttons: **Sign In** → `/auth`, **Sign Up** → `/register`
- No hero image, no feature list, no pricing. Just the entry point.

---

### `/auth` — Sign In

Elements:
- Email input
- Password input
- **Log In** button → calls `signIn(email, password)`
- Link: "Don't have an account? Sign up" → `/register`
- Link: "Forgot password?" → opens forgot-password modal (same as v1)
- Inline error display (`#auth-error`)
- Inline status (`#auth-status`)

On success: if user has existing track → `/today`. If no track → `/onboarding`.

---

### `/register` — Register

Elements:
- Name input
- Email input
- Password input
- Confirm password input
- **Sign Up** button → calls `signUp(email, password)` then saves name to `sv2_user`
- Link: "Already have an account? Log in" → `/auth`
- Inline error/status display

On success: → `/onboarding`

---

### `/onboarding` — Onboarding (3 steps)

No back button on Step 1. Progress dots shown.

#### Step 1 of 3: Goal

Elements:
- Heading: "What do you want to achieve in the next 7 days?"
- Goal category selector (grid of 9 cards, one selection):
  - Build a project / MVP
  - Startup / idea validation
  - Content / personal brand
  - Learn a skill
  - Career / portfolio
  - Study / exam
  - Habit / self-development
  - Fitness / health
  - Other
- Goal text input: "Describe your goal in one sentence" (required, max 200 chars)
- **Continue →** button

Saves to `sv2_user.goalCategory`, `sv2_track.goal` (draft).

#### Step 2 of 3: Context

Elements:
- Daily hours available (select): 1–2h / 2–4h / 4–6h / 6–8h / 8+h
- Experience level (select): Beginner / Intermediate / Advanced
- Biggest blocker right now (text input, optional, max 200 chars): "What's your biggest obstacle right now?"
- **Continue →** button, **← Back** button

Saves to `sv2_user.dailyHours`, `sv2_user.experienceLevel`, `sv2_track.blockerHint`.

#### Step 3 of 3: Telegram (optional)

Elements:
- Section heading: "Get a daily ping on Telegram"
- Sub-text: "Optional. You can connect later in Settings."
- Telegram connection widget:
  1. Instruction: "Open Telegram → search @StriveAIBot → send /start → paste the code here"
  2. Code input (6 digits)
  3. **Connect** button
- Skip link: "Skip for now →"
- **Generate my 7-day track →** button (active even without connecting Telegram)
- **← Back** button

On "Generate my 7-day track":
- Save all onboarding data.
- Navigate to `/generating`.
- Fire `track_generate` AI action.

---

### `/generating` — Track Generating

Shown while `track_generate` AI call is in progress.

Elements:
- Spinner / animated indicator
- Text: "Building your 7-day execution track…"
- Rotating preview messages (cycle every 2s):
  - "Analyzing your goal…"
  - "Designing Day 1…"
  - "Sequencing 7 concrete actions…"
  - "Reviewing the track…"
- No cancel button (prevents partial state).

On success: → `/today`
On failure after 2 retries: show error state with **Try Again** button. Do not navigate away.

---

### `/today` — Today's Action (primary screen)

The main screen. Shown every day of the 7-day track.

#### Header bar

- "Day {N} of 7" label
- Day dot strip: 7 dots, each colored by status (`done`=green, `missed`=red, `blocked`=orange, `skipped`=grey, `in_progress`=blue, `pending`=white)
- Nav links: Today | Track | History | Settings

#### Today card

```
DAY {N} OF 7

{taskTitle}

Why this matters:
{why}

Done when:
{successCriteria}

Estimated: {estimateMinutes} min

[Start with Agent]   [Action Kit]

[✓ Mark as Done]   [⊘ Blocked]   [→ Skip]
```

If `today.status = 'done'`: show proof card and completion message. Buttons disabled.
If `today.status = 'blocked'` and `rescueAction` exists: show Rescue Action card instead.
If `today.status = 'missed'`: show "Missed yesterday. Today is Day N." card.
If `today.adaptationNote` is set: show adaptation note below the card.

#### Adaptation note

Small banner below the today card (if `today.adaptationNote` is not empty):
```
AI adapted today's task based on yesterday's outcome.
{adaptationNote}
```

#### Proof card (shown after done)

```
✓ Completed — Day {N}

Proof submitted: {proofType} — {proofValue or 'statement'}
Submitted at: {time}

Tomorrow: Day {N+1}
{tomorrow's taskTitle}
```

If Day 7 was just completed: show **View Recap** button → `/recap`.

#### Blocked modal (opens on "Blocked" tap)

```
What's stopping you? (optional)
[ text input, max 200 chars ]

[Submit]  [Cancel]
```

On submit: saves `sv2_today.blockerText`, infers blocker category, fires `rescue_action`.

#### Skip modal (opens on "Skip" tap)

```
Skip today's task?

Add a note (optional):
[ text input, max 100 chars ]

[Skip]  [Cancel]
```

On skip: saves `sv2_today.skipReason`, sets status = `skipped`, records history entry.

#### Proof modal (opens on "Mark as Done" tap, or from Agent end screen)

```
How do you want to record this?

○ Statement — "I completed this task"
○ Text note — describe what you did
  [ text area ]
○ Link — paste a URL to your artifact
  [ url input ]

[Submit proof]  [Cancel]
```

On submit: saves `sv2_today.proof`, sets status = `done`, records history entry, fires `adapt_day` for tomorrow.

---

### `/agent` — Agent Workspace

Opened from the **Start with Agent** button on `/today`.

Sets `sv2_today.status = 'in_progress'` and `sv2_today.agentSession.startedAt`.

#### Layout

```
← Back to Today

AGENT MODE · Day {N}

{taskTitle}

Steps to complete this task:

[1] {step 0 text}                 [ Mark done ]
[2] {step 1 text}                 [ Mark done ]
[3] {step 2 text}                 [ Mark done ]
...

[ Stuck on this step? ]           (shows inline hint input)
```

Micro-steps are fetched from `agent_steps` AI action when the workspace is opened. Show a brief loading state ("Preparing your steps…").

#### Per step controls

- **Mark done**: step.status = `done`, advance to next step.
- **Skip this step**: step.status = `skipped`, advance.
- **Stuck on this step?**: expands an inline text input. User types what they're stuck on. Fires `agent_hint`. Response shown inline below the step. Hint disappears when step is marked done.

#### End state (all steps done or skipped)

```
Session complete

Steps done: {N} / {total}

Submit proof to close today's task:
[Proof modal]

[Close without submitting proof]
```

On "Close without submitting proof": navigate back to `/today`. Status remains `in_progress` until proof submitted or manual done.

On proof submitted: status = `done`, navigate to `/today` (which shows completion card).

---

### `/kit` — Action Kit

Opened from the **Action Kit** button on `/today`.

Fetches `action_kit` AI action. Shows a loading state ("Preparing your kit…").

#### Layout

```
← Back to Today

ACTION KIT · Day {N}

{taskTitle}

─────────────────────────────
{item 1: Template}
{label}
{content}

─────────────────────────────
{item 2: Reference}
{label}
{content}

─────────────────────────────
... (up to 5 items)

[I'm done — submit proof]
[Back to Today]
```

Item types are visually distinguished by a type chip: `Template` | `Reference` | `Question` | `Tip` | `Tool`.

"I'm done" opens the proof modal. On proof submit: navigate to `/today`.

---

### `/track` — 7-Day Track Overview

Read-only view of all 7 days in the current track.

```
YOUR 7-DAY TRACK

Goal: {goal}
Started: {startDate}

Day 1  {status dot}  {taskTitle}      {date}
Day 2  {status dot}  {taskTitle}      {date}
Day 3  {status dot}  {taskTitle}  ←── TODAY
Day 4  {status dot}  {taskTitle}
...
Day 7  {status dot}  {taskTitle}
```

Each day row is non-interactive (read-only). Tapping a past day shows a summary modal (outcome, proof, rescue status).

Current day has a **Go to Today →** button.

---

### `/history` — History Log

Chronological list of all recorded outcomes across all tracks.

```
HISTORY

This track: {doneCount} done / {missedCount} missed / {blockedCount} blocked

──────────────────────────────────────
May 19  Day 3  done     Write 3 cold DM scripts
                        Proof: "sent to 5 people, 2 replied"
──────────────────────────────────────
May 18  Day 2  rescued  Set up landing page with email capture
──────────────────────────────────────
May 17  Day 1  done     Interview 3 potential users
──────────────────────────────────────

Failure patterns this track:
  skill_gap ×2, time ×1
```

Entries sorted newest first. Proof shown inline if submitted. No pagination at MVP (truncate at 50 entries in view).

---

### `/settings` — Settings

```
SETTINGS

──── Profile ────────────────────────
Name:        Alex
Email:       alex@example.com
             [Edit name]

──── Current Track ──────────────────
Goal:        {goal text}
Started:     {date}
Status:      Day 3 of 7 — active

──── Telegram ───────────────────────
Status:      Connected as @alexbuilds   [Disconnect]
Daily ping:  9:00 (UTC)                [Change hour ▾]
Pings:       Enabled                   [Disable]

             (If not connected:)
             [Connect Telegram]

──── Account ────────────────────────
[Sign Out]
[Reset all data]  ← destructive, requires confirm modal
```

Name edit: inline text input + save button. Updates `sv2_user.name`.

Telegram ping hour: dropdown, 6–22 (UTC). Updates via `POST /api/telegram/ping-settings`.

Reset all data: shows confirm modal ("This will delete your track, history, and settings. Are you sure?"). On confirm: clears all `sv2_*` localStorage and Firestore keys, signs user out, navigates to `/register`.

---

### `/recap` — Day 7 Recap

Shown when Day 7 outcome is recorded (or on Day 8+ if user was away).

```
7-DAY RECAP

Goal: {goal}

Mon  Tue  Wed  Thu  Fri  Sat  Sun
 ✓    ✓    ⊘    ✓    —    ✓    ✓

Done: 5   Missed: 1   Blocked: 1
Streaks: best 3 days
Proof submissions: 4

{AI-generated reflection paragraph}

─────────────────────────────────
What's next?

[Continue this goal →]
Start another 7-day run with the same goal.
AI picks up from where you left off.

[Start a new track →]
Set a new goal and generate a fresh 7-day track.
─────────────────────────────────
```

Day grid: 7 cells, each showing the day's outcome icon:
- ✓ = done or rescued
- ⊘ = blocked (not rescued)
- — = missed
- ∅ = skipped
- … = in progress (should not appear in recap, but guard for it)

#### On "Continue this goal"

1. Archive current track to `sv2_history.archivedTracks`.
2. Show brief loading ("Building continuation track…").
3. Fire `track_continue` AI action.
4. Save new track to `sv2_track` (with `continuationOf = old trackId`).
5. Reset `sv2_today` to Day 1 of new track.
6. Navigate to `/today`.

#### On "Start a new track"

1. Archive current track.
2. Navigate to `/onboarding` Step 1 (goal category + goal text).
3. Steps 2 (context) and 3 (Telegram) are skipped — user already has those settings.
   - Exception: show Step 2 context fields with pre-filled values and allow user to update.
4. On submit: fire `track_generate`, navigate to `/generating` → `/today`.

---

## Navigation Structure

```
Landing (/)
├── Sign In (/auth)
└── Register (/register)
    └── Onboarding (/onboarding)
        └── Generating (/generating)
            └── Today (/today)          ← primary daily entry point
                ├── Agent (/agent)
                ├── Kit (/kit)
                ├── Track (/track)      ← nav tab
                ├── History (/history)  ← nav tab
                ├── Settings (/settings) ← nav tab
                └── Recap (/recap)      ← shown on Day 7
                    ├── Continue → /generating → /today
                    └── New track → /onboarding → /generating → /today
```

---

## UI Nav Tabs (shown when signed in with active track)

Visible in the header while on `/today`, `/agent`, `/kit`, `/track`, `/history`, `/settings`:

```
[Today]  [Track]  [History]  [Settings]
```

Active tab highlighted. No tab bar shown on `/auth`, `/register`, `/onboarding`, `/generating`, `/recap`.

---

## Removed Routes (v1 → v2)

| v1 Route | v2 Status | Reason |
|---|---|---|
| `/dashboard` | Removed | Replaced by `/today` as the primary screen |
| `/work` | Removed | Task list replaced by 7-day track view |
| `/goals` | Removed | Goals are now the track's single goal |
| `/notes` (AI Chat) | Removed | Replaced by Agent Mode (task-scoped, not open chat) |
| `/analytics` | Removed | Not in MVP scope |
| `/billing` | Removed | No billing in MVP |
| `/roadmap` | Removed | Replaced by `/track` (7-day linear view) |
| `/progress` | Removed | Merged into `/history` |
