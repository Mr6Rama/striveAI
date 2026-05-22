// StriveAI v2 AI service.
// All v2 AI calls go through this module. UI components must not call AI directly.

// ── Network layer ──────────────────────────────────────────────────────────

async function requestJson({ action, prompt, systemCtx = '', schema, maxTokens }) {
  const res = await fetch('/api/openai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
            index: { type: 'integer' },
            text:  { type: 'string', maxLength: 140 },
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
Generate one concrete action per day that moves the user closer to their stated goal.
Each action must be completable in the user's stated daily hours.
Actions must be specific to the goal — no generic filler tasks.
Return JSON only.`;

const STEPS_CTX = `You are an execution assistant. Break one task into ordered micro-steps.
Each step must be concrete, specific, and completable in 15–45 minutes.
No motivational filler. No generic advice. Steps only.
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

export async function generateAgentSteps(day, track, failureMemory) {
  try {
    const data = await requestJson({
      action: 'agent_steps',
      prompt: buildAgentStepsPrompt(day, track, failureMemory),
      systemCtx: STEPS_CTX,
      schema: stepsSchema(),
      maxTokens: 600,
    });
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    if (!steps.length) throw new Error('empty steps');
    return steps;
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

Generate a 7-day execution track tailored to this specific person and project.
Reference their concrete situation in task titles where natural — don't repeat generic templates.
Day 1 must be the lowest-friction start possible — achievable in under 2 hours.
Each day builds directly on the previous.
Day 7 must produce a concrete artifact or shareable proof point.

Field rules:
- title: action-verb start, specific to this goal, max 80 chars.
- why: one sentence connecting this day to the goal, max 120 chars.
- successCriteria: the concrete done condition the user can verify, max 120 chars.
- estimateMinutes: one of 30 | 45 | 60 | 90 | 120.
- category: research | build | outreach | review | test | write | practice | other.
- blockerRisk: one phrase for the most likely obstacle on this day, max 100 chars.

Bad titles: "Research market", "Work on project", "Make progress"
Good titles: "Interview 3 people about their biggest frustration with this problem",
             "Write the first draft of your outreach message (100 words max)",
             "Build the core feature and run it end-to-end"`;
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

function buildAgentStepsPrompt(day, track, failureMemory) {
  const title    = String(day?.title || '').trim();
  const goal     = String(track?.goal || '').trim();
  const category = String(track?.goalCategory || 'other').trim();
  const patterns = buildPatternSummary(failureMemory);

  return `Today's task: ${title}
Goal: ${goal}
Category: ${category}
Failure patterns so far: ${patterns}

Break this task into 3–5 sequential micro-steps.
Each step: one sentence, action-verb start, specific output expected.
Steps must be completable in 15–45 minutes each.
No summaries or introductions — steps only.`;
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

function fallbackTrack(input) {
  const goal     = String(input?.goal || 'your goal').trim();
  const category = String(input?.goalCategory || 'other').trim();
  const titles   = FALLBACK_TITLES[category] || ['Define your goal clearly and write a done condition', 'Identify the 3 most important sub-tasks', 'Complete the first sub-task', 'Review progress and set the next priority', 'Complete the second sub-task', 'Adjust scope so Day 7 is achievable', 'Deliver one tangible output for the week'];
  return {
    goal,
    days: titles.map((title, i) => ({
      dayNumber:       i + 1,
      title,
      why:             `Advances progress toward: ${goal.slice(0, 60)}`,
      successCriteria: 'A concrete output exists that you can point to',
      estimateMinutes: 60,
      category:        'other',
      blockerRisk:     '',
      status:          'pending',
      date:            '',
    })),
  };
}

function fallbackSteps(day) {
  const title = String(day?.title || 'your task').slice(0, 60);
  return [
    { index: 0, text: `Open your workspace and re-read the task: "${title}"` },
    { index: 1, text: 'Write down the single most important sub-task to complete first.' },
    { index: 2, text: 'Complete that sub-task and record the output before stopping.' },
  ];
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
