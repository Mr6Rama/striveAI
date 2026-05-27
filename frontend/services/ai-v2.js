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
    const s = text.indexOf('{'), e = text.lastIndexOf('}');
    if (s >= 0 && e > s) return JSON.parse(text.slice(s, e + 1));
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
  patterns.forEach(({ blockerCategory }) => { const c = String(blockerCategory || 'other'); counts[c] = (counts[c] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} (×${n})`).join(', ').slice(0, 100);
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
    dayNumber: { type: 'integer', minimum: 1, maximum: 7 }, title: { type: 'string', maxLength: 80 },
    why: { type: 'string', maxLength: 120 }, successCriteria: { type: 'string', maxLength: 120 },
    estimateMinutes: { type: 'integer', enum: [30, 45, 60, 90, 120] }, category: { type: 'string' },
    blockerRisk: { type: 'string', maxLength: 100 },
  },
};

// sparkSchema — 7-day Spark probe (no phases); trackSchema is a backward-compat alias
function sparkSchema() {
  return { type: 'object', required: ['goal', 'days'], properties: { goal: { type: 'string' }, days: { type: 'array', minItems: 7, maxItems: 7, items: DAY_ITEM_SCHEMA } } };
}
function trackSchema() { return sparkSchema(); }

// track30Schema — 28-day Track with 4 phases
function track30Schema() {
  const day30 = {
    type: 'object',
    required: ['dayNumber', 'weekNumber', 'role', 'isRestDay', 'title', 'why', 'successCriteria', 'estimateMinutes', 'category'],
    properties: {
      dayNumber: { type: 'integer', minimum: 1, maximum: 28 }, weekNumber: { type: 'integer', minimum: 1, maximum: 4 },
      role: { type: 'string' }, isRestDay: { type: 'boolean' }, title: { type: 'string', maxLength: 80 },
      why: { type: 'string', maxLength: 120 }, successCriteria: { type: 'string', maxLength: 120 },
      estimateMinutes: { type: 'integer', enum: [0, 30, 45, 60, 90, 120] }, category: { type: 'string' },
      blockerRisk: { type: 'string', maxLength: 100 },
    },
  };
  return {
    type: 'object', required: ['goal', 'phases', 'days'],
    properties: {
      goal: { type: 'string' },
      phases: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'object', required: ['weekNumber', 'name', 'role'], properties: { weekNumber: { type: 'integer', minimum: 1, maximum: 4 }, name: { type: 'string', maxLength: 30 }, role: { type: 'string', enum: ['setup', 'build', 'validate', 'ship', 'recover', 'review'] } } } },
      days: { type: 'array', minItems: 28, maxItems: 28, items: day30 },
    },
  };
}

function stepsSchema() {
  return { type: 'object', required: ['steps'], properties: { steps: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'object', required: ['index', 'text'], properties: { index: { type: 'integer' }, text: { type: 'string', maxLength: 160 }, output: { type: 'string', maxLength: 120 }, hint: { type: 'string', maxLength: 180 } } } } } };
}
function proofCheckSchema() {
  return { type: 'object', required: ['verdict'], properties: { verdict: { type: 'string', enum: ['met', 'partial', 'not_enough'] }, note: { type: 'string', maxLength: 200 } } };
}
function rescueSchema() {
  return { type: 'object', required: ['rescueTitle', 'steps'], properties: { rescueTitle: { type: 'string', maxLength: 100 }, steps: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', maxLength: 120 } }, reframeNote: { type: 'string', maxLength: 160 } } };
}
function kitSchema() {
  return { type: 'object', required: ['items'], properties: { items: { type: 'array', minItems: 3, maxItems: 5, items: { type: 'object', required: ['type', 'label', 'content'], properties: { type: { type: 'string', enum: ['template', 'reference', 'question', 'tool', 'tip'] }, label: { type: 'string', maxLength: 50 }, content: { type: 'string', maxLength: 400 } } } } } };
}
function adaptSchema() {
  return { type: 'object', required: ['changed', 'title', 'why'], properties: { changed: { type: 'boolean' }, title: { type: 'string', maxLength: 80 }, why: { type: 'string', maxLength: 120 } } };
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
- Each step is one concrete physical action with a specific, nameable output.
- Each step is completable in 10–30 minutes.
- The first step is the LOWEST-FRICTION real action — it must produce something tangible immediately.
- Use the user's actual project name, tool names, and file names when given.
- Name exact commands, exact file names, exact URLs — never say "your tool" or "the platform".
- Reference the day done condition — the last step makes the success criterion checkable.

NEVER start steps with: "Open", "Re-read", "Decide", "Think", "Consider", "Plan", "Define", "Set up your", "Get familiar with", "Review".
NEVER write meta steps like "identify the most important sub-task" or "decide what to build first".

GOOD examples for "Build login page for MyApp":
- "Create src/pages/login.tsx with a form containing email + password inputs and a Submit button"
- "Import useForm from react-hook-form and wire it to the form fields with required validation"
- "Add handleSubmit that calls POST /api/auth/login and console.log the response"

BAD examples (too vague — never do this):
- "Set up your development environment"
- "Write the main component"
- "Test the feature with users"

For each step provide:
  text: action-verb start, names the specific file/command/tool/output, max 160 chars
  output: what concretely exists when done, max 120 chars
  hint: actual code snippet, CLI command, or template the user can copy — not advice, max 180 chars
Return JSON only.`;

const RESCUE_CTX = `The user is blocked. If they described exactly where they got stuck, answer that specific problem directly — give the command, code, or next concrete action that unblocks them. Otherwise generate a smaller, more accessible version of the original task completable in 5–30 minutes. Steps must be concrete — no advice or motivation. Return JSON only.`;

// ── Exported functions ─────────────────────────────────────────────────────

export async function generateExecutionTrack(input) {
  const isTrack = input?.trackKind === 'track';
  try {
    if (isTrack) {
      const data = await requestJson({ action: 'track_generate_30', prompt: buildTrack30Prompt(input), systemCtx: TRACK_30_CTX, schema: track30Schema(), maxTokens: 4000 });
      if (!Array.isArray(data?.days) || data.days.length < 28) throw new Error('invalid track30');
      if (!Array.isArray(data?.phases) || data.phases.length < 4) throw new Error('invalid phases');
      return data;
    }
    const data = await requestJson({ action: 'spark_generate', prompt: buildTrackPrompt(input), systemCtx: TRACK_CTX, schema: sparkSchema(), maxTokens: 1400 });
    if (!Array.isArray(data?.days) || data.days.length < 7) throw new Error('invalid spark');
    return data;
  } catch (_e) { return fallbackTrack(input); }
}

export async function generateSparkToTrackExtend(sparkTrack, sparkDays, history) {
  try {
    const data = await requestJson({ action: 'spark_to_track_extend', prompt: buildSparkToTrackExtendPrompt(sparkTrack, sparkDays, history), systemCtx: TRACK_30_CTX, schema: track30Schema(), maxTokens: 4000 });
    if (!Array.isArray(data?.days) || data.days.length < 28) throw new Error('invalid track30');
    if (!Array.isArray(data?.phases) || data.phases.length < 4) throw new Error('invalid phases');
    return data;
  } catch (_e) {
    return fallbackTrack({ goal: sparkTrack?.goal || '', goalCategory: sparkTrack?.goalCategory || 'other', trackKind: 'track' });
  }
}

export async function generateAgentSteps(day, track, failureMemory, user) {
  try {
    const data = await requestJson({ action: 'agent_steps', prompt: buildAgentStepsPrompt(day, track, failureMemory, user), systemCtx: STEPS_CTX, schema: stepsSchema(), maxTokens: 700 });
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    if (!steps.length) throw new Error('empty steps');
    return steps.map((s, i) => ({ index: Number.isInteger(s.index) ? s.index : i, text: String(s.text || '').slice(0, 160), output: String(s.output || '').slice(0, 120), hint: String(s.hint || '').slice(0, 180) }));
  } catch (_e) { return fallbackSteps(day); }
}

export async function generateActionKit(day, track) {
  try {
    const data = await requestJson({ action: 'action_kit', prompt: buildActionKitPrompt(day, track), systemCtx: '', schema: kitSchema(), maxTokens: 600 });
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) throw new Error('empty kit');
    return items;
  } catch (_e) { return fallbackKit(day).items; }
}

export async function checkProof(day, proofInput, track) {
  try {
    const data = await requestJson({ action: 'v2_proof_check', prompt: buildProofCheckPrompt(day, proofInput, track), systemCtx: '', schema: proofCheckSchema(), maxTokens: 250 });
    const valid = new Set(['met', 'partial', 'not_enough']);
    return { verdict: valid.has(data?.verdict) ? data.verdict : 'partial', note: String(data?.note || '') };
  } catch (_e) { return fallbackProofCheck(); }
}

export async function diagnoseBlocker(day, blockerReason, track, failureMemory, diagnosis) {
  try {
    const data = await requestJson({ action: 'rescue_action', prompt: buildRescuePrompt(day, blockerReason, track, failureMemory, diagnosis), systemCtx: RESCUE_CTX, schema: rescueSchema(), maxTokens: 500 });
    if (!data?.rescueTitle || !Array.isArray(data?.steps)) throw new Error('invalid rescue');
    return { rescueTitle: String(data.rescueTitle).slice(0, 100), steps: data.steps.slice(0, 3).map(String), reframeNote: String(data.reframeNote || '').slice(0, 160), source: 'ai' };
  } catch (_e) { return fallbackRescue(day); }
}

export async function adaptNextDay(track, days, history, failureMemory) {
  try {
    const totalDays     = track?.totalDays || 7;
    const todayIndex    = (track?.currentDayNumber || 1) - 1;
    const tomorrowIndex = todayIndex + 1;
    if (tomorrowIndex >= totalDays) return null;
    const daysArr  = Array.isArray(days) ? days : [];
    const today    = daysArr[todayIndex] || {};
    const tomorrow = daysArr[tomorrowIndex] || {};
    if (tomorrow.isRestDay) return null;
    const data = await requestJson({ action: 'adapt_day', prompt: buildAdaptDayPrompt(track, today, tomorrow, failureMemory), systemCtx: '', schema: adaptSchema(), maxTokens: 300 });
    return { changed: Boolean(data?.changed), title: String(data?.title || tomorrow.title || '').slice(0, 80), why: String(data?.why || '').slice(0, 120) };
  } catch (_e) { return fallbackAdaptDay(track, days); }
}

export async function generateDay7Recap(track, days, history, failureMemory) {
  try {
    const text = await requestText({ action: 'day7_recap', prompt: buildDay7RecapPrompt(track, days, history, failureMemory), systemCtx: '', maxTokens: 350 });
    if (!text) throw new Error('empty recap');
    return text;
  } catch (_e) { return fallbackDay7Recap(track, days); }
}

export async function generateContinuationWeek(previousTrack, previousDays, recap, choice) {
  try {
    const data = await requestJson({ action: 'track_continue_30', prompt: buildTrackContinuePrompt(previousTrack, previousDays, recap, choice), systemCtx: TRACK_CTX, schema: trackSchema(), maxTokens: 1400 });
    if (!Array.isArray(data?.days) || data.days.length < 7) throw new Error('invalid track');
    return data;
  } catch (_e) { return fallbackTrack({ goal: previousTrack?.goal || '', goalCategory: previousTrack?.goalCategory || 'other' }); }
}

// ── Prompt builders ────────────────────────────────────────────────────────

// Common field extraction shared by spark and track-30 prompts
function baseFields(input) {
  return {
    goal:     String(input?.goal || '').trim(),
    category: String(input?.goalCategory || 'other').trim(),
    hours:    String(input?.dailyHours || '2-4').trim(),
    exp:      String(input?.experienceLevel || 'intermediate').trim(),
    blocker:  String(input?.blockerHint || 'none').trim(),
    project:  String(input?.currentProject || '').trim(),
    weekGoal: String(input?.weekGoal || '').trim(),
    why:      String(input?.whyItMatters || '').trim(),
    tried:    String(input?.triedBefore || '').trim(),
  };
}

// Title quality rules shared by both spark and track-30 prompts
const TITLE_RULES = `Vague verbs forbidden in title — never start with: define, plan, work on, think about, think through, consider, decide, explore, research (without named subject), understand, get started on, learn about, look into.
title: action-verb start, names the specific subject/tool/deliverable, ≤80 chars.
why: one sentence connecting THIS day to THIS user's goal, ≤120 chars.
successCriteria: "X exists" or "Y is true" — concretely verifiable, ≤120 chars.
estimateMinutes: 30 | 45 | 60 | 90 | 120. category: research|build|outreach|review|test|write|practice|other.`;

function buildTrackPrompt(input) {
  const f = baseFields(input);
  const extra = [
    f.project  ? `Current project: ${f.project}` : '',
    f.weekGoal ? `Outcome wanted by day 7: ${f.weekGoal}` : '',
    f.why      ? `Why it matters: ${f.why}` : '',
    f.tried    ? `Already tried: ${f.tried}` : '',
  ].filter(Boolean).join('\n');

  return `Goal: ${f.goal}
Category: ${f.category}
Daily hours: ${f.hours}
Experience: ${f.exp}
Biggest blocker: ${f.blocker}
${extra}

Generate a 7-day execution track. Arc: Day 1 = lowest-friction start (≤60 min), Days 2–5 = build core, Day 6 = validate/polish, Day 7 = ship/shareable artifact. Each day builds on the previous day's concrete output. If currentProject provided, every title must name it.

${TITLE_RULES}

Good title examples:
- "Interview 3 coffee-shop owners about their biggest inventory frustration"
- "Build the login page for ${f.project || '[their project]'} and run it end-to-end locally"
- "Record a 60-second video walking through your ${f.project ? `${f.project} ` : ''}demo"`;
}

function buildTrack30Prompt(input) {
  const f = baseFields(input);
  const restPos = Number(input?.restDayPosition) || 6;
  const extra = [
    f.project  ? `Current project: ${f.project}` : '',
    f.weekGoal ? `Monthly target outcome: ${f.weekGoal}` : '',
    f.why      ? `Why it matters: ${f.why}` : '',
    f.tried    ? `Already tried: ${f.tried}` : '',
  ].filter(Boolean).join('\n');

  return `Goal: ${f.goal}
Category: ${f.category}
Daily hours: ${f.hours}
Experience: ${f.exp}
Biggest blocker: ${f.blocker}
${extra}

Track length: 28 days (4 weeks × 7 days). Rest day: position ${restPos} each week (days ${restPos}, ${restPos + 7}, ${restPos + 14}, ${restPos + 21}).

Generate:
1. phases[4] — AI-generated name per week fitting the goal + role (setup/build/validate/ship/recover/review). Week 1 ≈ foundations, Week 4 ≈ ship. Name must be goal-specific.
2. days[28] — Rest days: isRestDay:true, role:"rest", title:"Rest day", why:"", successCriteria:"", estimateMinutes:0, category:"rest". Active days: same title quality rules as Spark. Day 1 ≤60 min.

Arc: Week 1 = establish foundation | Week 2 = build core | Week 3 = test & validate | Week 4 = finalize & ship.
${TITLE_RULES}
estimateMinutes for rest days: 0. If currentProject provided, every active title must name it.
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
Spark results: done=${done}/7, missed=${missed}, blocked=${blocked}
Spark days:\n${sparkTitles}
Proof: ${proofTexts || 'none'}
Failure patterns: ${patterns}

The user completed their 7-day Spark. Now generate their 28-day Track. Start from where Spark ended. Build on what worked. Design around what blocked them. Same arc and quality rules as track_generate_30 (4 phases, 4 weeks, rest day at position 6 each week). Week 1 consolidates Spark wins and fixes gaps. Week 4 produces a shippable artifact.
Return JSON only (goal, phases[4], days[28]).`;
}

function buildTrackContinuePrompt(previousTrack, previousDays, recap, choice) {
  const days = Array.isArray(previousDays) ? previousDays : [];
  const done = days.filter((d) => d.status === 'done' || d.status === 'rescued').length;
  const missed = days.filter((d) => d.status === 'missed').length;
  const blocked = days.filter((d) => d.status === 'blocked').length;
  const base = buildTrackPrompt({ goal: previousTrack?.goal || '', goalCategory: previousTrack?.goalCategory || 'other', dailyHours: '2-4', experienceLevel: 'intermediate', blockerHint: 'none' });
  return `${base}

Previous 28-day Track: Completed ${done}/28 | Missed ${missed} | Blocked ${blocked}
Recap: ${String(recap || 'none').slice(0, 300)}
User choice: ${choice === 'continue' ? 'continue same goal' : 'new direction with same goal'}

Continue from where the previous track left off. Do not repeat completed tasks. Design around missed-day patterns. Day 1 starts from current progress point.`;
}

function buildAgentStepsPrompt(day, track, failureMemory, user) {
  const category = String(day?.category || track?.goalCategory || 'other').trim();
  const ctx = [
    user?.currentProject  ? `Project name: ${user.currentProject}` : '',
    user?.weekGoal        ? `Week target: ${user.weekGoal}` : '',
    user?.experienceLevel ? `Experience: ${user.experienceLevel}` : '',
    user?.triedBefore     ? `Already tried: ${user.triedBefore}` : '',
  ].filter(Boolean).join('\n');

  const toolLine = ({
    build:    'Tools likely in use: VS Code, terminal, npm/yarn, git. Steps must name exact commands and file paths.',
    write:    'Tools likely in use: text editor or Google Docs. Steps must name exact filenames and word counts.',
    research: 'Tools likely in use: browser. Steps must name exact search queries or sources to check.',
    outreach: 'Tools likely in use: email or DM. Steps must include exact message templates or scripts.',
    test:     'Tools likely in use: terminal, browser DevTools. Steps must name exact test commands or checks.',
    practice: 'Steps must include exact exercises, reps, or drills with a measurable success signal.',
  })[category] || 'Steps must name the exact tool, file, or medium — never generic descriptions.';

  return `Today\'s task: ${String(day?.title || '').trim()}
${day?.successCriteria ? `Done when: ${day.successCriteria}` : ''}
${day?.why ? `Why: ${day.why}` : ''}
Goal: ${String(track?.goal || '').trim()}
Category: ${category}
Time budget: ${Number(day?.estimateMinutes) || 60} min
Recurring blockers: ${buildPatternSummary(failureMemory)}
${ctx ? `\n${ctx}` : ''}
${toolLine}

Generate 3-5 sequential micro-steps. Step 1 = lowest-friction action producing something real in 10-15 min. Hints must be actual code, commands, or templates — not generic advice.`;
}

function buildProofCheckPrompt(day, proofInput, track) {
  return `Task: ${String(day?.title || '').trim()}
Success criteria: ${String(day?.successCriteria || 'not specified').trim()}
Goal category: ${String(track?.goalCategory || 'other').trim()}
Proof submitted (${String(proofInput?.type || 'text')}): ${String(proofInput?.value || '').slice(0, 400)}

Verdict: met (clearly satisfies criteria) | partial (real progress, not fully met) | not_enough (no completion).
Be practical. Partial credit is fine if genuine progress is visible. Return JSON only.`;
}

function buildRescuePrompt(day, blockerReason, track, failureMemory, diagnosis) {
  const hasDiag = Boolean(diagnosis?.stuckAt);
  const diagCtx = hasDiag
    ? `\nWhere they got stuck: ${String(diagnosis.stuckAt).slice(0, 200)}\nWhat they tried: ${String(diagnosis.tried || 'nothing mentioned').slice(0, 200)}`
    : '';
  const instruction = hasDiag
    ? 'Answer the specific blocker directly — give the exact next action, command, or snippet that unblocks them. The rescue title should reflect what they asked. Steps must directly address where they got stuck.'
    : 'Generate a rescue action completable in 5-30 minutes — smaller and more accessible than the original.';
  return `Original task: ${String(day?.title || '').trim()}
Goal: ${String(track?.goal || '').trim()}
Blocker: ${String(blockerReason || 'not specified').trim()}${diagCtx}
Past blocker patterns: ${buildPatternSummary(failureMemory)}

${instruction} Steps must be concrete, no advice or motivation.`;
}

function buildActionKitPrompt(day, track) {
  return `Task: ${String(day?.title || '').trim()}
Goal: ${String(track?.goal || '').trim()}
Category: ${String(track?.goalCategory || 'other').trim()}

Generate an Action Kit: 3–5 items to help execute this specific task. Include: one template/framework, one definition/reference, one guiding question. Text-only, no external URLs, each item under 100 words. Usable material for immediate application, not general advice. Return JSON only.`;
}

function buildAdaptDayPrompt(track, today, tomorrow, failureMemory) {
  const dayNumber = Number(today?.dayNumber || track?.currentDayNumber || 1);
  let phaseCtx = '';
  if (Array.isArray(track?.phases) && track.phases.length) {
    const weekNum = Number(tomorrow?.weekNumber || Math.ceil((tomorrow?.dayNumber || dayNumber) / 7));
    const phase = track.phases.find((p) => p.weekNumber === weekNum);
    if (phase) phaseCtx = `\nPhase: Week ${weekNum}/${phase.name} (${phase.role})`;
  }
  return `Goal: ${String(track?.goal || '').trim()}
Today (Day ${dayNumber}) outcome: ${String(today?.status || 'pending')}
Blocker: ${String(today?.blockerText || 'none').trim()}
Tomorrow's planned task: ${String(tomorrow?.title || '').trim()}${phaseCtx}
Failure patterns: ${buildPatternSummary(failureMemory)}

Should tomorrow's task change? If yes, return adjusted title (≤80 chars) + one-sentence reason. If no, confirm original title with empty why. Return JSON only.`;
}

function buildDay7RecapPrompt(track, days, history, failureMemory) {
  const a = Array.isArray(days) ? days : [];
  const proofCount = (Array.isArray(history?.entries) ? history.entries : []).filter((e) => e.proofType).length;
  return `Goal: ${String(track?.goal || '').trim()}
Results: done=${a.filter((d) => d.status === 'done').length}, missed=${a.filter((d) => d.status === 'missed').length}, blocked=${a.filter((d) => d.status === 'blocked').length}, skipped=${a.filter((d) => d.status === 'skipped').length}, rescued=${a.filter((d) => d.status === 'rescued').length}
Failure patterns: ${buildPatternSummary(failureMemory)}
Proof submissions: ${proofCount}

Write a 2–3 sentence execution reflection. State what pattern emerged and what to carry into the next run. No motivational filler. Factual and direct.`;
}
