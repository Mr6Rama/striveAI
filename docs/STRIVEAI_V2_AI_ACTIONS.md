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
  'track_generate',   // Build 7-day execution track from onboarding data
  'track_continue',   // Generate next 7-day continuation of same goal
  'agent_steps',      // Generate 3–5 micro-steps for today's action
  'agent_hint',       // Inline hint for a stuck step (RESERVED — not yet called by v2 client)
  'rescue_action',    // Generate Rescue Action for a blocked day
  'action_kit',       // Generate Action Kit (templates / references / questions / tools / tips)
  'v2_proof_check',   // Judge submitted proof: met | partial | not_met
  'day7_recap',       // Generate reflection paragraph for Day 7 recap screen
  'adapt_day',        // Adapt tomorrow's action given today's outcome + patterns
]);
```

| Action | Called from | Status |
|---|---|---|
| `track_generate` | `services/ai-v2.js · generateExecutionTrack()` (onboarding Step 8) | Active |
| `track_continue` | `services/ai-v2.js · generateContinuationWeek()` (`/recap` Continue) | Active |
| `agent_steps` | `services/ai-v2.js · generateAgentSteps()` (`/agent` init) | Active |
| `agent_hint` | — | Reserved (allowlisted but not wired in v2 client) |
| `rescue_action` | `services/ai-v2.js · diagnoseBlocker()` (`/blocked`) | Active |
| `action_kit` | `services/ai-v2.js · generateActionKit()` (`/action-kit`) | Active |
| `v2_proof_check` | `services/ai-v2.js · checkProof()` (`/proof`, `/agent` end) | Active |
| `day7_recap` | `services/ai-v2.js · generateDay7Recap()` (`/recap`) | Active |
| `adapt_day` | `services/ai-v2.js · adaptNextDay()` (after a day outcome) | Active |

---

## Per-Action Specifications

### `track_generate`

Purpose: Build the initial 7-day execution track from onboarding inputs.

Backend config:
```js
track_generate: {
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
Generate one concrete action per day.
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

Generate a 7-day execution track.
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

Response JSON schema:
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

Deterministic fallback (if AI fails):
- Return a hardcoded 7-day structure based on goal category.
- Each fallback track has 7 concrete actions appropriate for the category.
- One fallback template per `GoalCategory` (9 total).

---

### `track_continue`

Purpose: Generate next 7-day track that continues the same goal after Day 7 recap.

Backend config: same as `track_generate`.

Additional prompt context injected:
```
Previous 7-day summary:
- Done: {doneCount} / 7
- Failure patterns: {patterns summary}
- Proof submissions: {proofCount}
- Day 7 outcome: {day7Outcome}

Continue from where the previous track ended.
Do not repeat tasks that were completed.
Address the failure patterns by designing around the blockers.
```

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

Purpose: Generate a short reflection paragraph shown on the Day 7 recap screen.

Backend config:
```js
day7_recap: {
  model: 'gpt-5-nano',
  maxCompletionTokens: 350,
  reasoningEffort: 'minimal',
  temperature: 0.8,
  topP: 1,
  contextLimits: { promptChars: 2400, systemChars: 700, totalChars: 2900 },
},
```

Prompt template:
```
Goal: {goal}
7-day results: done={doneCount}, missed={missedCount}, blocked={blockedCount}, skipped={skippedCount}, rescued={rescuedCount}
Failure patterns: {patterns summary or 'none'}
Proof submissions: {proofCount}

Write a 2–3 sentence execution reflection. State what pattern emerged and what to carry into the next run.
No motivational filler. Factual and direct.
```

Response: `text/plain`.

---

### `adapt_day`

Purpose: Adapt tomorrow's day plan based on today's outcome and accumulated failure patterns.

Backend config:
```js
adapt_day: {
  model: 'gpt-5-nano',
  maxCompletionTokens: 300,
  reasoningEffort: 'minimal',
  temperature: 0.8,
  topP: 1,
  contextLimits: { promptChars: 2000, systemChars: 700, totalChars: 2600 },
},
```

Prompt template:
```
Goal: {goal}
Today (Day {dayNumber}) outcome: {outcome}
Blocker: {blockerText or 'none'}
Tomorrow's planned task: {tomorrowTitle}
Failure patterns: {patterns summary or 'none'}

Should tomorrow's task change based on today's outcome?
If yes, return an adjusted title and why. If no, confirm as-is.
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
