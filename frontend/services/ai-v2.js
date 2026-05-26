// StriveAI v2 AI service.
// All v2 AI calls go through this module. UI components must not call AI directly.

import { getAuthToken } from './auth.js';

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
    body: JSON.stringify({
      action,
      prompt,
      systemCtx,
      maxTokens,
      opts: { responseJsonSchema: schema },
    }),
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
  try {
    return JSON.parse(text);
  } catch (_e) {
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
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, n]) => `${cat} (×${n})`)
    .join(', ')
    .slice(0, 100);
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

function trackSchema() {
  return {
    type: 'object',
    required: ['goal', 'days'],
    properties: {
      goal: { type: 'string' },
      days: { type: 'array', minItems: 7, maxItems: 7, items: DAY_ITEM_SCHEMA },
    },
  };
}

function stepsSchema() {
  return {
    type: 'object',
    required: ['steps'],
    properties: {
      steps: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          required: ['index', 'text'],
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
    type: 'object',
    required: ['verdict'],
    properties: {
      verdict: { type: 'string', enum: ['met', 'partial', 'not_enough'] },
      note:    { type: 'string', maxLength: 200 },
    },
  };
}

function rescueSchema() {
  return {
    type: 'object',
    required: ['rescueTitle', 'steps'],
    properties: {
      rescueTitle: { type: 'string', maxLength: 100 },
      steps: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', maxLength: 120 } },
      reframeNote: { type: 'string', maxLength: 160 },
    },
  };
}

function kitSchema() {
  return {
    type: 'object',
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        minItems: 3,
        maxItems: 5,
        items: {
          type: 'object',
          required: ['type', 'label', 'content'],
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
    type: 'object',
    required: ['changed', 'title', 'why'],
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

export async function generateExecutionTrack(onboardingInput) {
  try {
    const data = await requestJson({
      action: 'track_generate',
      prompt: buildTrackPrompt(onboardingInput),
      systemCtx: TRACK_CTX,
      schema: trackSchema(),
      maxTokens: 1400,
    });
    if (!Array.isArray(data?.days) || data.days.length < 7) throw new Error('invalid track');
    return data;
  } catch (_e) {
    return fallbackTrack(onboardingInput);
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
    return {
      verdict: valid.has(data?.verdict) ? data.verdict : 'partial',
      note: String(data?.note || ''),
    };
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
    const todayIndex = (track?.currentDayNumber || 1) - 1;
    const tomorrowIndex = todayIndex + 1;
    if (tomorrowIndex >= 7) return null;
    const today = (Array.isArray(days) ? days : [])[todayIndex] || {};
    const tomorrow = (Array.isArray(days) ? days : [])[tomorrowIndex] || {};
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
      action: 'track_continue',
      prompt: buildTrackContinuePrompt(previousTrack, previousDays, recap, choice),
      systemCtx: TRACK_CTX,
      schema: trackSchema(),
      maxTokens: 1400,
    });
    if (!Array.isArray(data?.days) || data.days.length < 7) throw new Error('invalid track');
    return data;
  } catch (_e) {
    return fallbackTrack({
      goal: previousTrack?.goal || '',
      goalCategory: previousTrack?.goalCategory || 'other',
    });
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
- why: one sentence connecting THIS day to THIS user's goal (name the project or week target if given), max 120 chars.
- successCriteria: written as "X exists" or "Y is true" — concretely verifiable, max 120 chars.
- estimateMinutes: one of 30 | 45 | 60 | 90 | 120.
- category: research | build | outreach | review | test | write | practice | other.
- blockerRisk: one phrase for the most likely obstacle on this day, max 100 chars.

Bad titles (never produce these):
- "Research market"           ← no subject
- "Work on project"           ← no action, no object
- "Study the concept"         ← which concept?
- "Define your goal"          ← that already happened in onboarding
- "Plan your week"            ← meta, no output

Good titles (this is the bar):
- "Interview 3 coffee-shop owners about their biggest inventory frustration"
- "Write the first 200-word draft of your cold email to design agencies"
- "Build the login page for ${project || '[their project]'} and run it end-to-end locally"
- "Solve 5 calculus chain-rule problems from Chapter 4 without notes"
- "Record a 60-second video walking through your ${project ? `${project} ` : ''}demo"`;
}

function buildTrackContinuePrompt(previousTrack, previousDays, recap, choice) {
  const days  = Array.isArray(previousDays) ? previousDays : [];
  const done  = days.filter((d) => d.status === 'done' || d.status === 'rescued').length;
  const missed = days.filter((d) => d.status === 'missed').length;
  const blocked = days.filter((d) => d.status === 'blocked').length;

  const base = buildTrackPrompt({
    goal:            previousTrack?.goal || '',
    goalCategory:    previousTrack?.goalCategory || 'other',
    dailyHours:      '2-4',
    experienceLevel: 'intermediate',
    blockerHint:     'none',
  });

  return `${base}

Previous 7-day summary:
- Completed: ${done} / 7  |  Missed: ${missed}  |  Blocked: ${blocked}
- Recap: ${String(recap || 'none').slice(0, 300)}
- User choice: ${choice === 'continue' ? 'continue same goal' : 'new direction with same goal'}

Continue from where the previous track left off.
Do not repeat tasks already completed.
Design around the patterns that caused missed days.
Day 1 of this new track should start from the current progress point.`;
}

function buildAgentStepsPrompt(day, track, failureMemory, user) {
  const title    = String(day?.title || '').trim();
  const criteria = String(day?.successCriteria || '').trim();
  const why      = String(day?.why || '').trim();
  const minutes  = Number(day?.estimateMinutes) || 60;
  const goal     = String(track?.goal || '').trim();
  const category = String(day?.category || track?.goalCategory || 'other').trim();
  const patterns = buildPatternSummary(failureMemory);

  const project    = String(user?.currentProject || '').trim();
  const weekGoal   = String(user?.weekGoal       || '').trim();
  const experience = String(user?.experienceLevel || 'intermediate').trim();
  const tried      = String(user?.triedBefore    || '').trim();

  const userContext = [
    project    ? `Their project: ${project}`                : '',
    weekGoal   ? `Week 7-day target: ${weekGoal}`           : '',
    experience ? `Experience level: ${experience}`          : '',
    tried      ? `What they have tried before: ${tried}`    : '',
  ].filter(Boolean).join('\n');

  return `Today's task: ${title}
${criteria ? `Done when: ${criteria}`     : ''}
${why      ? `Why this matters: ${why}`   : ''}
Goal: ${goal}
Category: ${category}
Time budget: ${minutes} minutes total
Recurring blockers: ${patterns}
${userContext ? `\n${userContext}` : ''}

Generate 3–5 sequential micro-steps tailored to THIS user's situation.

Constraints:
- Step 1 is the lowest-friction concrete action that produces something real (10–15 min).
- Each step names the actual object/tool/output. If their project is given, name it.
- Steps collectively make the "done when" criterion verifiable by the last step.
- Total time across all steps ≈ the budget above.
- Do not include meta steps. No "open your workspace". No "decide what to do".`;
}

function buildProofCheckPrompt(day, proofInput, track) {
  const title    = String(day?.title || '').trim();
  const criteria = String(day?.successCriteria || 'not specified').trim();
  const category = String(track?.goalCategory || 'other').trim();
  const type     = String(proofInput?.type || 'text');
  const value    = String(proofInput?.value || '').slice(0, 400);

  return `Task: ${title}
Success criteria: ${criteria}
Goal category: ${category}
Proof submitted (${type}): ${value}

Does this proof demonstrate the task was completed?
- met: clearly satisfies the success criteria
- partial: real progress visible but criteria not fully met
- not_enough: does not demonstrate completion

Be practical. Partial credit is fine if genuine progress is visible.
Return JSON only.`;
}

function buildRescuePrompt(day, blockerReason, track, failureMemory) {
  const title   = String(day?.title || '').trim();
  const goal    = String(track?.goal || '').trim();
  const blocker = String(blockerReason || 'not specified').trim();
  const patterns = buildPatternSummary(failureMemory);

  return `Original task: ${title}
Goal: ${goal}
Blocker description: ${blocker}
Past blocker patterns: ${patterns}

Generate a rescue action.
The rescue must be completable in 5–30 minutes.
It must be meaningfully smaller and more accessible than the original task.
Steps must be concrete — no advice or motivation.`;
}

function buildActionKitPrompt(day, track) {
  const title    = String(day?.title || '').trim();
  const goal     = String(track?.goal || '').trim();
  const category = String(track?.goalCategory || 'other').trim();

  return `Task: ${title}
Goal: ${goal}
Category: ${category}

Generate an Action Kit: 3–5 items that help execute this specific task.
Include: one template or framework, one definition or reference, one guiding question.
All items must be text-only — no external URLs, no install requirements.
Each item must be under 100 words.
Produce usable material the user can apply immediately, not general advice.
Return JSON only.`;
}

function buildAdaptDayPrompt(track, today, tomorrow, failureMemory) {
  const goal          = String(track?.goal || '').trim();
  const dayNumber     = Number(today?.dayNumber || track?.currentDayNumber || 1);
  const outcome       = String(today?.status || 'pending');
  const blockerText   = String(today?.blockerText || 'none').trim();
  const tomorrowTitle = String(tomorrow?.title || '').trim();
  const patterns      = buildPatternSummary(failureMemory);

  return `Goal: ${goal}
Today (Day ${dayNumber}) outcome: ${outcome}
Blocker: ${blockerText}
Tomorrow's planned task: ${tomorrowTitle}
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
  const proofCount = (Array.isArray(history?.entries) ? history.entries : [])
    .filter((e) => e.proofType).length;
  const patterns = buildPatternSummary(failureMemory);

  return `Goal: ${goal}
7-day results: done=${done}, missed=${missed}, blocked=${blocked}, skipped=${skipped}, rescued=${rescued}
Failure patterns: ${patterns}
Proof submissions: ${proofCount}

Write a 2–3 sentence execution reflection.
State what pattern emerged and what to carry into the next run.
No motivational filler. Factual and direct.`;
}

// ── Fallbacks ──────────────────────────────────────────────────────────────

const FALLBACK_TITLES = {
  project:  ['Define what you are building and who it is for', 'Cut scope to 3 essential features', 'Set up your repo and write a project README', 'Build the core feature end-to-end', 'Test with 2 real people and note observations', 'Fix the top issue found in testing', 'Record a demo or capture final screenshots'],
  startup:  ['Write your one-sentence value proposition', 'List 10 potential users and mark 3 reachable', 'Send 5 direct outreach messages requesting calls', 'Run 3 user interviews and log verbatim quotes', 'Build a rough prototype of the core flow', 'Show prototype to 2 users and record reactions', 'Write a one-page problem–solution–evidence summary'],
  content:  ['Draft your first post or script', 'Edit: cut everything not directly useful to the reader', 'Publish and note initial engagement numbers', 'Batch-write 2 more pieces in the same format', 'Study 3 high-performing posts in your niche', 'Apply the best structure to one draft and publish', 'Review 7-day numbers and write one clear lesson'],
  skill:    ['Define one small project to build with this skill', 'Complete the first tutorial and write 3 takeaways', 'Build one exercise from scratch without copying', 'Find and close the biggest knowledge gap', 'Build an exercise combining two concepts', 'Explain the core concept back in 200 words', 'Complete or demo the project from Day 1'],
  career:   ['Write your target-role summary and top qualification', 'Update your resume and cut every bullet to one line', 'Find 5 job postings where you meet 70%+ of requirements', 'Send one personalised cold outreach message', 'Apply to 2 saved postings with customised notes', 'Write out answers to the 3 most common interview questions', 'Do a mock interview and record yourself'],
  study:    ['List the 3 most important concepts for this week', 'Study concept 1 and write a summary in your own words', 'Complete 3 practice problems on concept 1', 'Study concept 2 and connect it to concept 1 in writing', 'Complete 5 mixed practice problems', 'Study concept 3 and write a summary connecting all three', 'Do a timed recall without notes and note weak spots'],
  habit:    ['Define the habit: trigger, action, and duration', 'Do the habit today and record start and end time', 'Set a specific daily time and block it in your calendar', 'Do the habit and rate difficulty 1–5', 'Remove one friction point and prepare the environment', 'Do the habit and note whether preparation helped', 'Write a one-paragraph reflection on what worked or did not'],
  fitness:  ['Define your plan: type, duration, and frequency', 'Complete the first workout and record your key metric', 'Identify one technique issue and look up the fix', 'Complete second workout applying the technique change', 'Add one measurable progressive overload', 'Rest or do light movement and prepare for Day 7', 'Final workout: record metric and compare to Day 2'],
};

const FALLBACK_CRITERIA = {
  project:  ['Scope written: target user + the one problem you are solving', 'Feature list trimmed to 3, written down', 'Repo exists with README describing what it does', 'Core feature runs end-to-end without crashing', 'Notes from 2 testers written with at least one clear issue', 'Top issue fixed and re-tested', 'Demo video or final screenshots captured and saved'],
  startup:  ['Value proposition written in one sentence', 'List of 10 potential users complete, 3 marked reachable', '5 outreach messages sent and noted in a log', '3 interview notes logged with verbatim quotes', 'Prototype is clickable or a screencast is recorded', 'Reaction notes from 2 users written with one key insight', 'One-page problem–solution–evidence summary written'],
  content:  ['First draft or script exists as a file', 'Edited version is at least 30% shorter than the draft', 'Post published and engagement numbers noted', '2 more drafts exist in the same format', 'Notes on 3 high-performing posts in your niche written', 'Revised draft published', '7-day metrics reviewed and one lesson written'],
  skill:    ['Small project defined and the goal written down', 'First tutorial completed and 3 takeaways written', 'One exercise built from scratch without copying', 'Biggest knowledge gap identified and a resource found', 'Exercise combining two concepts built and working', 'Core concept written out in 200 words without notes', 'Day 1 project completed or a demo recorded'],
  career:   ['Target role summary and top qualification written', 'Resume updated with every bullet cut to one line', '5 job postings found where you meet 70%+ requirements', 'One personalised cold message sent', '2 applications submitted with customised cover notes', 'Answers to 3 common interview questions written out', 'Mock interview recorded and one improvement noted'],
  study:    ['3 key concepts for the week listed with sources', 'Concept 1 summarised in your own words', '3 practice problems on concept 1 completed and checked', 'Concept 2 connected to concept 1 in writing', '5 mixed practice problems completed and scored', 'All 3 concepts summarised together in one page', 'Timed recall done without notes and weak spots listed'],
  habit:    ['Habit written as: when X happens I will do Y for Z minutes', 'Start time and end time recorded for first attempt', 'Calendar block created for daily habit time', 'Difficulty rated 1–5 with one reason written', 'One friction point removed and environment prepared', 'Note written on whether the preparation helped', 'One-paragraph reflection on what worked or did not'],
  fitness:  ['Plan written: type, duration, and weekly frequency', 'First workout done and key metric recorded', 'One technique issue found and fix looked up', 'Second workout done applying the technique change', 'One measurable progressive overload applied and noted', 'Recovery session done and Day 7 workout prepared', 'Final workout done and metric compared to Day 2'],
};

function fallbackTrack(input) {
  const goal     = String(input?.goal || 'your goal').trim();
  const category = String(input?.goalCategory || 'other').trim();
  const titles   = FALLBACK_TITLES[category] || ['Define your goal clearly and write a done condition', 'Identify the 3 most important sub-tasks', 'Complete the first sub-task', 'Review progress and set the next priority', 'Complete the second sub-task', 'Adjust scope so Day 7 is achievable', 'Deliver one tangible output for the week'];
  const criteria = FALLBACK_CRITERIA[category] || titles.map((t) => `${t.slice(0, 65)} — output written and saved`);

  const WHYS = [
    'Sets a concrete starting point and removes ambiguity for the week',
    `Builds on Day 1 and advances: ${goal.slice(0, 50)}`,
    `Converts preparation into a first real output for: ${goal.slice(0, 45)}`,
    `Maintains momentum and deepens progress toward: ${goal.slice(0, 45)}`,
    `Pushes past the halfway point toward: ${goal.slice(0, 50)}`,
    'Removes the last obstacle before the final deliverable',
    'Produces the proof point that closes out the 7-day goal',
  ];

  return {
    goal,
    days: titles.map((title, i) => ({
      dayNumber:       i + 1,
      title,
      why:             WHYS[i] || `Advances progress toward: ${goal.slice(0, 60)}`,
      successCriteria: criteria[i] || `${title.slice(0, 65)} — output written and saved`,
      estimateMinutes: 60,
      category:        'other',
      blockerRisk:     '',
      status:          'pending',
      date:            '',
    })),
  };
}

function fallbackSteps(day) {
  const title    = String(day?.title || 'your task').slice(0, 80);
  const criteria = String(day?.successCriteria || '').slice(0, 100);
  const category = String(day?.category || 'other');

  const byCategory = {
    build: [
      `Write 2-3 bullets describing exactly what "${title}" looks like when done.`,
      'Identify the single smallest piece you can build first — name it explicitly.',
      'Build that smallest piece end-to-end and run it once.',
    ],
    research: [
      `Write down 3 questions you need answered for "${title}".`,
      'Find one source per question — paste the link or quote.',
      'Summarise the answers in 4–6 bullet points you can use tomorrow.',
    ],
    write: [
      `Write a 3-line outline of "${title}" — beginning, middle, end.`,
      'Draft the opening paragraph (or first 100 words). No editing.',
      'Finish a complete first draft. Length over polish.',
    ],
    outreach: [
      'Make a list of 5 specific people or accounts to reach today.',
      'Draft one message template (≤6 sentences) personalised for one of them.',
      'Send at least 3 messages. Log the responses you get back.',
    ],
    review: [
      `List what you produced this week related to "${title}".`,
      'For each item, write one sentence: what worked, what did not.',
      'Pick one specific change for tomorrow based on the review.',
    ],
    test: [
      `Write 3 specific scenarios you want to verify for "${title}".`,
      'Run scenario 1 yourself or with one tester. Record what happened.',
      'Run the remaining scenarios. Write up the one issue you most want to fix.',
    ],
    practice: [
      `Set a 25-minute timer for focused practice on "${title}".`,
      'Do the practice — actively, not passively. Capture one specific thing you noticed.',
      'Identify the single weakest area and plan tomorrow around it.',
    ],
  };

  const steps = byCategory[category] || [
    `Write the first 2–3 bullet points describing what "${title}" looks like done.`,
    'Do the single smallest concrete action that moves you toward that — 10–25 minutes.',
    criteria
      ? `Check your output against this: "${criteria}". Save the result before stopping.`
      : 'Capture your output (a link, a file, a paragraph) so it exists outside your head.',
  ];

  return steps.map((text, i) => ({ index: i, text }));
}

function fallbackProofCheck() {
  return {
    verdict: 'partial',
    note: 'Could not verify automatically. Check your work against the success criteria.',
  };
}

function fallbackRescue(day) {
  const title = String(day?.title || 'your task').slice(0, 60);
  return {
    rescueTitle: `Smallest step toward: ${title}`,
    steps: [
      'Set a 10-minute timer.',
      'Complete the first concrete sub-part of this task, even if rough.',
      'Write one sentence describing what you produced.',
    ],
    reframeNote: '',
    source: 'fallback',
  };
}

function fallbackKit(day) {
  const title = String(day?.title || 'your task').slice(0, 60);
  return {
    items: [
      { type: 'question',  label: 'Focus question', content: `What is the smallest thing I can produce in 30 minutes that proves progress on: "${title}"?` },
      { type: 'template',  label: 'Progress log',   content: 'Time started:\nWhat I did:\nOutput produced:\nBlocker (if any):\nNext step:' },
      { type: 'tip',       label: 'Getting unstuck', content: 'Reduce scope to 25% of the original task. A smaller done beats a full not-started every time.' },
    ],
  };
}

function fallbackAdaptDay(track, days) {
  const tomorrowIndex = track?.currentDayNumber || 1;
  const tomorrow = (Array.isArray(days) ? days : [])[tomorrowIndex] || {};
  return { changed: false, title: String(tomorrow.title || ''), why: '' };
}

function fallbackDay7Recap(track, days) {
  const goal   = String(track?.goal || 'your goal').slice(0, 60);
  const dayArr = Array.isArray(days) ? days : [];
  const done   = dayArr.filter((d) => d.status === 'done' || d.status === 'rescued').length;
  return `You completed ${done} of 7 days working on: ${goal}. Review your notes to identify the pattern that most affected your consistency. Use that as the starting point for your next run.`;
}
