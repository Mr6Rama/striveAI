// StriveAI v2 AI service.
// All v2 AI calls go through this module. UI components must not call AI directly.

import { getAuthToken } from './auth.js';
import {
  fallbackTrack, fallbackSteps, fallbackProofCheck, fallbackRescue,
  fallbackKit, fallbackAdaptDay, fallbackDay7Recap,
} from './ai-v2-fallbacks.js';

// ── Network layer ──────────────────────────────────────────────────────────

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = await getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function requestJson({ action, prompt, systemCtx = '', schema, maxTokens }) {
  const res = await fetch('/api/openai/generate', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ action, prompt, systemCtx, maxTokens, opts: { responseJsonSchema: schema } }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) throw new Error(payload.error || 'AI request failed');
  return safeParseJson(payload.text || '');
}

async function requestText({ action, prompt, systemCtx = '', maxTokens }) {
  const res = await fetch('/api/openai/generate', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ action, prompt, systemCtx, maxTokens, opts: {} }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) throw new Error(payload.error || 'AI request failed');
  return String(payload.text || '').trim();
}

function safeParseJson(raw) {
  const text = String(raw || '').trim().replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
  try { return JSON.parse(text); } catch (_e) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error('unparseable AI response');
  }
}

// ── Pattern helpers ────────────────────────────────────────────────────────

function patternsFromArg(arg) {
  if (Array.isArray(arg)) return arg;
  if (Array.isArray(arg?.failurePatterns)) return arg.failurePatterns;
  return [];
}

function buildPatternSummary(arg) {
  const patterns = patternsFromArg(arg);
  if (!patterns.length) return 'none';
  const counts = {};
  patterns.forEach(({ blockerCategory }) => {
    const cat = String(blockerCategory || 'other');
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `${cat} (×${n})`).join(', ').slice(0, 100);
}

export function inferBlockerCategory(text) {
  const t = String(text || '').toLowerCase();
  if (/time|busy|no time|didn.t have time/.test(t)) return 'time';
  if (/don.t know|skill|learn|how to|confused/.test(t)) return 'skill_gap';
  if (/access|account|permission|login|tool|software/.test(t)) return 'no_access';
  if (/don.t understand|not sure what|vague|unclear task/.test(t)) return 'unclear';
  if (/motivation|energy|tired|burnt|don.t feel/.test(t)) return 'motivation';
  if (/waiting|other person|team|external|depends on/.test(t)) return 'external';
  return 'other';
}

// ── JSON schemas ───────────────────────────────────────────────────────────

const DAY_ITEM_SCHEMA = {
  type: 'object',
  required: ['dayNumber', 'title', 'why', 'successCriteria', 'estimateMinutes', 'category'],
  properties: {
    dayNumber:       { type: 'integer', minimum: 1, maximum: 7 },
    title:           { type: 'string', maxLength: 80 },
    why:             { type: 'string', maxLength: 120 },
    successCriteria: { type: 'string', maxLength: 120 },
    estimateMinutes: { type: 'integer', enum: [30, 45, 60, 90, 120] },
    category:        { type: 'string' },
    blockerRisk:     { type: 'string', maxLength: 100 },
  },
};

// sparkSchema — 7-day Spark probe (no phases)
function sparkSchema() {
  return {
    type: 'object', required: ['goal', 'days'],
    properties: { goal: { type: 'string' }, days: { type: 'array', minItems: 7, maxItems: 7, items: DAY_ITEM_SCHEMA } },
  };
}

// trackSchema — backward-compat alias for sparkSchema
function trackSchema() { return sparkSchema(); }

// track30Schema — 28-day Track with 4 phases
function track30Schema() {
  const day30 = {
    type: 'object',
    required: ['dayNumber', 'weekNumber', 'role', 'isRestDay', 'title', 'why', 'successCriteria', 'estimateMinutes', 'category'],
    properties: {
      dayNumber:       { type: 'integer', minimum: 1, maximum: 28 },
      weekNumber:      { type: 'integer', minimum: 1, maximum: 4 },
      role:            { type: 'string' },
      isRestDay:       { type: 'boolean' },
      title:           { type: 'string', maxLength: 80 },
      why:             { type: 'string', maxLength: 120 },
      successCriteria: { type: 'string', maxLength: 120 },
      estimateMinutes: { type: 'integer', enum: [0, 30, 45, 60, 90, 120] },
      category:        { type: 'string' },
      blockerRisk:     { type: 'string', maxLength: 100 },
    },
  };
  return {
    type: 'object', required: ['goal', 'phases', 'days'],
    properties: {
      goal: { type: 'string' },
      phases: {
        type: 'array', minItems: 4, maxItems: 4,
        items: {
          type: 'object', required: ['weekNumber', 'name', 'role'],
          properties: {
            weekNumber: { type: 'integer', minimum: 1, maximum: 4 },
            name:       { type: 'string', maxLength: 30 },
            role:       { type: 'string', enum: ['setup', 'build', 'validate', 'ship', 'recover', 'review'] },
          },
        },
      },
      days: { type: 'array', minItems: 28, maxItems: 28, items: day30 },
    },
  };
}

function stepsSchema() {
  return {
    type: 'object', required: ['steps'],
    properties: {
      steps: {
        type: 'array', minItems: 3, maxItems: 5,
        items: {
          type: 'object', required: ['index', 'text'],
          properties: {
            index:  { type: 'integer' },
            text:   { type: 'string', maxLength: 160 },
            output: { type: 'string', maxLength: 120 },
            hint:   { type: 'string', maxLength: 180 },
          },
        },
      },
    },
  };
}

function proofCheckSchema() {
  return {
    type: 'object', required: ['verdict'],
    properties: {
      verdict: { type: 'string', enum: ['met', 'partial', 'not_enough'] },
      note:    { type: 'string', maxLength: 200 },
    },
  };
}

function rescueSchema() {
  return {
    type: 'object', required: ['rescueTitle', 'steps'],
    properties: {
      rescueTitle: { type: 'string', maxLength: 100 },
      steps:       { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', maxLength: 120 } },
      reframeNote: { type: 'string', maxLength: 160 },
    },
  };
}

function kitSchema() {
  return {
    type: 'object', required: ['items'],
    properties: {
      items: {
        type: 'array', minItems: 3, maxItems: 5,
        items: {
          type: 'object', required: ['type', 'label', 'content'],
          properties: {
            type:    { type: 'string', enum: ['template', 'reference', 'question', 'tool', 'tip'] },
            label:   { type: 'string', maxLength: 50 },
            content: { type: 'string', maxLength: 400 },
          },
        },
      },
    },
  };
}

function adaptSchema() {
  return {
    type: 'object', required: ['changed', 'title', 'why'],
    properties: {
      changed: { type: 'boolean' },
      title:   { type: 'string', maxLength: 80 },
      why:     { type: 'string', maxLength: 120 },
    },
  };
}

// ── System context strings ─────────────────────────────────────────────────

const TRACK_CTX = `You are a 7-day execution planner for young builders, creators, and early founders.
Generate one concrete action per day that moves the user toward their specific goal.
Each action must be completable in the user's stated daily hours.
Personalize every task to the user's actual goal — never produce generic category templates.
If a current project or week outcome is provided, reference it directly in every task title.
Return JSON only.`;

const TRACK_30_CTX = `You are a 28-day execution planner for young builders, creators, and early founders.
Generate a 4-phase monthly execution track: 4 weeks, 7 days each, with one rest day per week.
Each phase has an AI-generated name that fits the goal (e.g. fitness: "Baseline / Build / Peak / Maintain").
Personalize every task to the user's actual goal — never produce generic category templates.
The week has a clear arc within each phase: active days build toward a phase deliverable.
Rest days are marked isRestDay: true with role: "rest" — no task title needed, just set estimateMinutes: 0 and category: "rest".
Return JSON only.`;

const STEPS_CTX = `You are an execution assistant. Break one task into 3–5 ordered micro-steps.

Hard rules:
- Each step is a concrete physical action with a specific, namable output.
- Each step is completable in 10–30 minutes.
- The first step is the LOWEST-FRICTION real action — never "prepare", "decide", or "review".
- Step 1 must produce something tangible by itself (a list, a paragraph, a commit).
- Use the user's actual project/tools by name when given.
- Reference the day's done condition — the last step makes the criterion checkable.

NEVER write steps that:
- start with "Open", "Re-read", "Decide", "Think", "Consider", "Plan", "Define"
- send the user out of the app to "their workspace" with no concrete instruction
- restate the task or coach motivation
- are meta ("write down the most important sub-task")

GOOD examples for a "Build login page for MyNotion" task:
- "Run npx create-next-app@latest mynotion --typescript --tailwind in your project folder"
- "Add /login/page.tsx with email + password fields and a Submit button"
- "Wire the Submit handler to call supabase.auth.signInWithPassword and console.log the result"

BAD examples (NEVER do this):
- "Open your workspace and re-read the task"  ← meta, no output
- "Decide what's most important"               ← vague, no action
- "Work on the main thing"                     ← no object, no done condition

For each step provide:
- text: the action (≤160 chars)
- output: what should exist when the step is done (≤120 chars) — required when concrete
- hint: optional template, snippet, or example to paste/adapt (≤180 chars)

Return JSON only.`;

const RESCUE_CTX = `The user is blocked. Generate a rescue action: a smaller, more accessible version of the original task.
The rescue must be completable in 5–30 minutes.
Steps must be concrete — no advice or motivation.
Return JSON only.`;

// ── Exported functions ─────────────────────────────────────────────────────

export async function generateExecutionTrack(input) {
  const isTrack = input?.trackKind === 'track';
  try {
    if (isTrack) {
      const data = await requestJson({
        action: 'track_generate_30',
        prompt: buildTrack30Prompt(input),
        systemCtx: TRACK_30_CTX,
        schema: track30Schema(),
        maxTokens: 4000,
      });
      if (!Array.isArray(data?.days) || data.days.length < 28) throw new Error('invalid track30');
      if (!Array.isArray(data?.phases) || data.phases.length < 4) throw new Error('invalid phases');
      return data;
    }
    const data = await requestJson({
      action: 'spark_generate',
      prompt: buildTrackPrompt(input),
      systemCtx: TRACK_CTX,
      schema: sparkSchema(),
      maxTokens: 1400,
    });
    if (!Array.isArray(data?.days) || data.days.length < 7) throw new Error('invalid spark');
    return data;
  } catch (_e) {
    return fallbackTrack(input);
  }
}

export async function generateSparkToTrackExtend(sparkTrack, sparkDays, history) {
  try {
    const data = await requestJson({
      action: 'spark_to_track_extend',
      prompt: buildSparkToTrackExtendPrompt(sparkTrack, sparkDays, history),
      systemCtx: TRACK_30_CTX,
      schema: track30Schema(),
      maxTokens: 4000,
    });
    if (!Array.isArray(data?.days) || data.days.length < 28) throw new Error('invalid track30');
    if (!Array.isArray(data?.phases) || data.phases.length < 4) throw new Error('invalid phases');
    return data;
  } catch (_e) {
    return fallbackTrack({ goal: sparkTrack?.goal || '', goalCategory: sparkTrack?.goalCategory || 'other', trackKind: 'track' });
  }
}

export async function generateAgentSteps(day, track, failureMemory, user) {
  try {
    const data = await requestJson({
      action: 'agent_steps',
      prompt: buildAgentStepsPrompt(day, track, failureMemory, user),
      systemCtx: STEPS_CTX,
      schema: stepsSchema(),
      maxTokens: 700,
    });
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    if (!steps.length) throw new Error('empty steps');
    return steps.map((s, i) => ({
      index:  Number.isInteger(s.index) ? s.index : i,
      text:   String(s.text || '').slice(0, 160),
      output: String(s.output || '').slice(0, 120),
      hint:   String(s.hint   || '').slice(0, 180),
    }));
  } catch (_e) {
    return fallbackSteps(day);
  }
}

export async function generateActionKit(day, track) {
  try {
    const data = await requestJson({
      action: 'action_kit',
      prompt: buildActionKitPrompt(day, track),
      systemCtx: '',
      schema: kitSchema(),
      maxTokens: 600,
    });
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) throw new Error('empty kit');
    return items;
  } catch (_e) {
    return fallbackKit(day).items;
  }
}

export async function checkProof(day, proofInput, track) {
  try {
    const data = await requestJson({
      action: 'v2_proof_check',
      prompt: buildProofCheckPrompt(day, proofInput, track),
      systemCtx: '',
      schema: proofCheckSchema(),
      maxTokens: 250,
    });
    const valid = new Set(['met', 'partial', 'not_enough']);
    return { verdict: valid.has(data?.verdict) ? data.verdict : 'partial', note: String(data?.note || '') };
  } catch (_e) {
    return fallbackProofCheck();
  }
}

export async function diagnoseBlocker(day, blockerReason, track, failureMemory) {
  try {
    const data = await requestJson({
      action: 'rescue_action',
      prompt: buildRescuePrompt(day, blockerReason, track, failureMemory),
      systemCtx: RESCUE_CTX,
      schema: rescueSchema(),
      maxTokens: 500,
    });
    if (!data?.rescueTitle || !Array.isArray(data?.steps)) throw new Error('invalid rescue');
    return {
      rescueTitle: String(data.rescueTitle).slice(0, 100),
      steps: data.steps.slice(0, 3).map(String),
      reframeNote: String(data.reframeNote || '').slice(0, 160),
      source: 'ai',
    };
  } catch (_e) {
    return fallbackRescue(day);
  }
}

export async function adaptNextDay(track, days, history, failureMemory) {
  try {
    const totalDays    = track?.totalDays || 7;
    const todayIndex   = (track?.currentDayNumber || 1) - 1;
    const tomorrowIndex = todayIndex + 1;
    if (tomorrowIndex >= totalDays) return null;
    const daysArr  = Array.isArray(days) ? days : [];
    const today    = daysArr[todayIndex] || {};
    const tomorrow = daysArr[tomorrowIndex] || {};
    if (tomorrow.isRestDay) return null;
    const data = await requestJson({
      action: 'adapt_day',
      prompt: buildAdaptDayPrompt(track, today, tomorrow, failureMemory),
      systemCtx: '',
      schema: adaptSchema(),
      maxTokens: 300,
    });
    return {
      changed: Boolean(data?.changed),
      title: String(data?.title || tomorrow.title || '').slice(0, 80),
      why: String(data?.why || '').slice(0, 120),
    };
  } catch (_e) {
    return fallbackAdaptDay(track, days);
  }
}

export async function generateDay7Recap(track, days, history, failureMemory) {
  try {
    const text = await requestText({
      action: 'day7_recap',
      prompt: buildDay7RecapPrompt(track, days, history, failureMemory),
      systemCtx: '',
      maxTokens: 350,
    });
    if (!text) throw new Error('empty recap');
    return text;
  } catch (_e) {
    return fallbackDay7Recap(track, days);
  }
}

export async function generateContinuationWeek(previousTrack, previousDays, recap, choice) {
  try {
    const data = await requestJson({
      action: 'track_continue_30',
      prompt: buildTrackContinuePrompt(previousTrack, previousDays, recap, choice),
      systemCtx: TRACK_CTX,
      schema: trackSchema(),
      maxTokens: 1400,
    });
    if (!Array.isArray(data?.days) || data.days.length < 7) throw new Error('invalid track');
    return data;
  } catch (_e) {
    return fallbackTrack({ goal: previousTrack?.goal || '', goalCategory: previousTrack?.goalCategory || 'other' });
  }
}

// ── Prompt builders ────────────────────────────────────────────────────────

function buildTrackPrompt(input) {
  const goal       = String(input?.goal || '').trim();
  const category   = String(input?.goalCategory || 'other').trim();
  const hours      = String(input?.dailyHours || '2-4').trim();
  const experience = String(input?.experienceLevel || 'intermediate').trim();
  const blocker    = String(input?.blockerHint || 'none').trim();
  const project    = String(input?.currentProject || '').trim();
  const weekGoal   = String(input?.weekGoal || '').trim();
  const why        = String(input?.whyItMatters || '').trim();
  const tried      = String(input?.triedBefore || '').trim();

  const extra = [
    project  ? `Current project / what they're doing: ${project}` : '',
    weekGoal ? `Concrete outcome wanted by day 7: ${weekGoal}` : '',
    why      ? `Why it matters to them: ${why}` : '',
    tried    ? `What they've already tried: ${tried}` : '',
  ].filter(Boolean).join('\n');

  return `Goal: ${goal}
Category: ${category}
Daily hours: ${hours}
Experience: ${experience}
Biggest blocker: ${blocker}
${extra}

Generate a 7-day execution track tailored to this specific person and their goal.

Hard constraints:
- Use the user's actual words and context. Never write "your project", "the skill",
  "the plan", "the topic" — always name the specific thing.
- If currentProject is provided, every task title must reference that project by name.
- If weekGoal is provided, every day's task must visibly advance that exact outcome.
- The week has an arc: Day 1 is setup / lowest-friction start, Days 2–5 build the core,
  Day 6 validates or polishes, Day 7 ships / produces a shareable artifact.
- Each day builds on the previous day's concrete output.
- Sum of estimateMinutes ≈ 7 × user's daily minute target. Day 1 ≤ 60 min.

Vague verbs forbidden in title — never start with: define, plan, work on, think about,
think through, consider, decide, explore, research (without a named subject),
understand, get started on, learn about, look into.

Field rules:
- title: action-verb start, names the specific subject/tool/deliverable, max 80 chars.
- why: one sentence connecting THIS day to THIS user's goal, max 120 chars.
- successCriteria: written as "X exists" or "Y is true" — concretely verifiable, max 120 chars.
- estimateMinutes: one of 30 | 45 | 60 | 90 | 120.
- category: research | build | outreach | review | test | write | practice | other.
- blockerRisk: one phrase for the most likely obstacle on this day, max 100 chars.

Good titles (this is the bar):
- "Interview 3 coffee-shop owners about their biggest inventory frustration"
- "Write the first 200-word draft of your cold email to design agencies"
- "Build the login page for ${project || '[their project]'} and run it end-to-end locally"
- "Solve 5 calculus chain-rule problems from Chapter 4 without notes"
- "Record a 60-second video walking through your ${project ? `${project} ` : ''}demo"`;
}

function buildTrack30Prompt(input) {
  const goal     = String(input?.goal || '').trim();
  const category = String(input?.goalCategory || 'other').trim();
  const hours    = String(input?.dailyHours || '2-4').trim();
  const exp      = String(input?.experienceLevel || 'intermediate').trim();
  const blocker  = String(input?.blockerHint || 'none').trim();
  const project  = String(input?.currentProject || '').trim();
  const weekGoal = String(input?.weekGoal || '').trim();
  const why      = String(input?.whyItMatters || '').trim();
  const tried    = String(input?.triedBefore || '').trim();
  const restPos  = Number(input?.restDayPosition) || 6;

  const extra = [
    project  ? `Current project / what they're doing: ${project}` : '',
    weekGoal ? `Monthly target outcome: ${weekGoal}` : '',
    why      ? `Why it matters to them: ${why}` : '',
    tried    ? `What they've already tried: ${tried}` : '',
  ].filter(Boolean).join('\n');

  return `Goal: ${goal}
Category: ${category}
Daily hours: ${hours}
Experience: ${exp}
Biggest blocker: ${blocker}
${extra}

Track length: 28 days (4 weeks × 7 days each)
Rest day: Day ${restPos} of each 7-day week is a rest day (days ${restPos}, ${restPos + 7}, ${restPos + 14}, ${restPos + 21})

Generate:
1. phases[] — 4 items. For each week: AI-generated name fitting the goal + role (setup/build/validate/ship/recover/review).
   Week 1 is usually "setup" or "foundations", Week 4 usually "ship" or "launch".
   Name must be goal-specific (e.g. "Scaffold & Wire" not "Setup").
2. days[] — 28 items. Rest days: isRestDay: true, role: "rest", title: "Rest day", why: "", successCriteria: "", estimateMinutes: 0, category: "rest".
   Active days: same rules as Spark — action-verb title, specific to project, concrete criteria.
   Day 1 ≤ 60 min. Week 4 active days build toward a shippable artifact.

Arc: Week 1 = establish foundation | Week 2 = build the core | Week 3 = test & validate | Week 4 = finalize & ship

Hard constraints: same title quality rules as 7-day track. If currentProject provided, every active title must name it.
estimateMinutes for active days: one of 30 | 45 | 60 | 90 | 120. Rest days: 0.
Return JSON only.`;
}

function buildSparkToTrackExtendPrompt(sparkTrack, sparkDays, history) {
  const goal     = String(sparkTrack?.goal || '').trim();
  const category = String(sparkTrack?.goalCategory || 'other').trim();
  const days     = Array.isArray(sparkDays) ? sparkDays : [];
  const done     = days.filter((d) => d.status === 'done' || d.status === 'rescued').length;
  const missed   = days.filter((d) => d.status === 'missed').length;
  const blocked  = days.filter((d) => d.status === 'blocked').length;
  const entries  = Array.isArray(history?.entries) ? history.entries : [];
  const proofTexts = entries.filter((e) => e.proofValue).map((e) => String(e.proofValue).slice(0, 80)).slice(0, 5).join(' | ');
  const sparkTitles = days.map((d) => `Day ${d.dayNumber}: ${String(d.title || '').slice(0, 60)}`).join('\n');
  const patterns = Array.isArray(history?.failurePatterns)
    ? history.failurePatterns.slice(0, 5).map((p) => String(p.blockerCategory || 'other')).join(', ') : 'none';

  return `Goal: ${goal}
Category: ${category}

The user completed their 7-day Spark probe.
Spark results: done=${done}/7, missed=${missed}, blocked=${blocked}
Spark days:
${sparkTitles}
Proof submitted: ${proofTexts || 'none'}
Failure patterns: ${patterns}

Now generate their 28-day Track. Start from where Spark ended. Build on what worked. Design around what blocked them.
Same arc and quality rules as track_generate_30 (4 phases, 4 weeks, 1 rest day per week at day 6 of each week).
Week 1 should consolidate Spark wins and fix gaps. Week 4 should produce a shippable artifact.

Return JSON only (track30Schema: goal, phases[], days[28]).`;
}

function buildTrackContinuePrompt(previousTrack, previousDays, recap, choice) {
  const days    = Array.isArray(previousDays) ? previousDays : [];
  const done    = days.filter((d) => d.status === 'done' || d.status === 'rescued').length;
  const missed  = days.filter((d) => d.status === 'missed').length;
  const blocked = days.filter((d) => d.status === 'blocked').length;
  const base = buildTrackPrompt({
    goal: previousTrack?.goal || '', goalCategory: previousTrack?.goalCategory || 'other',
    dailyHours: '2-4', experienceLevel: 'intermediate', blockerHint: 'none',
  });
  return `${base}

Previous 28-day Track summary:
- Completed: ${done} / 28  |  Missed: ${missed}  |  Blocked: ${blocked}
- Recap: ${String(recap || 'none').slice(0, 300)}
- User choice: ${choice === 'continue' ? 'continue same goal' : 'new direction with same goal'}

Continue from where the previous track left off. Do not repeat tasks already completed.
Design around the patterns that caused missed days. Day 1 starts from the current progress point.`;
}

function buildAgentStepsPrompt(day, track, failureMemory, user) {
  const title    = String(day?.title || '').trim();
  const criteria = String(day?.successCriteria || '').trim();
  const why      = String(day?.why || '').trim();
  const minutes  = Number(day?.estimateMinutes) || 60;
  const goal     = String(track?.goal || '').trim();
  const category = String(day?.category || track?.goalCategory || 'other').trim();
  const patterns = buildPatternSummary(failureMemory);
  const project  = String(user?.currentProject || '').trim();
  const weekGoal = String(user?.weekGoal       || '').trim();
  const exp      = String(user?.experienceLevel || 'intermediate').trim();
  const tried    = String(user?.triedBefore    || '').trim();
  const ctx = [
    project  ? `Their project: ${project}`                : '',
    weekGoal ? `Week target: ${weekGoal}`                  : '',
    exp      ? `Experience level: ${exp}`                  : '',
    tried    ? `What they have tried before: ${tried}`     : '',
  ].filter(Boolean).join('\n');

  return `Today's task: ${title}
${criteria ? `Done when: ${criteria}` : ''}
${why      ? `Why this matters: ${why}` : ''}
Goal: ${goal}
Category: ${category}
Time budget: ${minutes} minutes total
Recurring blockers: ${patterns}
${ctx ? `\n${ctx}` : ''}

Generate 3–5 sequential micro-steps tailored to THIS user's situation.
- Step 1 is the lowest-friction concrete action that produces something real (10–15 min).
- Each step names the actual object/tool/output. If their project is given, name it.
- Steps collectively make the "done when" criterion verifiable by the last step.
- Total time across all steps ≈ the budget above.
- Do not include meta steps. No "open your workspace". No "decide what to do".`;
}

function buildProofCheckPrompt(day, proofInput, track) {
  return `Task: ${String(day?.title || '').trim()}
Success criteria: ${String(day?.successCriteria || 'not specified').trim()}
Goal category: ${String(track?.goalCategory || 'other').trim()}
Proof submitted (${String(proofInput?.type || 'text')}): ${String(proofInput?.value || '').slice(0, 400)}

Does this proof demonstrate the task was completed?
- met: clearly satisfies the success criteria
- partial: real progress visible but criteria not fully met
- not_enough: does not demonstrate completion

Be practical. Partial credit is fine if genuine progress is visible.
Return JSON only.`;
}

function buildRescuePrompt(day, blockerReason, track, failureMemory) {
  return `Original task: ${String(day?.title || '').trim()}
Goal: ${String(track?.goal || '').trim()}
Blocker description: ${String(blockerReason || 'not specified').trim()}
Past blocker patterns: ${buildPatternSummary(failureMemory)}

Generate a rescue action completable in 5–30 minutes.
It must be meaningfully smaller and more accessible than the original task.
Steps must be concrete — no advice or motivation.`;
}

function buildActionKitPrompt(day, track) {
  return `Task: ${String(day?.title || '').trim()}
Goal: ${String(track?.goal || '').trim()}
Category: ${String(track?.goalCategory || 'other').trim()}

Generate an Action Kit: 3–5 items that help execute this specific task.
Include: one template or framework, one definition or reference, one guiding question.
All items must be text-only — no external URLs, no install requirements.
Each item must be under 100 words.
Produce usable material the user can apply immediately, not general advice.
Return JSON only.`;
}

function buildAdaptDayPrompt(track, today, tomorrow, failureMemory) {
  const goal      = String(track?.goal || '').trim();
  const dayNumber = Number(today?.dayNumber || track?.currentDayNumber || 1);
  const outcome   = String(today?.status || 'pending');
  const blocker   = String(today?.blockerText || 'none').trim();
  const patterns  = buildPatternSummary(failureMemory);

  let phaseCtx = '';
  if (Array.isArray(track?.phases) && track.phases.length) {
    const weekNum = Number(tomorrow?.weekNumber || Math.ceil((tomorrow?.dayNumber || dayNumber) / 7));
    const phase = track.phases.find((p) => p.weekNumber === weekNum);
    if (phase) phaseCtx = `\nPhase: Week ${weekNum}/${phase.name} (${phase.role})`;
  }

  return `Goal: ${goal}
Today (Day ${dayNumber}) outcome: ${outcome}
Blocker: ${blocker}
Tomorrow's planned task: ${String(tomorrow?.title || '').trim()}${phaseCtx}
Failure patterns: ${patterns}

Should tomorrow's task change based on today's outcome?
If yes, return an adjusted title (max 80 chars) and a one-sentence reason.
If no, confirm the original title as-is with an empty why.
Return JSON only.`;
}

function buildDay7RecapPrompt(track, days, history, failureMemory) {
  const goal     = String(track?.goal || '').trim();
  const dayArr   = Array.isArray(days) ? days : [];
  const done     = dayArr.filter((d) => d.status === 'done').length;
  const missed   = dayArr.filter((d) => d.status === 'missed').length;
  const blocked  = dayArr.filter((d) => d.status === 'blocked').length;
  const skipped  = dayArr.filter((d) => d.status === 'skipped').length;
  const rescued  = dayArr.filter((d) => d.status === 'rescued').length;
  const proofCount = (Array.isArray(history?.entries) ? history.entries : []).filter((e) => e.proofType).length;

  return `Goal: ${goal}
7-day results: done=${done}, missed=${missed}, blocked=${blocked}, skipped=${skipped}, rescued=${rescued}
Failure patterns: ${buildPatternSummary(failureMemory)}
Proof submissions: ${proofCount}

Write a 2–3 sentence execution reflection.
State what pattern emerged and what to carry into the next run.
No motivational filler. Factual and direct.`;
}
