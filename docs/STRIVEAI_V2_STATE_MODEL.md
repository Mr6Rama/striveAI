# StriveAI MVP v2 — State Model

## Overview

All v2 persistent state lives under the `sv2_*` localStorage key namespace and
is mirrored to Firestore at `users/{uid}/kv/{key}`. The v1 `sa_*` keys are
read-only for the one-time migration guard and never written by v2 code.

This document is verified against `frontend/core/state-model.js`. Fields
present in the code are documented under their domain. Fields planned but not
yet implemented are listed under **Planned / not implemented** at the end of
each domain.

---

## Storage Keys

```js
export const STORAGE_KEYS_V2 = Object.freeze({
  user:     'sv2_user',
  track:    'sv2_track',
  today:    'sv2_today',
  history:  'sv2_history',
  telegram: 'sv2_telegram',
});
```

All keys map to a single Firestore document per key under `users/{uid}/kv/{key}` with fields `{ value: JSON_string, updatedAt: serverTimestamp }`.

---

## Domain: `sv2_user`

Persisted user profile. Created at registration, updated via Settings.

```ts
interface UserV2 {
  id: string;              // Firebase UID
  email: string;
  name: string;
  goalCategory: GoalCategory;  // see enum below
  createdAt: string;       // ISO-8601
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  dailyHours: string;      // '1-2' | '2-4' | '4-6' | '6-8' | '8+'
  currentProject: string;  // user's active project name (used in AI prompts)
  weekGoal: string;        // what the user wants to ship this week
  whyItMatters: string;    // one-sentence motivation
  triedBefore: string;     // what the user has tried and why it failed
  preferredRestDay: number | null;  // 1–7: position within each 7-day week
                                    // (1=first day, 7=last day). null for Spark.
  goalArtifact: string;    // concrete artifact the user commits to building;
                           // set during goal sharpening (onboarding Step 7)
}

type GoalCategory =
  | 'project'
  | 'startup'
  | 'content'
  | 'skill'
  | 'career'
  | 'study'
  | 'habit'
  | 'fitness'
  | 'other';
```

Default:
```js
function createDefaultUserV2() {
  return {
    id: '',
    email: '',
    name: '',
    goalCategory: 'other',
    createdAt: isoDateNow(),
    experienceLevel: 'intermediate',
    dailyHours: '2-4',
    currentProject: '',
    weekGoal: '',
    whyItMatters: '',
    triedBefore: '',
    preferredRestDay: null,
    goalArtifact: '',
  };
}
```

---

## Domain: `sv2_track`

The active execution track. Two flavors: **Spark** (`kind: 'spark'`, 7 days,
linear, no phases, no rest day) and **Track** (`kind: 'track'`, 28 days, 4
weekly phases, 1 rest day per week). Replaced (and archived) when a new
track starts.

```ts
interface TrackV2 {
  id: string;              // 'track-{timestamp}'
  kind: 'spark' | 'track'; // Which model. Drives totalDays, phases, restDayOfWeek.
  goal: string;            // User's stated goal for this run
  goalCategory: GoalCategory;
  blockerHint: string;     // User's biggest current blocker (from onboarding)
  generatedAt: string;     // ISO-8601
  startDate: string;       // ISO date of Day 1
  status: TrackStatus;
  totalDays: 7 | 28;       // 7 for Spark, 28 for Track (4 weeks × 7 days)
  currentDayNumber: number; // 1..totalDays
  currentWeekNumber: 1 | 2 | 3 | 4 | null;  // null for Spark
  restDayPosition: number | null;           // 1–7: position within each 7-day week. null for Spark.
  phases: Phase[] | null;  // length 4 for Track. null for Spark.
  days: DayPlan[];
  continuationOf: string | null; // id of previous track if this is a continuation
}

type TrackStatus = 'generating' | 'active' | 'paused' | 'complete' | 'abandoned';

interface Phase {
  weekNumber: 1 | 2 | 3 | 4;
  name: string;            // AI-generated, goal-specific. e.g. "Baseline",
                           // "Foundations", "Validate", "Ship".
  role: 'setup' | 'build' | 'validate' | 'ship' | 'recover' | 'review';
  dayNumbers: number[];    // The 7 day numbers that belong to this week
                           // (e.g., week 1 = [1,2,3,4,5,6,7]).
}

interface DayPlan {
  dayNumber: number;       // 1..track.totalDays
  weekNumber: 1 | 2 | 3 | 4 | null; // null for Spark; 1–4 for Track
  role: 'setup' | 'build' | 'validate' | 'ship' | 'review' | 'rest';
  isRestDay: boolean;      // true on the weekly rest day (Track only)
  title: string;           // Action title: short, concrete, specific.
                           // For rest days: a short rest prompt (e.g.
                           // "Rest day — recover and reflect").
  why: string;             // One sentence: why this day's task matters
  successCriteria: string; // Concrete done condition (empty/n-a on rest days)
  estimateMinutes: number; // 30 | 45 | 60 | 90 | 120 (0 on rest days)
  category: string;        // e.g. 'research' | 'build' | 'outreach' | 'review' | 'test'
  status: DayStatus;
  date: string;            // ISO date this day is assigned to
}

type DayStatus =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'blocked'
  | 'skipped'
  | 'missed'
  | 'rescued'
  | 'rest';                // Auto-set on the weekly rest day. NEVER counts
                           // as missed and is NOT appended to
                           // history.entries as an outcome.
```

Default (track not yet generated — defaults to a 28-day Track):
```js
function createDefaultTrackV2() {
  return {
    id: '',
    kind: 'track',
    goal: '',
    goalCategory: 'other',
    blockerHint: '',
    generatedAt: '',
    startDate: '',
    status: 'active',
    currentDayNumber: 1,
    currentWeekNumber: 1,
    totalDays: 28,
    phases: null,
    restDayPosition: null,
    days: [],
    continuationOf: null,
  };
}
```

When the user picks Spark in onboarding, the generator overrides:
`kind: 'spark', totalDays: 7, currentWeekNumber: null, restDayPosition: null,
phases: null`.

---

## Domain: `sv2_today`

State for the current day's execution session. Reset each day at rollover.

```ts
interface TodayV2 {
  date: string;              // ISO date this record applies to
  dayNumber: number;         // which day in the track (1..track.totalDays)
  status: DayStatus;         // includes 'rest' on the weekly rest day (Track)
  proof: ProofEntry | null;
  proofResult: ProofResult | null;   // AI verdict on the latest proof submission
  agentSession: AgentSession | null;
  actionKit: ActionKitItem[] | null; // Generated Action Kit items, if any
  rescueAction: RescueAction | null;
  rescueRepeating: boolean;          // Set when the rescue surfaces a repeating pattern
  blockerDiagnosis: BlockerDiagnosis | null; // Set during diagnosis phase on /blocked
  blockerText: string;       // user's typed blocker description (reason label)
  skipReason: string;        // user's optional skip note
  outcomeAt: string;         // ISO timestamp when outcome was recorded
  adaptationNote: string;    // AI note explaining today's adaptation (if track was adapted)
}

interface BlockerDiagnosis {
  stuckAt: string;  // "Where exactly did you get stuck?" (required, min 10 chars)
  tried: string;    // "What have you tried?" (optional)
}

interface ProofEntry {
  type: 'text' | 'link' | 'statement';
  value: string;
  submittedAt: string;       // ISO-8601
}

interface ProofResult {
  verdict: 'met' | 'partial' | 'not_met';
  note: string;              // Short AI explanation shown in the verdict card
  checkedAt: string;         // ISO-8601
}

interface AgentSession {
  steps: AgentStep[];
  currentStepIndex: number;
  startedAt: string;
  closedAt: string;
  outcome: 'done' | 'blocked' | 'partial' | '';
  proofNote: string;         // AI note returned with a partial/blocked verdict
}

interface AgentStep {
  index: number;             // 0-based
  text: string;              // step instruction (action-verb start, ≤160 chars)
  output: string;            // what concretely exists when done (≤120 chars)
  hint: string;              // code snippet / command / template (≤180 chars)
  status: 'pending' | 'done' | 'skipped';
  userOutput: string;        // user's note/log for this step
  completedAt: string;       // ISO-8601
  feedbackTip: string;       // async micro-coaching tip (from agent_step_feedback)
  feedbackOk: boolean | null; // true = step looks good, false = needs attention
}

interface ActionKitItem {
  type: 'template' | 'reference' | 'question' | 'tool' | 'tip';
  label: string;
  content: string;
}

interface RescueAction {
  generatedAt: string;
  originalTitle: string;     // the blocked task title
  rescueTitle: string;       // smaller/rephrased version
  steps: string[];           // 1–3 micro-steps
  reframeNote: string;       // optional AI reframe
  estimateMinutes: number;
  source: 'ai' | 'fallback';
  completed: boolean;
}
```

Default (from `createDefaultTodayV2` in `frontend/core/state-model.js`):

```js
function createDefaultTodayV2(date, dayNumber) {
  return {
    date: date || isoDateNow(),
    dayNumber: dayNumber || 1,
    status: 'pending',
    proof: null,
    proofResult: null,
    agentSession: null,
    actionKit: null,
    rescueAction: null,
    rescueRepeating: false,
    blockerDiagnosis: null,
    blockerText: '',
    skipReason: '',
    outcomeAt: '',
    adaptationNote: '',
  };
}
```

---

## Domain: `sv2_history`

Immutable append-only log of all day outcomes. Never modified retroactively.

```ts
interface HistoryV2 {
  entries: HistoryEntry[];
  successStreak: number;
  currentDayStreak: number;  // consecutive days with any outcome recorded
  failurePatterns: FailurePattern[];
  archivedTracks: ArchivedTrack[];
}

interface HistoryEntry {
  date: string;              // ISO date
  dayNumber: number;
  trackId: string;
  outcome: 'done' | 'blocked' | 'skipped' | 'missed' | 'rescued';
  taskTitle: string;
  proofType: 'text' | 'link' | 'statement' | '';
  agentUsed: boolean;
  rescueOffered: boolean;
  rescueCompleted: boolean;
  createdAt: string;         // ISO-8601
}

interface FailurePattern {
  id: string;                // 'fp-{timestamp}'
  date: string;
  dayNumber: number;
  trackId: string;
  taskTitle: string;
  blockerText: string;
  blockerCategory: BlockerCategory;
  rescueOffered: boolean;
  rescueCompleted: boolean;
}

type BlockerCategory =
  | 'time'
  | 'skill_gap'
  | 'no_access'
  | 'unclear'
  | 'motivation'
  | 'external'
  | 'other';

interface ArchivedTrack {
  trackId: string;
  kind: 'spark' | 'track';
  goal: string;
  goalCategory: GoalCategory;
  startDate: string;
  endDate: string;
  totalDays: number;       // 7 (Spark) or 30 (Track)
  doneCount: number;
  missedCount: number;
  blockedCount: number;
  skippedCount: number;
  rescuedCount: number;
  archivedAt: string;
}
```

Default:
```js
function createDefaultHistoryV2() {
  return {
    entries: [],
    successStreak: 0,
    currentDayStreak: 0,
    failurePatterns: [],
    archivedTracks: [],
  };
}
```

---

## Domain: `sv2_telegram`

Telegram connection state. Stored separately to allow easy disconnect without touching the track.

```ts
interface TelegramV2 {
  connected: boolean;
  chatId: string;            // Telegram chat ID (from bot /start handshake)
  username: string;          // @username (display only)
  connectedAt: string;       // ISO-8601
  pingHour: number;          // 0–23, hour of day to send ping (user's local time)
  pingEnabled: boolean;
  lastPingSentAt: string;    // ISO-8601
  lastPingStatus: 'sent' | 'failed' | 'skipped' | '';
}
```

Default:
```js
function createDefaultTelegramV2() {
  return {
    connected: false,
    chatId: '',
    username: '',
    connectedAt: '',
    pingHour: 9,
    pingEnabled: true,
    lastPingSentAt: '',
    lastPingStatus: '',
  };
}
```

---

## In-Memory App State (`ui`)

Not persisted. Lives in the store for the current session only. Source of
truth is `createInitialState` in `frontend/core/state-model.js`.

```ts
interface UIState {
  activeRoute: string;
  authReady: boolean;
  loading: boolean;
  trackGenerating: boolean;
  agentOpen: boolean;
  kitOpen: boolean;
  blockedModalOpen: boolean;
  rescueLoading: boolean;
  proofModalOpen: boolean;
  day7RecapOpen: boolean;
  toast: { title: string; body: string } | null;
  error: string;
  insight: string;            // Failure-pattern insight surfaced on /today
  agentLoading: boolean;      // /agent is fetching steps or judging proof
  agentHint: string | null;   // Inline step hint from agent_hint (session-only)
  agentHintLoading: boolean;  // Hint fetch in flight
  kitLoading: boolean;        // /action-kit is generating
  proofLoading: boolean;      // /proof is judging
  recapLoading: boolean;      // /recap reflection paragraph is generating
  trackContinuing: boolean;   // Spark→Track extension or Track +30 continuation is generating
  weekRecapData: WeekRecapData | null; // Weekly ship checkpoint card data (session-only)
}

interface WeekRecapData {
  weekNumber: number;
  phaseName: string;
  shipped: string;       // What the user shipped this week (≤120 chars)
  onTrack: boolean;      // Are they on pace for the final day?
  nextWeekFocus: string; // One focus for next week (≤120 chars)
}
```

`state.recapText` (sibling to `ui`, not nested inside it) holds the
session-only AI reflection text for `/recap`.

---

## Onboarding Draft (browser-only)

Onboarding writes its in-progress form to `localStorage` under
`sv2_onboarding_draft` so refreshing the page does not lose progress.
The draft is **not** mirrored to Firestore and is cleared by
`clearOnboardingDraft()` once the track is generated.

```ts
interface OnboardingDraft {
  goalCategory: string;
  goalTemplate: string;
  specificGoal: string;
  blocker: string;
  dailyHours: string;       // '0-1' | '1-2' | '2-4' | '4-6'
  trackKind: 'spark' | 'track';  // Commitment step (new)
  restDay: number;          // 0–6 (Sun=0). Captured only when trackKind === 'track'.
                            // Mirrored to user.preferredRestDay on submit.
  ifThenRules: string[];    // 2–4 selected rule IDs
  pingSelection: string;    // 'morning' | 'afternoon' | 'evening' | 'custom'
  pingHour: number;         // 0–23 UTC
  escalationRule: string;   // 'stricter' | 'message' | 'promise' | 'tiny_mode' | 'none'
}
```

---

## Full Initial State

```js
function createInitialState() {
  return {
    user:      createDefaultUserV2(),
    track:     createDefaultTrackV2(),
    today:     createDefaultTodayV2(isoDateNow(), 1),
    history:   createDefaultHistoryV2(),
    telegram:  createDefaultTelegramV2(),
    recapText: '',            // session-only
    ui: {
      activeRoute:       '/',
      authReady:         false,
      loading:           false,
      trackGenerating:   false,
      agentOpen:         false,
      kitOpen:           false,
      blockedModalOpen:  false,
      rescueLoading:     false,
      proofModalOpen:    false,
      day7RecapOpen:     false,
      toast:             null,
      error:             '',
      insight:           '',
      agentLoading:      false,
      agentHint:         null,   // session-only: inline step hint text
      agentHintLoading:  false,
      kitLoading:        false,
      proofLoading:      false,
      recapLoading:      false,
      trackContinuing:   false,
      weekRecapData:     null,   // session-only: weekly ship checkpoint card
    },
  };
}
```

---

## Key State Transitions

### New user completing onboarding
```
user → saved (includes preferredRestDay if Track was chosen)
track.kind = onboarding.trackKind          // 'spark' | 'track'
track.totalDays = (kind === 'spark') ? 7 : 30
track.restDayOfWeek = (kind === 'track') ? user.preferredRestDay : null
track.status = 'generating'
→ AI call:
    kind === 'spark' → spark_generate     (linear, no phases)
    kind === 'track' → track_generate_30  (4 AI-named phases, rest day woven in)
→ track.days[] populated (each DayPlan has weekNumber, role, isRestDay),
  track.phases[] populated (Track only),
  track.status = 'active'
→ today set to day 1
```

### Day outcome: done
```
today.status = 'done'
today.outcomeAt = now
today.proof = { type, value, submittedAt }
history.entries.push({ outcome: 'done', ... })
history.successStreak += 1
track.days[dayNumber-1].status = 'done'
```

### Day outcome: blocked
```
today.status = 'blocked'
today.blockerText = user input
history.failurePatterns.push({ blockerCategory, ... })
→ rescue_action AI call
today.rescueAction = { ... }
```

### Day outcome: rescued
```
today.status = 'rescued'
today.rescueAction.completed = true
today.outcomeAt = now
history.entries.push({ outcome: 'rescued', rescueCompleted: true, ... })
```

### Day outcome: skipped
```
today.status = 'skipped'
today.skipReason = user input (optional)
today.outcomeAt = now
history.entries.push({ outcome: 'skipped', ... })
```

### Auto-missed (rollover)
```
IF today.date < currentDate AND today.status === 'pending'
  IF dayPlan.isRestDay  // Track only
    today.status = 'rest'
    // NOT appended to history.entries; streak NOT broken
  ELSE
    today.status = 'missed'
    history.entries.push({ outcome: 'missed', ... })
    history.successStreak = 0
```

### Rest day rollover (Track only)
```
On day advance, IF dayPlan.isRestDay === true
  today.status = 'rest'
  today.outcomeAt = '' (no outcome recorded)
  // No history.entries push. No streak impact. No adapt_day call.
```

### Spark complete: extend to Track (Spark Recap CTA "Continue → 30-day Track")
```
history.archivedTracks.push({ kind: 'spark', ...currentTrack summary })
→ AI spark_to_track_extend call (receives all 7 days outcomes + proofs +
  patterns)
track = new track {
  kind: 'track',
  totalDays: 30,
  phases: [4 AI-named phases],
  restDayOfWeek: user.preferredRestDay,    // prompt user to pick if null
  continuationOf: old Spark id,
}
today = createDefaultTodayV2(today's date, 1)
```

### Track complete: extend +30 (Track Recap CTA "Extend +30 days")
```
history.archivedTracks.push({ kind: 'track', ...currentTrack summary })
→ AI track_continue_30 call (receives phase performance + proofs + patterns)
track = new track {
  kind: 'track',
  totalDays: 30,
  phases: [4 AI-named phases, new arc],
  restDayOfWeek: previous track's restDayOfWeek,
  continuationOf: old Track id,
}
today = createDefaultTodayV2(today's date, 1)
```

### End-of-track: start new (pivot)
```
history.archivedTracks.push({ kind, ...currentTrack summary })
user.goal = new goal
user.goalCategory = new category
// Onboarding restarts from Step 1; Commitment + Rest day re-picked.
track = new track (new goal, AI-generated for chosen kind)
today = createDefaultTodayV2(today's date, 1)
```

### Track Recap: pause
```
track.status = 'paused'
// Rollover skipped while paused. /today shows "Track paused" with Resume.
```

---

## v1 → v2 Migration Guard

On app boot, after loading v2 state:
- If `sv2_track.days` is empty AND `sa_roadmap` exists in localStorage → run legacy migration (read-only).
- Legacy migration is passive: it converts old `sa_*` data into a compatible v2 state snapshot.
- The converted state is saved under `sv2_*` keys.
- `sa_*` keys are never written or deleted by v2 code.
- If conversion fails, v2 starts fresh. No crash.

Migration runs at most once. After first successful v2 save, migration is skipped.
