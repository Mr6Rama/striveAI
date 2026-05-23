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

const DAY_ROLES = ['setup', 'build', 'validate', 'ship', 'review', 'recover'];

const DAY_ITEM_SCHEMA = {
  type: 'object',
  required: ['dayNumber', 'title', 'why', 'successCriteria', 'estimateMinutes', 'category', 'role'],
  properties: {
    dayNumber:       { type: 'integer', minimum: 1, maximum: 7 },
    title:           { type: 'string', maxLength: 90 },
    why:             { type: 'string', maxLength: 120 },
    successCriteria: { type: 'string', maxLength: 140 },
    estimateMinutes: { type: 'integer', enum: [30, 45, 60, 90, 120] },
    category:        { type: 'string' },
    role:            { type: 'string', enum: DAY_ROLES },
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
          required: ['index', 'text', 'output'],
          properties: {
            index:  { type: 'integer' },
            text:   { type: 'string', maxLength: 160 },
            output: { type: 'string', maxLength: 120 },
            hint:   { type: 'string', maxLength: 200 },
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

const TRACK_CTX = `You are a 7-day execution coach for one specific person.
Your job: produce 7 concrete actions, each one tailored to the user's actual project and stated week-outcome.

CORE RULES:
- Each task title must reference the user's specific project, output, or artifact. NEVER use placeholders like "your plan", "your goal", "your project".
- Banned verbs in titles (these are non-actions): define, plan, work on, think about, decide, consider, explore, research (without an object), prepare, set up (without a specific thing).
- Required verb pattern: a physical or digital action ON a named object. Examples: "Write", "Send", "Call", "Code", "Draft", "Email", "Build the X", "Pick 3 Y", "Record", "Publish".
- Each task must produce a checkable artifact: a file, a message sent, a list written, a metric recorded, a draft completed.
- The 7 days must form a story arc. Use role: setup -> build -> build -> validate -> build/ship -> ship -> review.
- Day 1 must be the smallest possible real action (under 90 minutes). Day 7 must produce a shareable artifact.

TONE: direct, concrete, like a coach who knows them. No motivational filler. No "remember to take breaks".
OUTPUT: JSON only.`;

const STEPS_CTX = `You are inside a 7-day execution coach helping the user do today's task right now.
Your job: break today's task into 3-5 micro-steps the user can do in this session.

CORE RULES:
- Banned step types (never produce these):
  * "Open your workspace and re-read the task" - this is meta, not work
  * "Decide what's most important" / "Choose your approach" - this is planning a plan
  * "Think about X" / "Reflect on Y" - the user came here to DO, not think
  * "Set up your environment" without naming what
- Each step must be a physical action on a named object. Use verbs like: Write, Type, Open <specific file/URL>, Copy, Send, Run, Save, Add, Click, Record, Paste.
- Each step must produce a visible OUTPUT (a sentence, a file, a number, a list) that the user can paste back as proof.
- Step 1 must be the lowest-friction concrete action possible — getting the user moving in under 5 minutes.
- Steps must reference the actual task content, not abstract it.
- Do not send the user to "their workspace" without a specific reason — assume the user is already where they need to be.

TONE: short, declarative. Like a teammate sitting next to them.
OUTPUT: JSON only.`;

const RESCUE_CTX = `The user is blocked on today's task. Generate a smaller version they can actually finish in 5-30 minutes.

CORE RULES:
- The rescue must be a meaningfully smaller version of the same task — not unrelated busywork.
- Each step must be a concrete action with a named object. No meta-instructions.
- Banned: "take a break", "come back later", "rest" - the user is HERE, give them something to do.
- The reframeNote should help them see this rescue as real progress, not a consolation prize.

OUTPUT: JSON only.`;

// ── Exported functions ─────────────────────────────────────────────────────

export async function generateExecutionTrack(onboardingInput) {
  try {
    const data = await requestJson({
      action: 'track_generate',
      prompt: buildTrackPrompt(onboardingInput),
      systemCtx: TRACK_CTX,
      schema: trackSchema(),
      maxTokens: 2000,
    });
    if (!Array.isArray(data?.days) || data.days.length < 7) throw new Error('invalid track');
    // Backfill role if model omitted it (defensive — schema requires it but be safe).
    data.days = data.days.map((d, i) => ({ ...d, role: d.role || defaultRoleForDay(i + 1) }));
    return data;
  } catch (_e) {
    return fallbackTrack(onboardingInput);
  }
}

function defaultRoleForDay(n) {
  return ({ 1: 'setup', 2: 'build', 3: 'build', 4: 'validate', 5: 'build', 6: 'build', 7: 'ship' })[n] || 'build';
}

export async function generateAgentSteps(day, track, failureMemory, user) {
  try {
    const data = await requestJson({
      action: 'agent_steps',
      prompt: buildAgentStepsPrompt(day, track, failureMemory, user),
      systemCtx: STEPS_CTX,
      schema: stepsSchema(),
      maxTokens: 900,
    });
    const steps = Array.isArray(data?.steps) ? data.steps : [];
    if (!steps.length) throw new Error('empty steps');
    return steps;
  } catch (_e) {
    return fallbackSteps(day, user);
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

  // The "concrete object" the model must reference in titles. Falls back to goal.
  const concreteObject = project || weekGoal || goal;

  const userCtx = `
USER CONTEXT:
- Stated goal: ${goal}
- Category: ${category}
- Daily time available: ${hours} hours
- Experience level: ${experience}
- Biggest blocker: ${blocker}
${project  ? `- What they're working on right now: ${project}`              : '- (No specific project named)'}
${weekGoal ? `- Concrete outcome they want by Day 7: ${weekGoal}`           : '- (No specific 7-day outcome named)'}
${why      ? `- Why it matters to them: ${why}`                             : ''}
${tried    ? `- What they have already tried (don't repeat these): ${tried}`: ''}`.trim();

  return `${userCtx}

TASK: Generate exactly 7 days that move this specific person from where they are to ${weekGoal || 'a concrete artifact'}.

FORMAT RULES:
- title (max 90 chars): MUST reference "${concreteObject}" or a specific component of it. Action-verb start.
  BAD:  "Define your workout plan: type, duration, and how many sessions"   (this is planning a plan)
        "Research market opportunities"                                      (no object)
        "Work on your project"                                               (vague)
        "Set up your environment"                                            (set up what?)
  GOOD: "Write the hero copy for your ${concreteObject || 'landing page'} (3 short lines)"
        "Send 5 cold DMs about ${weekGoal || 'your idea'} to people in your niche"
        "Pick 3 exercises for ${concreteObject || 'your routine'}: 1 push, 1 pull, 1 legs. Write reps."
        "Build the auth screen for ${concreteObject || 'your app'} and push to your repo"
- why (max 120 chars): one sentence tying this day to ${weekGoal || 'their goal'}. Direct, no filler.
- successCriteria (max 140 chars): "You're done when [artifact] exists with [property]". Concrete and verifiable in 1 glance.
- estimateMinutes: one of 30 | 45 | 60 | 90 | 120. Must fit in their daily ${hours}h.
- category: one of: research | build | outreach | review | test | write | practice | other.
- role: one of: setup | build | validate | ship | review | recover. Together the 7 roles must form an arc:
  Day 1: setup
  Days 2-3: build (mostly)
  Day 4: validate (get feedback / test / interview / measure)
  Days 5-6: build OR ship
  Day 7: ship (must produce a shareable artifact)
  If the user's biggest blocker is "motivation" or "overwhelmed", insert ONE "recover" day at day 4 or 5.
- blockerRisk (max 100 chars): the most likely thing that could derail this specific day.

DAY 1 SPECIAL RULES:
- Must be completable in under 90 minutes regardless of stated hours.
- Must NOT require any new tool, account, or external thing to be set up first.
- Should feel like "of course I can do that" — anchor the week with a fast win.

DAY 7 SPECIAL RULES:
- Must produce a tangible, shareable artifact: a published post, a working demo, a sent message, a recorded video, a finished draft.
- Title must contain a verb of completion: "Ship", "Publish", "Send", "Record", "Submit", "Post".

DO NOT REPEAT what the user said they've already tried.

Return JSON only with the trackSchema shape: { goal, days: [...] }.`;
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
  const title           = String(day?.title || '').trim();
  const why             = String(day?.why || '').trim();
  const successCriteria = String(day?.successCriteria || '').trim();
  const estimate        = Number(day?.estimateMinutes || 60);
  const role            = String(day?.role || '').trim();
  const goal            = String(track?.goal || '').trim();
  const category        = String(track?.goalCategory || 'other').trim();
  const project         = String(user?.currentProject || '').trim();
  const weekGoal        = String(user?.weekGoal || '').trim();
  const patterns        = buildPatternSummary(failureMemory);

  return `TODAY'S TASK: ${title}
Why: ${why}
Done when: ${successCriteria}
Role: ${role || 'work day'}
Time budget: ${estimate} minutes
Goal: ${goal}
Category: ${category}
${project  ? `User project: ${project}`   : ''}
${weekGoal ? `Day 7 outcome: ${weekGoal}` : ''}
Failure patterns so far: ${patterns}

TASK: Generate 3-5 sequential micro-steps that walk this user through completing TODAY'S TASK right now, in one session.

BANNED STEP PATTERNS (never produce):
- "Open your workspace and re-read the task"             (meta, not work)
- "Decide what's the most important thing"               (planning a plan)
- "Think about how you'll approach this"                 (thinking, not doing)
- "Set up your environment"                              (set up WHAT?)
- "Make a plan for X"                                    (plan inside a plan)
- "Reflect on Y"                                         (the user came to DO)

GOOD STEPS (each is a physical action with an output):
- "Type the first headline for ${project || 'your landing page'} (one sentence, under 10 words)."
- "Open the doc and write 3 bullet points describing what the user wants."
- "Send this exact message to the first 3 people on your list: 'Quick question — would you ever pay for X?'"
- "Run \`npm create vite@latest myapp -- --template react\` in your terminal."

STEP STRUCTURE (per item):
- text (max 160 chars): one declarative sentence. Action verb FIRST. Names a specific object.
- output (max 120 chars): what should physically exist after this step. Examples: "A 1-sentence headline written in your doc", "A list of 3 names with emails", "The first message sent".
- hint (max 200 chars, OPTIONAL): a concrete template, formula, or example the user can copy. Only include when genuinely useful. Examples:
  * "Template: '[Problem] is annoying because [reason]. [Your name] makes [solution].'"
  * "Try: 'Hey [name], saw you posted about [topic]. Quick question — [your question]?'"
  * "Formula: hero copy = ['who it's for'] + ['what changes'] + ['proof']"

STEP 1 MUST be the lowest-friction concrete action that gets the user moving in under 5 minutes.
Each step must be completable in ${Math.max(10, Math.round(estimate / 4))}-${Math.max(20, Math.round(estimate / 2))} minutes.

Return JSON only.`;
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

// Specific, action-oriented fallbacks. Each item is [title, successCriteria, role, minutes, category].
// Used when the AI request fails — these must be just as concrete as AI output.
const FALLBACK_DAYS = {
  project: [
    ['Write a 3-sentence description of what you are building and who it is for', 'You have 3 sentences saved in a doc that name the user and the value', 'setup', 30, 'write'],
    ['List the 3 essential features and cross out everything else', 'A list of exactly 3 must-have features exists', 'setup', 45, 'review'],
    ['Initialise the repo, push a placeholder commit, and write the README first paragraph', 'Repo is created and the README opens with a real description', 'build', 60, 'build'],
    ['Build the most important feature end-to-end (rough is fine)', 'You can run the core feature once and see it work', 'build', 120, 'build'],
    ['Show the rough version to 2 people and write down their first reactions verbatim', 'Two sets of verbatim quotes exist in a notes doc', 'validate', 60, 'outreach'],
    ['Fix the single biggest issue from the feedback', 'The fix is committed and the original problem no longer happens', 'build', 90, 'build'],
    ['Record a 60-second screen demo or capture 3 clean screenshots, then post one', 'A demo or screenshot pack is published or saved as an artifact', 'ship', 60, 'ship'],
  ],
  startup: [
    ['Write your value proposition in this exact format: "For [who], who [problem], we offer [thing] that [outcome]."', 'One sentence in that exact format is saved', 'setup', 30, 'write'],
    ['List 10 specific people who match "who" and mark the 3 you can reach this week', 'A list of 10 names with 3 marked exists', 'setup', 45, 'research'],
    ['Send a real DM/email to each of the 3 marked people asking for 15 minutes', '3 messages have been sent (not drafted)', 'outreach', 45, 'outreach'],
    ['Run the first call you got, follow the script, and log 5 verbatim quotes', 'A doc with 5 quotes from the call exists', 'validate', 60, 'outreach'],
    ['Build a rough prototype of the core flow (a Figma frame or 1 working screen)', 'A clickable or visual prototype of the core flow exists', 'build', 120, 'build'],
    ['Show the prototype to the 2 most relevant people from your list and capture reactions', 'Reactions from 2 people are captured in writing', 'validate', 45, 'outreach'],
    ['Write a one-page summary of problem, solution, evidence and post it (LinkedIn, blog, anywhere)', 'A one-pager is published with a link you can share', 'ship', 60, 'ship'],
  ],
  content: [
    ['Pick the topic of your first piece and write a 2-sentence promise to the reader', 'Topic and promise are written down', 'setup', 30, 'write'],
    ['Draft the full piece (don\'t edit — just get it out)', 'A complete first draft exists, however ugly', 'build', 90, 'write'],
    ['Cut every sentence that doesn\'t serve the reader\'s outcome', 'The piece is 30%+ shorter and tighter', 'build', 60, 'write'],
    ['Read it aloud once and fix everything that sounds wrong', 'No clunky sentences remain', 'validate', 30, 'review'],
    ['Find 3 high-performing posts in your niche and steal one structural pattern', 'You have a structural change written into your piece', 'build', 45, 'research'],
    ['Apply final formatting (headings, line breaks, one image or pull quote)', 'The piece looks like a finished product on the page', 'build', 45, 'build'],
    ['Publish and share it in 2 specific places (and DM 1 person you respect)', 'The post is live and the DM is sent', 'ship', 45, 'ship'],
  ],
  skill: [
    ['Pick one tiny project (1-2 hour scope) you will build using this skill by Day 7', 'A 1-line project description is written down', 'setup', 30, 'write'],
    ['Complete the first tutorial or chapter and write 3 takeaways in your own words', '3 takeaways are written in a notes doc', 'build', 60, 'practice'],
    ['Build one exercise from scratch without copying — close every tutorial first', 'The exercise runs and you closed all reference tabs', 'build', 60, 'practice'],
    ['Find the concept you struggled with most and watch / read one resource to close it', 'You can explain that concept in 3 sentences', 'validate', 45, 'practice'],
    ['Build a small exercise that combines two concepts you have learned', 'The combined exercise runs', 'build', 60, 'practice'],
    ['Write a 200-word explanation of the core concept as if teaching a friend', 'A 200-word explainer exists', 'review', 45, 'write'],
    ['Complete your Day 1 mini-project and post a screenshot or demo of it working', 'The mini-project works and a proof artifact is shared', 'ship', 90, 'ship'],
  ],
  career: [
    ['Write your target-role summary (3 lines) and pick your single strongest qualification', 'Summary + qualification are written', 'setup', 30, 'write'],
    ['Rewrite your resume bullets — each line one outcome, no soft verbs', 'Resume bullets are one line, outcome-focused', 'build', 90, 'write'],
    ['Find 5 job postings where you meet 70%+ of the listed requirements', 'A list of 5 postings exists with links', 'research', 45, 'research'],
    ['Send 1 personalised cold message to someone at your target company (LinkedIn or email)', 'One real personalised message has been sent', 'outreach', 45, 'outreach'],
    ['Apply to 2 of your saved postings with customised cover letters', '2 applications are submitted', 'ship', 90, 'outreach'],
    ['Write out word-for-word answers to the 3 most common interview questions for this role', '3 written answers exist', 'build', 45, 'write'],
    ['Do a 15-minute mock interview, record yourself, and watch 1 thing you want to change', 'A recording + 1 change-note exists', 'ship', 45, 'practice'],
  ],
  study: [
    ['List the 3 most important concepts to learn this week and pick concept 1', 'A list of 3 concepts is written, with one circled', 'setup', 30, 'review'],
    ['Study concept 1 and write a 100-word summary in your own words (no copy-paste)', 'A 100-word summary exists', 'build', 60, 'practice'],
    ['Complete 3 practice problems on concept 1, no notes', '3 attempts with answers exist', 'build', 60, 'practice'],
    ['Study concept 2 and write how it connects to concept 1 (3-5 sentences)', 'A connection note exists', 'build', 60, 'practice'],
    ['Complete 5 mixed practice problems covering concept 1 and 2', '5 attempts exist with answers', 'validate', 60, 'practice'],
    ['Study concept 3 and write a 1-page summary tying all 3 concepts together', 'A 1-page summary exists', 'build', 90, 'write'],
    ['Do a 30-minute timed recall without notes, then list 3 weak spots to revisit', 'A timed recall + weak-spot list exists', 'review', 45, 'practice'],
  ],
  habit: [
    ['Write the habit in this exact format: "After [trigger], I will [action] for [time]."', 'One sentence in that format is written', 'setup', 15, 'write'],
    ['Do the habit today and record start/end time', 'A log entry with times exists', 'build', 30, 'practice'],
    ['Block the habit time in your calendar every day this week', 'Calendar blocks for the next 5 days are visible', 'setup', 15, 'build'],
    ['Do the habit and rate difficulty 1-5 in the log', 'A log entry with a difficulty rating exists', 'build', 30, 'practice'],
    ['Remove one friction point — prepare the environment in advance', 'A specific friction-removal step is done (e.g. clothes laid out)', 'build', 30, 'build'],
    ['Do the habit and write 1 sentence: did the prep help?', 'A reflection sentence exists', 'validate', 30, 'practice'],
    ['Write a 1-paragraph reflection on what worked and one specific tweak for next week', 'A reflection paragraph exists', 'review', 30, 'write'],
  ],
  fitness: [
    ['Pick 3 exercises (1 push, 1 pull, 1 legs), write the rep scheme, and pick 3 specific days', 'Plan with 3 exercises × reps × 3 days exists', 'setup', 30, 'write'],
    ['Do the first workout and record your key metric (reps, weight, or time)', 'A log entry with the metric exists', 'build', 60, 'practice'],
    ['Identify the one technique issue you noticed and look up the specific fix', 'A note exists describing the issue and the fix', 'build', 30, 'research'],
    ['Do the second workout applying the technique fix', 'A log entry exists with the fix applied', 'build', 60, 'practice'],
    ['Add one measurable progressive overload (1 more rep, 5% more weight, or 30 more seconds)', 'A specific overload number is written for next session', 'validate', 30, 'practice'],
    ['Light movement or rest and prepare gear / playlist / scheduling for the final workout', 'Prep is done', 'recover', 30, 'practice'],
    ['Final workout: record metric and compare to Day 2 — write the % change', 'A side-by-side comparison with % change exists', 'ship', 60, 'practice'],
  ],
};

const GENERIC_FALLBACK = [
  ['Write a 2-sentence description of what "done" looks like by Day 7', 'A 2-sentence outcome description exists', 'setup', 30, 'write'],
  ['List the 3 smallest concrete sub-tasks that will get you there', 'A list of 3 concrete sub-tasks exists', 'setup', 45, 'review'],
  ['Complete sub-task 1 and write a 1-line note on what you produced', 'Sub-task 1 is done and noted', 'build', 60, 'build'],
  ['Show your progress so far to 1 person and capture their reaction', 'A reaction is captured in writing', 'validate', 30, 'outreach'],
  ['Complete sub-task 2 and write a 1-line note on what you produced', 'Sub-task 2 is done and noted', 'build', 60, 'build'],
  ['Trim scope to make sure Day 7 will produce a real artifact', 'Day 7 plan is concrete and achievable', 'review', 45, 'review'],
  ['Deliver one tangible output for the week — file, post, recording, or message sent', 'A shareable artifact exists', 'ship', 60, 'ship'],
];

function fallbackTrack(input) {
  const goal     = String(input?.goal || 'your goal').trim();
  const category = String(input?.goalCategory || 'other').trim();
  const rows     = FALLBACK_DAYS[category] || GENERIC_FALLBACK;
  return {
    goal,
    days: rows.map(([title, successCriteria, role, estimateMinutes, cat], i) => ({
      dayNumber:       i + 1,
      title,
      why:             `Advances toward: ${goal.slice(0, 60)}`,
      successCriteria,
      estimateMinutes,
      category:        cat,
      role,
      blockerRisk:     '',
      status:          'pending',
      date:            '',
    })),
  };
}

function fallbackSteps(day, user) {
  const title    = String(day?.title || 'your task').trim();
  const success  = String(day?.successCriteria || 'a concrete output').trim();
  const project  = String(user?.currentProject || '').trim();
  const subject  = project ? `for ${project}` : 'for this task';

  return [
    {
      index: 0,
      text: `Open the doc or file you will work in and type the title of today's task at the top.`,
      output: `Your doc is open with the task title at the top.`,
    },
    {
      index: 1,
      text: `Write 2-3 bullet points naming the very first sub-pieces of this task ${subject}.`,
      output: `2-3 concrete sub-pieces are written.`,
      hint: `Don't plan the whole task — just name the next 2-3 pieces. If the task is "${title.slice(0, 60)}", what is the smallest 15-minute slice?`,
    },
    {
      index: 2,
      text: `Do the first bullet completely and paste the result back here.`,
      output: `The first bullet produced a real artifact (a sentence, a file, a number).`,
    },
    {
      index: 3,
      text: `Check against "${success}" — if not met, do the next bullet; if met, stop.`,
      output: `Either the next bullet is done OR the success criteria is fully met.`,
    },
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
