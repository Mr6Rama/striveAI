# StriveAI MVP v2 — AI Actions

## Overview

All AI calls go through the existing backend proxy at `POST /api/openai/generate`.

Request shape (unchanged from v1):
```json
{
  "action": "<action_name>",
  "prompt": "<user/context prompt>",
  "systemCtx": "<system instruction>",
  "maxTokens": 1200,
  "opts": {
    "temperature": 0.7,
    "responseJsonSchema": { ... }
  }
}
```

The backend validates `action` against the `AI_ACTIONS` set. All v2 actions must be added to that set in `backend/server.js`.

---

## v2 AI Actions Set

The `AI_ACTIONS` allowlist in `backend/server.js` currently includes both v1
and v2 actions. The v2 client (`frontend/services/ai-v2.js`) calls only the
v2 actions below. The v1 actions stay on the allowlist until the legacy
`frontend/script.js` is deleted (see `docs/LEGACY_NOTES.md`).

```js
const AI_ACTIONS = new Set([
  // v1 actions — kept on the allowlist while legacy script.js is on disk.
  // The v2 client does NOT call these.
  'roadmap', 'tasks', 'tasks_skeleton', 'task_detail', 'task_audit',
  'goals_review', 'note_process', 'session_review', 'chat', 'goal_complete',

  // v2 actions (called by frontend/services/ai-v2.js)
  'spark_generate',        // Build 7-day Spark probe (linear, no phases)
  'track_generate_30',     // Build 30-day Track (4 AI-named weekly phases, 1 rest day/week)
  'spark_to_track_extend', // Convert completed Spark outcomes into a 30-day Track
  'track_continue_30',     // Generate next 30-day Track (Extend +30) after Track Recap
  'track_generate',        // DEPRECATED alias of spark_generate — kept for back-compat
  'track_continue',        // DEPRECATED — superseded by track_continue_30
  'agent_steps',           // Generate 3–5 micro-steps for today's action
  'agent_hint',            // Inline hint for a stuck step (RESERVED — not yet called)
  'rescue_action',         // Generate Rescue Action for a blocked day
  'action_kit',            // Generate Action Kit (templates / references / questions / tools / tips)
  'v2_proof_check',        // Judge submitted proof: met | partial | not_met
  'day7_recap',            // Reflection paragraph for end-of-track recap (Spark + Track)
  'adapt_day',             // Adapt tomorrow's action; phase-aware on Track
]);
```

| Action | Called from | Status |
|---|---|---|
| `spark_generate` | `services/ai-v2.js · generateSpark()` (onboarding when `trackKind === 'spark'`) | Active |
| `track_generate_30` | `services/ai-v2.js · generateTrack30()` (onboarding when `trackKind === 'track'`) | Active |
| `spark_to_track_extend` | `services/ai-v2.js · extendSparkToTrack()` (Spark Recap → "Continue → 30-day Track") | Active |
| `track_continue_30` | `services/ai-v2.js · continueTrack30()` (Track Recap → "Extend +30 days") | Active |
| `track_generate` | — | Deprecated alias (back-compat; same spec as `spark_generate`) |
| `track_continue` | — | Deprecated (superseded by `track_continue_30`) |
| `agent_steps` | `services/ai-v2.js · generateAgentSteps()` (`/agent` init) | Active |
| `agent_hint` | — | Reserved (allowlisted but not wired in v2 client) |
| `rescue_action` | `services/ai-v2.js · diagnoseBlocker()` (`/blocked`) | Active |
| `action_kit` | `services/ai-v2.js · generateActionKit()` (`/action-kit`) | Active |
| `v2_proof_check` | `services/ai-v2.js · checkProof()` (`/proof`, `/agent` end) | Active |
| `day7_recap` | `services/ai-v2.js · generateRecap()` (`/recap`, both variants) | Active |
| `adapt_day` | `services/ai-v2.js · adaptNextDay()` (after a day outcome) | Active |

---

## Per-Action Specifications

### `spark_generate`

Purpose: Build the initial 7-day **Spark** probe from onboarding inputs.
Spark is linear (no phases, no rest days). It exists to prove fit and
produce a first artifact in one week.

(Also accepted as legacy `track_generate` for back-compat; same spec.)

Backend config:
```js
spark_generate: {
  model: 'gpt-5-mini',
  maxCompletionTokens: 1400,
  reasoningEffort: 'minimal',
  temperature: 0.9,
  topP: 1,
  contextLimits: { promptChars: 5000, systemChars: 1400, totalChars: 6000 },
},
```

System context:
```
You are a 7-day execution planner for young builders.
Purpose: prove fit and produce a first artifact.
This is a 7-day Spark probe — keep it tight, no fluff.
Generate one concrete action per day. No phases. No rest days.
Each action must be completable in the user's stated daily hours.
Actions must be specific to the goal — no generic tasks.
Return JSON only.
```

Prompt template:
```
Goal: {goal}
Category: {goalCategory}
Daily hours: {dailyHours}
Experience: {experienceLevel}
Biggest blocker: {blockerHint}

Generate a 7-day Spark probe.
Day 1 must be the lowest-friction start possible — something achievable in under 2 hours.
Each day builds on the previous.
Day 7 must produce a concrete artifact or proof point.

Rules:
- title: short, specific, action-verb start. Max 80 chars.
- why: one sentence. Connects to the goal. Max 120 chars.
- successCriteria: concrete done condition. Max 120 chars.
- estimateMinutes: 30 | 45 | 60 | 90 | 120
- category: research | build | outreach | review | test | write | practice | other
- Bad titles: "Research market", "Work on project", "Make progress"
- Good titles: "Interview 3 potential users about their biggest workflow frustration",
               "Write the first version of your cold outreach DM (100 words max)",
               "Build the login screen and connect it to Firebase Auth"
```

Response JSON schema (explicitly 7 days, no phases, no rest):
```json
{
  "type": "object",
  "required": ["goal", "days"],
  "properties": {
    "goal": { "type": "string" },
    "days": {
      "type": "array",
      "minItems": 7,
      "maxItems": 7,
      "items": {
        "type": "object",
        "required": ["dayNumber", "title", "why", "successCriteria", "estimateMinutes", "category"],
        "properties": {
          "dayNumber": { "type": "integer", "minimum": 1, "maximum": 7 },
          "title": { "type": "string", "maxLength": 80 },
          "why": { "type": "string", "maxLength": 120 },
          "successCriteria": { "type": "string", "maxLength": 120 },
          "estimateMinutes": { "type": "integer", "enum": [30, 45, 60, 90, 120] },
          "category": { "type": "string" }
        }
      }
    }
  }
}
```

Client maps each returned day to a `DayPlan` with `weekNumber: null`,
`role: 'build'` (or `'setup'` for day 1, `'ship'` for day 7), and
`isRestDay: false`.

Deterministic fallback (if AI fails):
- Return a hardcoded 7-day structure based on goal category.
- Each fallback track has 7 concrete actions appropriate for the category.
- One fallback template per `GoalCategory` (9 total).

---

### `track_generate_30`

Purpose: Build the initial 30-day **Track** from onboarding inputs.
Structured into **4 weekly phases** whose names are AI-generated per
goal. Includes exactly 1 rest day per week on the user's chosen weekday.

Backend config:
```js
track_generate_30: {
  model: 'gpt-5-mini',
  maxCompletionTokens: 3500,
  reasoningEffort: 'minimal',
  temperature: 0.9,
  topP: 1,
  contextLimits: { promptChars: 6000, systemChars: 1800, totalChars: 7500 },
},
```

System context:
```
You are a 30-day execution planner for young builders.
Output a 4-phase weekly arc and 30 ordered days.
Each phase covers exactly 7 days (week 1 = days 1–7, ... week 4 = days 22–28).
Days 29 and 30 belong to week 4 (review/ship tail).
Phase names MUST be specific to the goal — never generic.
  - Fitness example: Baseline / Build / Peak / Maintain
  - Project example: Foundations / Build / Validate / Ship
  - Skill example:   Basics / Drills / Apply / Showcase
Phase roles: setup → build → validate → ship (in that order, week 1 to 4).
Day 1 is the lowest-friction start possible.
Week 4 must produce a shippable artifact.
The user has chosen a weekly rest day (weekday number, Sun=0).
On every day whose weekday matches the chosen rest day, set
role='rest', isRestDay=true, title="Rest day — recover and reflect",
estimateMinutes=0, successCriteria="". All other days are work days.
Respect phase role boundaries — no setup tasks in validate/ship phases.
Return JSON only.
```

Prompt template:
```
Goal: {goal}
Category: {goalCategory}
Daily hours: {dailyHours}
Experience: {experienceLevel}
Biggest blocker: {blockerHint}
Start date: {startDate}  (ISO date of Day 1)
Preferred rest weekday: {preferredRestDay}  (0=Sun ... 6=Sat)

Generate a 30-day Track:
- 4 phases, AI-named, one per week, in the role order: setup, build, validate, ship.
- 30 ordered days, each with weekNumber (1–4), role (setup|build|validate|ship|review|rest),
  isRestDay (true/false), title, why, successCriteria, estimateMinutes, category.
- Mark the user's chosen weekday as the rest day every week.
- Week 4 must culminate in a shippable artifact on Day 28 or later.
```

Response JSON schema:
```json
{
  "type": "object",
  "required": ["goal", "phases", "days"],
  "properties": {
    "goal": { "type": "string" },
    "phases": {
      "type": "array",
      "minItems": 4,
      "maxItems": 4,
      "items": {
        "type": "object",
        "required": ["weekNumber", "name", "role", "dayNumbers"],
        "properties": {
          "weekNumber": { "type": "integer", "minimum": 1, "maximum": 4 },
          "name": { "type": "string", "maxLength": 40 },
          "role": { "type": "string", "enum": ["setup", "build", "validate", "ship", "recover", "review"] },
          "dayNumbers": {
            "type": "array",
            "items": { "type": "integer", "minimum": 1, "maximum": 30 }
          }
        }
      }
    },
    "days": {
      "type": "array",
      "minItems": 30,
      "maxItems": 30,
      "items": {
        "type": "object",
        "required": ["dayNumber", "weekNumber", "role", "isRestDay", "title", "why", "successCriteria", "estimateMinutes", "category"],
        "properties": {
          "dayNumber": { "type": "integer", "minimum": 1, "maximum": 30 },
          "weekNumber": { "type": "integer", "minimum": 1, "maximum": 4 },
          "role": { "type": "string", "enum": ["setup", "build", "validate", "ship", "review", "rest"] },
          "isRestDay": { "type": "boolean" },
          "title": { "type": "string", "maxLength": 80 },
          "why": { "type": "string", "maxLength": 120 },
          "successCriteria": { "type": "string", "maxLength": 120 },
          "estimateMinutes": { "type": "integer", "enum": [0, 30, 45, 60, 90, 120] },
          "category": { "type": "string" }
        }
      }
    }
  }
}
```

Deterministic fallback (if AI fails):
- Use a hardcoded 4-phase scaffold per `GoalCategory` with generic phase
  names ("Foundations / Build / Validate / Ship") and 30 fallback day
  titles. Rest days are computed client-side from `preferredRestDay`.

---

### `spark_to_track_extend`

Purpose: Convert a completed 7-day Spark into a 30-day Track. Called from
the Spark Recap CTA. The AI must explicitly **continue** the user's
progress from Spark — not restart from scratch.

Backend config: same as `track_generate_30`.

System context:
```
You are extending a completed 7-day Spark into a 30-day Track.
The user has already produced outcomes and (often) a first artifact.
Continue from where Spark ended. Do not repeat tasks the user completed.
Address recurring blockers by designing around them.
Output the same shape as track_generate_30:
4 AI-named weekly phases (setup → build → validate → ship) and 30 days,
with a rest day every week on the user's chosen weekday.
Phase 1 should pick up momentum from Spark, NOT redo the basics.
Return JSON only.
```

Prompt template:
```
Goal: {goal}
Category: {goalCategory}
Daily hours: {dailyHours}
Experience: {experienceLevel}
Preferred rest weekday: {preferredRestDay}
Start date: {startDate}

Spark results (7 days):
- Per-day outcomes: {day1Outcome, day2Outcome, ..., day7Outcome}
- Proof texts: {proof1, proof2, ...}  (omit empty)
- Failure patterns: {patterns summary}
- Spark artifact summary: {one-line summary of what was produced}

Generate the 30-day Track that continues Spark.
```

Response JSON schema: identical to `track_generate_30`.

Deterministic fallback: same scaffold as `track_generate_30`, but
inject the Spark goal text into the day-1 title to signal continuity.

---

### `track_continue_30`

Purpose: Generate the next 30-day Track after a completed Track (Track
Recap "Extend +30 days" CTA). Replaces the deprecated `track_continue`
action.

Backend config: same as `track_generate_30`.

System context:
```
You are generating the next 30-day Track for a user who just finished one.
Treat the previous track's phases as past learning — reference what shipped.
Output the same shape as track_generate_30. Do not repeat tasks already done.
Keep the user's chosen rest weekday. Respect phase role boundaries.
Return JSON only.
```

Additional prompt context injected:
```
Previous 30-day Track summary:
- Phases: {[{ weekNumber, name, role, doneCount, missedCount, blockedCount }, ...]}
- Done overall: {doneCount} / {workingDayCount}    (rest days excluded)
- Failure patterns: {patterns summary}
- Proof submissions: {proofCount}
- Final-week artifact: {one-line summary}

Continue from where the previous track ended.
Do not repeat tasks that were completed.
Address recurring failure patterns by designing around the blockers.
```

Response JSON schema: identical to `track_generate_30`.

---

### `agent_steps`

Purpose: Generate 3–5 ordered micro-steps for today's specific action.

Backend config:
```js
agent_steps: {
  model: 'gpt-5-nano',
  maxCompletionTokens: 600,
  reasoningEffort: 'minimal',
  temperature: 0.8,
  topP: 1,
  contextLimits: { promptChars: 2000, systemChars: 800, totalChars: 2600 },
},
```

System context:
```
You are an execution assistant. Break one task into ordered micro-steps.
Each step must be concrete, specific, and doable in 15–45 minutes.
No motivational filler. No generic advice.
Return JSON only.
```

Prompt template:
```
Today's task: {taskTitle}
Goal: {goal}
Category: {goalCategory}
Experience: {experienceLevel}

Break this task into 3–5 sequential micro-steps.
Each step: one sentence, action-verb start, specific output expected.
```

Response JSON schema:
```json
{
  "type": "object",
  "required": ["steps"],
  "properties": {
    "steps": {
      "type": "array",
      "minItems": 3,
      "maxItems": 5,
      "items": {
        "type": "object",
        "required": ["index", "text"],
        "properties": {
          "index": { "type": "integer" },
          "text": { "type": "string", "maxLength": 140 }
        }
      }
    }
  }
}
```

Deterministic fallback:
```js
[
  { index: 0, text: `Open your work environment and review the task: "${title}"` },
  { index: 1, text: 'Write down the single most important sub-task you need to complete first.' },
  { index: 2, text: 'Complete that sub-task. Record the output before you stop.' },
]
```

---

### `agent_hint`

Purpose: Inline hint when user is stuck on a specific agent step.

Backend config:
```js
agent_hint: {
  model: 'gpt-5-nano',
  maxCompletionTokens: 200,
  reasoningEffort: 'minimal',
  temperature: 0.7,
  topP: 1,
  contextLimits: { promptChars: 1200, systemChars: 500, totalChars: 1600 },
},
```

Prompt template:
```
Task: {taskTitle}
Step: {stepText}
User stuck note: {stuckNote}

Give one concrete unblocking suggestion in 2–3 sentences.
No preamble. No "great question". Direct answer only.
```

Response: `text/plain` (not JSON).

---

### `rescue_action`

Purpose: Generate a smaller/rephrased version of a blocked task with concrete sub-steps.

Backend config:
```js
rescue_action: {
  model: 'gpt-5-nano',
  maxCompletionTokens: 500,
  reasoningEffort: 'minimal',
  temperature: 0.8,
  topP: 1,
  contextLimits: { promptChars: 2200, systemChars: 800, totalChars: 2800 },
},
```

System context:
```
The user is blocked. Generate a rescue action: a smaller, more accessible version of the original task.
The rescue must be completable in under 60 minutes.
Steps must be concrete and specific.
Return JSON only.
```

Prompt template:
```
Original task: {taskTitle}
Goal: {goal}
Blocker description: {blockerText}
Past blocker patterns: {patterns summary or 'none'}

Generate a rescue action.
```

Response JSON schema:
```json
{
  "type": "object",
  "required": ["rescueTitle", "steps"],
  "properties": {
    "rescueTitle": { "type": "string", "maxLength": 100 },
    "steps": {
      "type": "array",
      "minItems": 1,
      "maxItems": 3,
      "items": { "type": "string", "maxLength": 120 }
    },
    "reframeNote": { "type": "string", "maxLength": 160 }
  }
}
```

Deterministic fallback:
```js
{
  rescueTitle: `Smallest step toward: ${taskTitle.slice(0, 60)}`,
  steps: [
    'Set a 20-minute timer.',
    'Do the first concrete sub-part of this task, even if incomplete.',
    'Write one sentence describing what you did.',
  ],
  reframeNote: '',
  source: 'fallback',
}
```

---

### `action_kit`

Purpose: Generate a curated set of resources/frameworks for the day's task.

Backend config:
```js
action_kit: {
  model: 'gpt-5-nano',
  maxCompletionTokens: 600,
  reasoningEffort: 'minimal',
  temperature: 0.7,
  topP: 1,
  contextLimits: { promptChars: 1800, systemChars: 700, totalChars: 2400 },
},
```

Prompt template:
```
Task: {taskTitle}
Goal: {goal}
Category: {goalCategory}

Generate an Action Kit: 3–5 items to help execute this task.
Include: one template or framework, one definition or reference, one guiding question or prompt.
All items must be text-only — no external URLs, no install requirements.
Keep each item under 100 words.
Return JSON only.
```

Response JSON schema:
```json
{
  "type": "object",
  "required": ["items"],
  "properties": {
    "items": {
      "type": "array",
      "minItems": 3,
      "maxItems": 5,
      "items": {
        "type": "object",
        "required": ["type", "label", "content"],
        "properties": {
          "type": { "type": "string", "enum": ["template", "reference", "question", "tool", "tip"] },
          "label": { "type": "string", "maxLength": 50 },
          "content": { "type": "string", "maxLength": 400 }
        }
      }
    }
  }
}
```

---

### `v2_proof_check`

Purpose: Judge user-submitted proof against the day's success criteria.

Called from: `frontend/services/ai-v2.js · checkProof()` (entry points
`/proof` submit and `/agent` end-of-session proof).

Prompt context (built client-side):

```
Task: {dayPlan.title}
Done means: {dayPlan.successCriteria}
Proof type: {text | link | statement}
Proof: {user input}
```

Expected JSON response:

```json
{
  "verdict": "met" | "partial" | "not_met",
  "note": "short explanation, 1–2 sentences"
}
```

Stored at `sv2_today.proofResult`. Drives the verdict card on `/proof`
and the partial / blocked branches in `/agent`.

Deterministic fallback (when AI is unavailable):

```js
{
  verdict: 'partial',
  note: 'Automatic verification unavailable. Check your work against the success criteria manually.',
}
```

---

### `day7_recap`

Purpose: Generate a short reflection paragraph shown on the end-of-track
recap screen. **The same action serves both recap variants** (Spark Day 7
and Track Day 30). The action name is kept for back-compat; payload
shape varies by `track.kind`.

Judgment call: a single parametrized action keeps the backend allowlist
short and the prompt logic in one place. If the prompt diverges
significantly in practice, split into `spark_recap` / `track_recap_30`.

Backend config:
```js
day7_recap: {
  model: 'gpt-5-nano',
  maxCompletionTokens: 500,
  reasoningEffort: 'minimal',
  temperature: 0.8,
  topP: 1,
  contextLimits: { promptChars: 3200, systemChars: 800, totalChars: 4000 },
},
```

Prompt template — Spark (`track.kind === 'spark'`):
```
Track kind: spark
Goal: {goal}
7-day results: done={doneCount}, missed={missedCount}, blocked={blockedCount}, skipped={skippedCount}, rescued={rescuedCount}
Failure patterns: {patterns summary or 'none'}
Proof submissions: {proofCount}

Write a 2–3 sentence execution reflection. State what pattern emerged and what to carry into the 30-day Track.
No motivational filler. Factual and direct.
```

Prompt template — Track (`track.kind === 'track'`):
```
Track kind: track
Goal: {goal}
30-day results: done={doneCount}, missed={missedCount}, blocked={blockedCount}, skipped={skippedCount}, rescued={rescuedCount}, rest={restCount}
Phase breakdown:
  Week 1 "{phase1Name}" ({phase1Role}): done={..}, missed={..}, blocked={..}
  Week 2 "{phase2Name}" ({phase2Role}): done={..}, missed={..}, blocked={..}
  Week 3 "{phase3Name}" ({phase3Role}): done={..}, missed={..}, blocked={..}
  Week 4 "{phase4Name}" ({phase4Role}): done={..}, missed={..}, blocked={..}
Failure patterns: {patterns summary or 'none'}
Proof submissions: {proofCount}
Final-week artifact: {one-line summary}

Write a 3–4 sentence execution reflection. Call out the strongest and weakest phase by name.
State what to carry into the next 30-day Track.
No motivational filler. Factual and direct.
```

Response: `text/plain`.

---

### `adapt_day`

Purpose: Adapt tomorrow's day plan based on today's outcome and accumulated
failure patterns. On Track, the prompt is phase-aware — the AI must not
suggest setup tasks in validate/ship phases and must respect the current
phase role.

`adapt_day` is **not** called when today is a rest day (status = `rest`) —
rest day rollover skips outcome recording and AI adaptation entirely.

Backend config:
```js
adapt_day: {
  model: 'gpt-5-nano',
  maxCompletionTokens: 300,
  reasoningEffort: 'minimal',
  temperature: 0.8,
  topP: 1,
  contextLimits: { promptChars: 2200, systemChars: 800, totalChars: 2800 },
},
```

System context (add):
```
Respect phase boundaries — do not violate the phase role
(setup / build / validate / ship). For example, do not suggest fresh
setup tasks during a validate or ship phase. If today was a rest day,
this action is not called at all.
```

Prompt template:
```
Goal: {goal}
Track kind: {kind}             // 'spark' | 'track'
Phase: {weekNumber}/{phaseName} ({phaseRole})   // Track only; for Spark, write "n/a"
Today (Day {dayNumber} of {totalDays}) outcome: {outcome}
Blocker: {blockerText or 'none'}
Tomorrow's planned task: {tomorrowTitle}
Tomorrow's role: {tomorrowRole}
Failure patterns: {patterns summary or 'none'}

Should tomorrow's task change based on today's outcome?
If yes, return an adjusted title and why. Do not violate tomorrow's phase role.
If no, confirm as-is.
Return JSON only.
```

Response JSON schema:
```json
{
  "type": "object",
  "required": ["changed", "title", "why"],
  "properties": {
    "changed": { "type": "boolean" },
    "title": { "type": "string", "maxLength": 80 },
    "why": { "type": "string", "maxLength": 120 }
  }
}
```

If `changed = false`, the original title is used and `why` is shown as an adaptation note on the next day.

Deterministic fallback: return `{ changed: false, title: tomorrowTitle, why: '' }`.

---

## Blocker Category Inference

The v2 `/blocked` flow shows a static pill picker (7 reasons). Each reason
declares its `category` directly in `frontend/ui/pages/blocked.js`, so no
free-text inference is needed at the picker stage:

| Reason | Category |
|---|---|
| No time | `time` |
| Too big | `unclear` |
| Unclear start | `unclear` |
| Low energy | `motivation` |
| Avoiding it | `motivation` |
| Forgot | `time` |
| Not important today | `motivation` |

When the user types a free-text blocker description elsewhere (e.g.,
inside Agent Mode), `frontend/services/ai-v2.js` exposes a fallback
`inferBlockerCategory(text)` keyword matcher that returns one of:
`time` | `skill_gap` | `no_access` | `unclear` | `motivation` | `external` |
`other`.

The chosen category is stored on each `sv2_history.failurePatterns[]` entry
under `blockerCategory`.

---

## Failure Pattern Summary Builder

Before calling any AI action that accepts pattern context, build a brief text summary:

```js
function buildPatternSummary(failurePatterns) {
  if (!failurePatterns.length) return 'none';
  const counts = {};
  failurePatterns.forEach(({ blockerCategory }) => {
    counts[blockerCategory] = (counts[blockerCategory] || 0) + 1;
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `${cat} (×${n})`)
    .join(', ');
}
```

Inject as `{patterns summary}` into prompts. Keep under 100 chars.

---

## Error Handling (all actions)

| Failure mode | Behavior |
|---|---|
| Network error | Show inline error. Offer retry button. Do not crash app. |
| AI returns invalid JSON | Backend JSON repair runs. If still invalid, deterministic fallback used. |
| AI returns empty response | Deterministic fallback used. |
| Backend returns 429 (rate limit) | Show "Too many requests" toast. Disable retry for 30s. |
| Backend returns 500 | Show generic error. Log to console. Fallback if one exists. |
| `track_generate` fails completely | Show error state on onboarding Step 3. Offer retry. Do not create a broken track. |
