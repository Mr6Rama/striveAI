require('dotenv').config();

const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const {
  createRequestTrace,
  logDebug,
  logError,
  logInfo,
  logWarn,
  normalizeError,
} = require('./utils/logger');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const MAX_EXECUTION_STYLE_CHARS = 300;
const frontendDir = path.join(__dirname, '..', 'frontend');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID || 'YOUR_PAYPAL_CLIENT_ID_HERE';
const PLAN_PRO = process.env.PAYPAL_PLAN_PRO || 'YOUR_PAYPAL_PLAN_ID_PRO_HERE';
const PLAN_TEAM = process.env.PAYPAL_PLAN_TEAM || 'YOUR_PAYPAL_PLAN_ID_TEAM_HERE';
const PAYPAL_SDK_URL = process.env.PAYPAL_SDK_URL || 'https://www.paypal.com/sdk/js';
const FIREBASE_WEB_CONFIG = {
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || '',
  measurementId: process.env.FIREBASE_MEASUREMENT_ID || '',
};
const FIREBASE_REQUIRED_FIELDS = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
const FIREBASE_CONFIGURED = FIREBASE_REQUIRED_FIELDS.every((field) => Boolean(FIREBASE_WEB_CONFIG[field]));
// ── Firebase Admin ────────────────────────────────────────────────────────────
// Lazily initialised once from FIREBASE_SERVICE_ACCOUNT_JSON.
// If the env var is absent the server still boots; protected routes return 503.

let _adminApp = null;
let _adminInitError = null;

function getFirebaseAdmin() {
  if (_adminApp) return _adminApp;
  if (_adminInitError) return null;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    _adminInitError = 'FIREBASE_SERVICE_ACCOUNT_JSON env var is not set';
    return null;
  }
  try {
    // Restore escaped newlines that some env providers collapse.
    const fixed = raw.replace(/\\n/g, '\n');
    const credential = JSON.parse(fixed);
    const admin = require('firebase-admin');
    _adminApp = admin.initializeApp({ credential: admin.credential.cert(credential) });
    return _adminApp;
  } catch (err) {
    _adminInitError = `Firebase Admin init failed: ${err.message}`;
    return null;
  }
}

async function verifyFirebaseIdToken(req) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing Bearer token'), { status: 401 });
  }
  const token = header.slice(7);
  const adminApp = getFirebaseAdmin();
  if (!adminApp) {
    throw Object.assign(
      new Error(_adminInitError || 'Firebase Admin not initialised'),
      { status: 503, configError: true }
    );
  }
  const admin = require('firebase-admin');
  const decoded = await admin.auth().verifyIdToken(token);
  return decoded;
}

async function requireFirebaseUser(req, res, next) {
  try {
    req.firebaseUser = await verifyFirebaseIdToken(req);
    next();
  } catch (err) {
    const status = err.status || 401;
    const body = err.configError
      ? { error: 'Firebase Admin is not configured on this server', detail: err.message }
      : { error: 'Unauthorized' };
    return res.status(status).json(body);
  }
}

// Log admin init status at startup (without printing credentials).
(function logAdminStatus() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    console.warn('[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON not set — authenticated routes will return 503');
  }
})();

// ── End Firebase Admin ────────────────────────────────────────────────────────

const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim() || 'gpt-4o-mini';
const OPENAI_ALLOWED_RESPONSE_MIME_TYPES = new Set(['application/json', 'text/plain']);
function usesCompletionTokenLimit(model) {
  const normalizedModel = String(model || '').trim().toLowerCase();
  return normalizedModel.startsWith('gpt-5') || /^o\d/.test(normalizedModel);
}

function getOpenAITokenLimitField(model) {
  return usesCompletionTokenLimit(model) ? 'max_completion_tokens' : 'max_tokens';
}

const OPENAI_ALLOWED_CONFIG_KEYS = new Set([
  'maxOutputTokens',
  'temperature',
  'topP',
  'reasoningEffort',
  'responseMimeType',
  'responseSchema',
  'responseJsonSchema',
]);
const AI_ACTIONS = new Set([
  // v1 actions — kept for compatibility
  'roadmap', 'tasks', 'tasks_skeleton', 'task_detail', 'task_audit', 'goals_review', 'note_process', 'session_review', 'chat', 'goal_complete',
  // v2 actions
  'track_generate', 'track_continue', 'agent_steps', 'agent_hint', 'rescue_action', 'action_kit', 'day7_recap', 'adapt_day', 'v2_proof_check',
]);
const ACTION_AI_CONFIG = Object.freeze({
  default: {
    model: OPENAI_MODEL,
    maxCompletionTokens: 1000,
    reasoningEffort: 'minimal',
    temperature: 0.7,
    topP: 1,
    contextLimits: { promptChars: 3600, systemChars: 900, totalChars: 4200 },
  },
  roadmap: {
    model: 'gpt-5-mini',
    maxCompletionTokens: 1200,
    reasoningEffort: 'minimal',
    temperature: 1,
    topP: 1,
    contextLimits: { promptChars: 6000, systemChars: 1600, totalChars: 7000 },
  },
  tasks: {
    model: 'gpt-5-mini',
    maxCompletionTokens: 1500,
    reasoningEffort: 'minimal',
    temperature: 1,
    topP: 1,
    contextLimits: { promptChars: 5000, systemChars: 1400, totalChars: 6000 },
  },
  tasks_skeleton: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 500,
    reasoningEffort: 'minimal',
    temperature: 1,
    topP: 1,
    contextLimits: { promptChars: 2600, systemChars: 900, totalChars: 3400 },
  },
  task_detail: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 250,
    reasoningEffort: 'minimal',
    temperature: 1,
    topP: 1,
    contextLimits: { promptChars: 1800, systemChars: 700, totalChars: 2500 },
  },
  task_audit: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 500,
    reasoningEffort: 'minimal',
    temperature: 1,
    topP: 1,
    contextLimits: { promptChars: 3200, systemChars: 1000, totalChars: 3900 },
  },
  goals_review: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 500,
    reasoningEffort: 'minimal',
    temperature: 1,
    topP: 1,
    contextLimits: { promptChars: 2200, systemChars: 800, totalChars: 3000 },
  },
  note_process: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 500,
    reasoningEffort: 'minimal',
    temperature: 1,
    topP: 1,
    contextLimits: { promptChars: 3000, systemChars: 900, totalChars: 3600 },
  },
  session_review: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 700,
    reasoningEffort: 'minimal',
    temperature: 1,
    topP: 1,
    contextLimits: { promptChars: 3600, systemChars: 1000, totalChars: 4200 },
  },
  chat: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 500,
    reasoningEffort: 'minimal',
    temperature: 1,
    topP: 1,
    contextLimits: { promptChars: 2200, systemChars: 700, totalChars: 2800 },
  },
  goal_complete: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 500,
    reasoningEffort: 'minimal',
    temperature: 1,
    topP: 1,
    contextLimits: { promptChars: 2800, systemChars: 900, totalChars: 3400 },
  },
  // ── v2 actions ────────────────────────────────────────────────────────────
  track_generate: {
    model: 'gpt-5-mini',
    maxCompletionTokens: 1400,
    reasoningEffort: 'minimal',
    temperature: 0.9,
    topP: 1,
    contextLimits: { promptChars: 5000, systemChars: 1400, totalChars: 6000 },
  },
  track_continue: {
    model: 'gpt-5-mini',
    maxCompletionTokens: 1400,
    reasoningEffort: 'minimal',
    temperature: 0.9,
    topP: 1,
    contextLimits: { promptChars: 5000, systemChars: 1400, totalChars: 6000 },
  },
  agent_steps: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 600,
    reasoningEffort: 'minimal',
    temperature: 0.8,
    topP: 1,
    contextLimits: { promptChars: 2000, systemChars: 800, totalChars: 2600 },
  },
  agent_hint: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 200,
    reasoningEffort: 'minimal',
    temperature: 0.7,
    topP: 1,
    contextLimits: { promptChars: 1200, systemChars: 500, totalChars: 1600 },
  },
  rescue_action: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 500,
    reasoningEffort: 'minimal',
    temperature: 0.8,
    topP: 1,
    contextLimits: { promptChars: 2200, systemChars: 800, totalChars: 2800 },
  },
  action_kit: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 600,
    reasoningEffort: 'minimal',
    temperature: 0.7,
    topP: 1,
    contextLimits: { promptChars: 1800, systemChars: 700, totalChars: 2400 },
  },
  day7_recap: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 350,
    reasoningEffort: 'minimal',
    temperature: 0.8,
    topP: 1,
    contextLimits: { promptChars: 2400, systemChars: 700, totalChars: 2900 },
  },
  adapt_day: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 300,
    reasoningEffort: 'minimal',
    temperature: 0.8,
    topP: 1,
    contextLimits: { promptChars: 2000, systemChars: 700, totalChars: 2600 },
  },
  v2_proof_check: {
    model: 'gpt-5-nano',
    maxCompletionTokens: 250,
    reasoningEffort: 'minimal',
    temperature: 0.4,
    topP: 1,
    contextLimits: { promptChars: 1500, systemChars: 600, totalChars: 2000 },
  },
});
const OPENAI_RESPONSE_CACHE_TTL_MS = 15 * 60 * 1000;
const OPENAI_RESPONSE_CACHE_MAX_SIZE = 200;
const openAIResponseCache = new Map();
const TASK_GENERATION_ACTIONS = new Set(['tasks', 'tasks_skeleton', 'task_detail']);
// v2 actions that return JSON (eligible for deterministic fallback)
const V2_JSON_ACTIONS = new Set(['track_generate', 'track_continue', 'agent_steps', 'rescue_action', 'action_kit', 'adapt_day', 'v2_proof_check']);
// v2 actions that return plain text
const V2_PLAINTEXT_ACTIONS = new Set(['agent_hint', 'day7_recap']);

// ── v2 fallback data ───────────────────────────────────────────────────────
// One concrete 7-day template per GoalCategory.
// Tuple: [title, dayCategory, estimateMinutes, why, successCriteria]
const V2_TRACK_FALLBACK_DAYS = Object.freeze({
  project: [
    ['Describe what you are building and who it is for in one page', 'write', 60, 'Clarity before code prevents wasted effort', 'Document exists covering problem, user, and proposed solution'],
    ['List the 5 most important features and cut to 3', 'review', 45, 'Smaller scope ships faster', 'Exactly 3 features listed with one-line rationale each'],
    ['Set up the project repo and write a README with problem and solution', 'build', 90, 'Foundation before building', 'Repo created, README covers problem, solution, and setup steps'],
    ['Build the first working feature end-to-end', 'build', 120, 'A working piece proves the idea', 'Feature runs without errors and matches the README description'],
    ['Test the feature with 2 people. Note what they get stuck on', 'test', 90, 'Real feedback before over-building', 'Two sessions done, 3+ observations noted per session'],
    ['Fix the top 2 issues found in testing', 'build', 90, 'Tested feedback applied immediately', 'Both issues resolved and re-tested'],
    ['Record a 2-minute demo or capture screenshots of the working feature', 'write', 60, 'Proof of work for accountability and portfolio', 'Demo or 4+ screenshots saved and shareable'],
  ],
  startup: [
    ['Write your one-sentence value proposition: who, what, why now', 'write', 60, 'Forces clarity before any other work', 'Value proposition fits one sentence without jargon'],
    ['List 10 potential users. Mark who you can reach in 48 hours', 'research', 45, 'Real users beat hypothetical ones', '10 names with contact info, 3+ marked reachable'],
    ['Send 5 direct messages asking for a 20-minute call this week', 'outreach', 60, 'Evidence starts with conversations', '5 messages sent, personalised to each recipient'],
    ['Do 3 user interviews. Write down the exact words they use', 'research', 120, 'Exact language reveals real problems', '3 calls completed, verbatim quotes documented'],
    ['Sketch a prototype that addresses the top problem you heard', 'build', 120, 'Showing beats telling', 'Prototype or wireframe covers the core user flow'],
    ['Show the prototype to 2 interviewees. Record their reactions', 'test', 90, 'You need honest reactions, not polite approval', '2 sessions done, specific objections or positive signals noted'],
    ['Write a one-page summary: problem, evidence, solution, next step', 'write', 60, 'Forces synthesis of everything learned', 'One-pager covers all four sections in under 400 words'],
  ],
  content: [
    ['Pick one platform and format. Write your first draft post or script', 'write', 60, 'First draft beats a perfect plan', 'Draft is complete — rough is fine'],
    ['Edit the draft. Remove everything not directly useful to the reader', 'review', 45, 'Shorter content performs better', 'Edited draft is 20%+ shorter with no loss of value'],
    ['Publish the first piece. Screenshot analytics immediately after', 'other', 30, 'Publishing starts the feedback loop', 'Post is live and initial stats are screenshotted'],
    ['Batch-write two more pieces using the same format', 'write', 90, 'Consistency requires batching', 'Two complete drafts ready to publish'],
    ['Study 3 top posts in your niche. Write the structure each one uses', 'research', 60, 'Model what works before reinventing', 'Structure template written for at least 2 of the 3 posts'],
    ['Apply the best structure to one draft and publish it', 'write', 60, 'Apply the learning immediately', 'Post is live using the studied structure'],
    ['Review 7-day numbers. Write one paragraph on what worked', 'review', 45, 'Reflection compounds improvement', 'Written analysis covers reach, engagement, and one clear lesson'],
  ],
  skill: [
    ['Find one concrete project you will build to practice this skill this week', 'research', 45, 'A real project beats drills', 'Project defined with scope completable in 5 days'],
    ['Complete the first tutorial or chapter. Write down 3 things you learned', 'practice', 90, 'Active notes beat passive reading', 'Notes cover 3 distinct concepts from the session'],
    ['Apply what you learned: build one small exercise from scratch', 'practice', 120, 'Building reveals what you missed', 'Exercise runs without copying from the tutorial'],
    ['Identify the specific gap that slowed you. Look up only that', 'research', 60, 'Targeted research beats random reading', 'One specific question answered and source noted'],
    ['Complete an exercise combining two concepts you have learned', 'practice', 120, 'Combining concepts builds real understanding', 'Combined exercise works without referencing prior work'],
    ['Teach back: write a 200-word explanation of the core concept', 'write', 45, 'Teaching reveals exactly what you do not know', '200-word explanation written in plain language'],
    ['Build a small demo or write a summary of everything learned this week', 'build', 90, 'A tangible output closes the loop', 'Demo or summary covers every major concept from the week'],
  ],
  career: [
    ['Write a one-paragraph summary of your target role and top qualification', 'write', 60, 'Clarity about what you want sharpens your pitch', 'Paragraph covers target role, company type, and one key qualification'],
    ['Update your resume. Cut every bullet to one line', 'write', 90, 'Concise beats comprehensive', 'Resume updated with every bullet trimmed to one line'],
    ['Find 5 matching job postings. Save ones where you meet 70%+ of requirements', 'research', 60, 'Apply where you are actually qualified', '5 postings found, at least 2 saved for application'],
    ['Write a cold outreach message to one person at a target company', 'outreach', 60, 'Warm connections beat cold applications', 'One personalised message written and sent'],
    ['Apply to 2 saved postings with a customised cover note each', 'outreach', 90, 'Two applications beats zero', 'Applications submitted with tailored notes'],
    ['Prepare written answers to the 3 most common interview questions', 'practice', 90, 'Preparation changes how you perform', '3 answers written out in full'],
    ['Do a mock interview. Record yourself answering 3 questions and review it', 'practice', 60, 'Reviewing recordings improves answers faster than repetition', 'Recording done, 2+ specific improvements noted'],
  ],
  study: [
    ['Identify the 3 most important concepts you need to understand this week', 'research', 45, 'Focus prevents spreading thin', '3 concepts listed with a reason why each matters'],
    ['Study the first concept. Write a one-page summary in your own words', 'practice', 90, 'Your own words beat copying', 'Summary written without referencing source material'],
    ['Find and complete 3 practice problems on the first concept', 'practice', 90, 'Problems reveal gaps faster than re-reading', '3 problems attempted, errors noted'],
    ['Study the second concept. Connect it to the first in writing', 'practice', 90, 'Connections build durable understanding', 'Notes show explicit links between concept 1 and concept 2'],
    ['Complete 5 practice problems mixing both concepts', 'practice', 120, 'Mixed practice beats blocked practice', '5 problems completed, at least 3 correct'],
    ['Study the third concept. Write a summary connecting all three', 'write', 90, 'Synthesis is the goal of study', 'Summary shows how all three concepts relate'],
    ['Timed review: explain all three concepts in 15 minutes without notes', 'practice', 60, 'Timed recall tests real retention', 'Explanation recorded or written, weak spots identified'],
  ],
  habit: [
    ['Define the habit exactly: trigger, action, and duration', 'write', 45, 'Vague habits fail; precise habits stick', 'Habit written as: when X happens I will do Y for Z minutes'],
    ['Do the habit today. Set a timer. Record start and end time', 'other', 30, 'Day 1 removes the mental block', 'Habit done once, time recorded'],
    ['Set a specific daily time and add it to your calendar', 'other', 15, 'A default time prevents negotiation', 'Calendar block created with exact time for the next 7 days'],
    ['Do the habit again. Rate difficulty 1–5. Note what made it hard', 'other', 30, 'Friction data lets you reduce it', 'Habit done, difficulty score and one friction note recorded'],
    ['Remove one friction from Day 4. Prepare your environment in advance', 'other', 30, 'Environment design beats willpower', 'One specific preparation completed before tomorrow'],
    ['Do the habit. Note whether the preparation helped', 'other', 30, 'Testing your own adjustments builds self-knowledge', 'Habit done, note on whether preparation made it easier'],
    ['Write a one-paragraph reflection on what made this habit easier or harder', 'write', 30, 'Reflection turns experience into strategy', 'Reflection covers 3 factors that helped or hurt the habit'],
  ],
  fitness: [
    ['Define your workout plan: type, duration, and how many sessions this week', 'write', 30, 'A specific plan beats vague intention', 'Plan covers type, time of day, and number of sessions'],
    ['Complete the first workout. Record time, reps, or distance', 'other', 60, 'First session removes the start barrier', 'Workout done, key metric recorded'],
    ['Note what felt difficult. Find one technique fix for that part', 'research', 30, 'Technique prevents injury and improves results', 'One specific form adjustment identified and noted'],
    ['Complete second workout applying the technique change', 'other', 60, 'Apply before you forget', 'Workout done, technique change applied and result noted'],
    ['Add one small progressive overload: 5% more weight, 1 more rep, or 2 more minutes', 'other', 60, 'Small increases compound over time', 'Workout done with one measurable increase recorded'],
    ['Rest or do light movement. Prepare gear and plan for the final session', 'other', 30, 'Recovery is part of training', 'Rest or light activity done, plan ready for Day 7'],
    ['Final workout. Measure one key metric and compare it to Day 2', 'other', 60, 'Measurement closes the feedback loop', 'Workout complete, Day 2 vs Day 7 metric recorded'],
  ],
  other: [
    ['Write a clear one-paragraph description of what you want to accomplish this week', 'write', 45, 'Clarity first, action second', 'Paragraph covers the goal and a definition of done'],
    ['Break the goal into 5 concrete sub-tasks. Pick the most important one', 'review', 45, 'Smaller tasks beat vague goals', '5 sub-tasks listed, top priority selected'],
    ['Complete the first sub-task. Record exactly what you did', 'other', 90, 'Progress builds momentum', 'First sub-task done, notes on what was completed'],
    ['Review what you completed. Identify the next most important sub-task', 'review', 30, 'Frequent reviews prevent wasted effort', 'Review done, next priority selected'],
    ['Complete the second sub-task', 'other', 90, 'Consistency beats intensity', 'Second sub-task done, notes recorded'],
    ['Review progress. Adjust scope if needed to make Day 7 achievable', 'review', 30, 'Realistic scope matters more than ambition', 'Scope reviewed, Day 7 deliverable is specific and achievable'],
    ['Complete the week with one tangible output you can show or share', 'other', 90, 'Tangible outputs create accountability', 'One concrete artifact created and ready to share'],
  ],
});

function parseV2PromptField(prompt, fieldName) {
  const pattern = new RegExp(`^${fieldName}:\\s*(.+)`, 'm');
  const match = pattern.exec(String(prompt || ''));
  return match ? match[1].trim() : '';
}

function buildV2Fallback(action, prompt) {
  const safePrompt = String(prompt || '');

  if (action === 'track_generate' || action === 'track_continue') {
    const goal = parseV2PromptField(safePrompt, 'Goal') || 'your goal';
    const rawCat = parseV2PromptField(safePrompt, 'Category').toLowerCase();
    const cat = Object.prototype.hasOwnProperty.call(V2_TRACK_FALLBACK_DAYS, rawCat) ? rawCat : 'other';
    const template = V2_TRACK_FALLBACK_DAYS[cat];
    return {
      goal,
      days: template.map(([title, category, estimateMinutes, why, successCriteria], i) => ({
        dayNumber: i + 1,
        title,
        why,
        successCriteria,
        estimateMinutes,
        category,
        status: 'pending',
        date: '',
      })),
    };
  }

  if (action === 'agent_steps') {
    const title = parseV2PromptField(safePrompt, "Today's task") || 'your task';
    const short = title.slice(0, 60);
    return {
      steps: [
        { index: 0, text: `Open your workspace and re-read the task: "${short}"` },
        { index: 1, text: 'Write down the single most important sub-task you need to complete first.' },
        { index: 2, text: 'Complete that sub-task and record the output before stopping.' },
      ],
    };
  }

  if (action === 'rescue_action') {
    const title = parseV2PromptField(safePrompt, 'Original task') || 'your task';
    return {
      rescueTitle: `Smallest step toward: ${title.slice(0, 60)}`,
      steps: [
        'Set a 20-minute timer.',
        'Complete the first concrete sub-part of this task, even if incomplete.',
        'Write one sentence describing what you did.',
      ],
      reframeNote: '',
      source: 'fallback',
    };
  }

  if (action === 'action_kit') {
    const title = parseV2PromptField(safePrompt, 'Task') || 'your task';
    return {
      items: [
        { type: 'question', label: 'Focus question', content: `What is the smallest concrete thing I can produce in 30 minutes that proves progress on: "${title.slice(0, 60)}"?` },
        { type: 'template', label: 'Progress log', content: 'Time started:\nWhat I did:\nOutput produced:\nBlocker (if any):\nNext step:' },
        { type: 'tip', label: 'Getting unstuck', content: 'If stuck, reduce scope to 25% of the original task. A smaller done beats a full not-started.' },
      ],
    };
  }

  if (action === 'adapt_day') {
    const tomorrowTitle = parseV2PromptField(safePrompt, "Tomorrow's planned task") || '';
    return { changed: false, title: tomorrowTitle, why: '' };
  }

  if (action === 'v2_proof_check') {
    return {
      verdict: 'partial',
      note: 'Automatic verification unavailable. Check your work against the success criteria manually.',
    };
  }

  return {};
}

function buildV2PlaintextFallback(action, prompt) {
  if (action === 'agent_hint') {
    return 'Try a smaller version of this step. What is the minimum you could complete in 10 minutes?';
  }
  if (action === 'day7_recap') {
    const goal = parseV2PromptField(String(prompt || ''), 'Goal') || 'your goal';
    return `This week you worked on: ${goal.slice(0, 80)}. Review your outcomes and identify the one pattern that most affected your progress. Use that as the starting point for your next run.`;
  }
  return '';
}
app.post('/api/goals/:id/complete', async (req, res) => {
  const { id } = req.params;
  const trace = createRequestTrace();
  try {
    logInfo(trace, `Marking goal ${id} as completed`);
    // DB logic will go here
    res.status(200).json({ success: true, message: 'Goal marked as completed' });
  } catch (error) {
    logError(trace, 'Error completing goal', normalizeError(error));
    res.status(500).json({ error: 'Failed to update goal status' });
  }
});
function approxInputTokens(charCount) {
  return Math.max(1, Math.round(charCount / 4));
}

function normalizeAIAction(action) {
  const normalized = String(action || 'chat').trim().toLowerCase();
  if (normalized === 'check-in' || normalized === 'checkin' || normalized === 'daily_checkin') {
    return 'chat';
  }
  return normalized || 'chat';
}

function getActionGenerationConfig(action) {
  const safeAction = normalizeAIAction(action);
  return ACTION_AI_CONFIG[safeAction] || ACTION_AI_CONFIG.default;
}

function getActionContextLimits(action) {
  return getActionGenerationConfig(action).contextLimits || ACTION_AI_CONFIG.default.contextLimits;
}

function applyActionTokenGuard(action, maxTokens) {
  const safeAction = normalizeAIAction(action);
  const requested = Math.max(1, Math.floor(Number(maxTokens) || 0));
  if (safeAction === 'task_detail') {
    return Math.min(requested, 300);
  }
  if (safeAction === 'chat') {
    return Math.min(requested, 700);
  }
  if (safeAction === 'roadmap') {
    return Math.min(requested, 1500);
  }
  return requested;
}

function resolveActionGenerationConfig({ action, requestedMaxTokens, opts = {} }) {
  const safeAction = normalizeAIAction(action);
  const actionConfig = getActionGenerationConfig(safeAction);
  const requested = Math.min(8192, Math.max(1, Math.floor(Number(requestedMaxTokens) || actionConfig.maxCompletionTokens || 1)));
  const actionGuard = applyActionTokenGuard(safeAction, actionConfig.maxCompletionTokens || requested);
  const effectiveMaxTokens = Math.max(1, Math.min(requested, actionConfig.maxCompletionTokens || requested, actionGuard));
  return {
    action: safeAction,
    model: actionConfig.model || OPENAI_MODEL,
    reasoningEffort: actionConfig.reasoningEffort || 'minimal',
    temperature: actionConfig.temperature,
    topP: actionConfig.topP,
    contextLimits: actionConfig.contextLimits || ACTION_AI_CONFIG.default.contextLimits,
    requestedMaxTokens: requested,
    effectiveMaxTokens,
    responseMimeType: typeof opts.responseMimeType === 'string' ? opts.responseMimeType : '',
    responseSchema: opts.responseSchema || opts.responseJsonSchema || null,
  };
}

function trimText(value, maxChars) {
  const text = String(value || '');
  if (!maxChars || text.length <= maxChars) {
    return { text, trimmed: false };
  }
  if (maxChars < 80) {
    return { text: text.slice(0, maxChars), trimmed: true };
  }
  const headChars = Math.floor(maxChars * 0.72);
  const tailChars = Math.max(0, maxChars - headChars - 22);
  const trimmedText = `${text.slice(0, headChars)}\n...[trimmed]...\n${tailChars ? text.slice(-tailChars) : ''}`;
  return { text: trimmedText, trimmed: true };
}

function trimContextByAction(action, prompt, systemCtx) {
  const limits = getActionContextLimits(action);
  const promptResult = trimText(prompt, limits.promptChars);
  const systemResult = trimText(systemCtx, limits.systemChars);
  let trimmedPrompt = promptResult.text;
  let trimmedSystem = systemResult.text;
  let trimmed = promptResult.trimmed || systemResult.trimmed;

  if (trimmedPrompt.length + trimmedSystem.length > limits.totalChars) {
    const allowedPromptChars = Math.max(200, limits.totalChars - Math.min(trimmedSystem.length, limits.systemChars));
    const reducedPrompt = trimText(trimmedPrompt, allowedPromptChars);
    trimmedPrompt = reducedPrompt.text;
    trimmed = true;
  }

  return {
    prompt: trimmedPrompt,
    systemCtx: trimmedSystem,
    trimmed,
  };
}

function compactRoadmapPrompt(prompt, systemCtx, requestedCount = 0) {
  const promptText = String(prompt || '').replace(/\n{3,}/g, '\n\n').trim();
  const systemText = String(systemCtx || '').replace(/\n{3,}/g, '\n\n').trim();
  const compactCount = requestedCount > 3 ? Math.max(3, requestedCount - 1) : requestedCount;
  const compactHint = compactCount
    ? `\nCOMPACT RETRY: if token budget is tight, return only ${compactCount} stages and keep each stage to very short title/objective/outcome lines.`
    : '\nCOMPACT RETRY: keep the answer much shorter than the first attempt.';
  return {
    prompt: `${promptText.length > 4200 ? `${promptText.slice(0, 3200)}\n...[compact]\n${promptText.slice(-240)}` : promptText}${compactHint}`,
    systemCtx: systemText.length > 1600 ? `${systemText.slice(0, 1200)}\n...[compact]\n${systemText.slice(-180)}` : systemText,
  };
}

function compactTaskDetailPrompt(prompt, systemCtx) {
  const promptText = String(prompt || '').replace(/\n{3,}/g, '\n\n').trim();
  const systemText = String(systemCtx || '').replace(/\n{3,}/g, '\n\n').trim();
  return {
    prompt: `${promptText.replace(/\nStage outcome:[^\n]*/i, '')}\nCOMPACT RETRY: return the task_detail contract only, with one short sentence per field.`,
    systemCtx: systemText.length > 1200 ? `${systemText.slice(0, 900)}\n...[compact]\n${systemText.slice(-120)}` : systemText,
  };
}

function compactChatPrompt(prompt, systemCtx) {
  const promptText = String(prompt || '').replace(/\n{3,}/g, '\n\n').trim();
  const systemText = String(systemCtx || '').replace(/\n{3,}/g, '\n\n').trim();
  const compactPrompt = promptText.length > 2200
    ? `${promptText.slice(0, 1400)}\n...[compact]\n${promptText.slice(-220)}`
    : promptText;
  const compactSystem = systemText.length > 720
    ? `${systemText.slice(0, 520)}\n...[compact]\n${systemText.slice(-100)}`
    : systemText;
  return {
    prompt: [
      compactPrompt,
      'COMPACT RETRY: answer in max 4 short bullets.',
      'Include exactly one bottleneck, one focus for today, one next step, and one question.',
      'Use only current app data. No motivational filler.',
    ].filter(Boolean).join('\n'),
    systemCtx: compactSystem,
  };
}

const TRANSIENT_RETRY_BACKOFF_MS = [900, 1800, 3600];
const roadmapInFlightByFingerprint = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripCodeFences(raw) {
  return String(raw || '').replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
}

function extractJsonChunk(raw) {
  const text = stripCodeFences(raw);
  const start = [text.indexOf('['), text.indexOf('{')].filter((i) => i >= 0).sort((a, b) => a - b)[0];
  if (start === undefined) return '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') depth += 1;
    if (ch === '}' || ch === ']') depth -= 1;
    if (depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

function repairTruncatedJsonCandidate(raw) {
  let text = String(raw || '').trim();
  if (!text) return '';
  let inString = false;
  let escaped = false;
  const stack = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{' || ch === '[') { stack.push(ch); continue; }
    if (ch === '}' || ch === ']') {
      const top = stack[stack.length - 1];
      if ((ch === '}' && top === '{') || (ch === ']' && top === '[')) stack.pop();
    }
  }
  if (inString) text += '"';
  while (stack.length) {
    const open = stack.pop();
    text += open === '{' ? '}' : ']';
  }
  return text.replace(/,\s*([}\]])/g, '$1');
}

function parseJsonWithRepair(raw) {
  const variants = [stripCodeFences(raw), extractJsonChunk(raw)].filter(Boolean);
  const repaired = variants.map((v) => repairTruncatedJsonCandidate(v)).filter(Boolean);
  const all = [...variants, ...repaired];
  for (const candidate of all) {
    try {
      JSON.parse(candidate);
      return { usable: true, repairedText: candidate };
    } catch (_err) {
      // no-op
    }
  }
  return { usable: false, repairedText: '' };
}

function salvagePlainTextTasks(raw) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return { usable: false, repairedText: '', taskCount: 0 };
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const blocks = new Map();
  lines.forEach((line) => {
    let match = line.match(/^TASK\s+(\d+)\s*\|\s*(.+)$/i);
    if (match) {
      const idx = Number(match[1]);
      blocks.set(idx, { ...(blocks.get(idx) || {}), task: line });
      return;
    }
    match = line.match(/^DESCRIPTION\s+(\d+)\s*\|\s*(.+)$/i);
    if (match) {
      const idx = Number(match[1]);
      blocks.set(idx, { ...(blocks.get(idx) || {}), description: line });
      return;
    }
    match = line.match(/^WHY\s+(\d+)\s*\|\s*(.+)$/i);
    if (match) {
      const idx = Number(match[1]);
      blocks.set(idx, { ...(blocks.get(idx) || {}), why: line });
      return;
    }
    match = line.match(/^DELIVERABLE\s+(\d+)\s*\|\s*(.+)$/i);
    if (match) {
      const idx = Number(match[1]);
      blocks.set(idx, { ...(blocks.get(idx) || {}), deliverable: line });
      return;
    }
    match = line.match(/^DONE\s+(\d+)\s*\|\s*(.+)$/i);
    if (match) {
      const idx = Number(match[1]);
      blocks.set(idx, { ...(blocks.get(idx) || {}), done: line });
      return;
    }
    match = line.match(/^PRIORITY\s+(\d+)\s*\|\s*(high|med|low)$/i);
    if (match) {
      const idx = Number(match[1]);
      blocks.set(idx, { ...(blocks.get(idx) || {}), priority: line });
      return;
    }
    match = line.match(/^DEADLINE\s+(\d+)\s*\|\s*(.+)$/i);
    if (match) {
      const idx = Number(match[1]);
      blocks.set(idx, { ...(blocks.get(idx) || {}), deadline: line });
    }
  });
  const ordered = Array.from(blocks.entries())
    .sort((a, b) => a[0] - b[0])
    .filter(([, block]) => block.task && block.description && block.why && block.deliverable && block.done && block.priority && block.deadline);
  if (!ordered.length) {
    return { usable: false, repairedText: '', taskCount: 0 };
  }
  const repairedText = [
    'TASK_SET_START',
    'LANGUAGE | Russian',
    ...ordered.flatMap(([, block]) => [block.task, block.description, block.why, block.deliverable, block.done, block.priority, block.deadline]),
    'TASK_SET_END',
  ].join('\n');
  return { usable: true, repairedText, taskCount: ordered.length };
}

function salvageTaskSkeleton(raw) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return { usable: false, repairedText: '', taskCount: 0 };
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const ordered = lines
    .map((line) => {
      const match = line.match(/^(\d+)\s*\|\s*(.+)$/i);
      if (!match) return null;
      return {
        idx: Number(match[1]),
        title: match[2].trim(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.idx - b.idx)
    .filter((item, index) => item.idx === index + 1 && item.title);
  if (ordered.length !== 3) {
    return { usable: false, repairedText: '', taskCount: 0 };
  }
  const repairedText = [
    'TASKS_SKELETON_START',
    ...ordered.map((item) => `${item.idx} | ${item.title}`),
    'TASKS_SKELETON_END',
  ].join('\n');
  return { usable: true, repairedText, taskCount: ordered.length };
}

function salvageTaskDetail(raw) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return { usable: false, repairedText: '' };
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const fields = new Map();
  lines.forEach((line) => {
    const match = line.match(/^(TITLE|DESCRIPTION|WHY|DELIVERABLE|DONE|PRIORITY|DEADLINE)\s*\|\s*(.+)$/i);
    if (match && !fields.has(String(match[1] || '').toUpperCase())) {
      fields.set(String(match[1] || '').toUpperCase(), `${String(match[1] || '').toUpperCase()} | ${String(match[2] || '').trim()}`);
    }
  });
  const titleValue = String(fields.get('TITLE') || '').replace(/^TITLE\s*\|\s*/i, '').trim();
  if (!titleValue) {
    return { usable: false, repairedText: '' };
  }
  if (!fields.has('DESCRIPTION')) {
    fields.set('DESCRIPTION', `DESCRIPTION | Complete the task "${titleValue}" as a concrete next step.`);
  }
  if (!fields.has('WHY')) {
    fields.set('WHY', `WHY | Keeps the current stage in execution and reduces the risk of downtime.`);
  }
  if (!fields.has('DELIVERABLE') && fields.has('DONE')) {
    fields.set('DELIVERABLE', `DELIVERABLE | ${String(fields.get('DONE') || '').replace(/^DONE\s*\|\s*/i, '')}`);
  }
  if (!fields.has('DONE') && fields.has('DELIVERABLE')) {
    fields.set('DONE', `DONE | ${String(fields.get('DELIVERABLE') || '').replace(/^DELIVERABLE\s*\|\s*/i, '')}`);
  }
  if (!fields.has('DELIVERABLE')) {
    fields.set('DELIVERABLE', `DELIVERABLE | A verifiable artifact or measurable result for task "${titleValue}".`);
  }
  if (!fields.has('DONE')) {
    fields.set('DONE', `DONE | A completed result exists with a short captured conclusion.`);
  }
  if (!fields.has('PRIORITY')) {
    fields.set('PRIORITY', 'PRIORITY | med');
  }
  if (!fields.has('DEADLINE')) {
    fields.set('DEADLINE', 'DEADLINE | none');
  }
  const orderedKeys = ['TITLE', 'DESCRIPTION', 'WHY', 'DELIVERABLE', 'DONE', 'PRIORITY', 'DEADLINE'];
  const repairedText = [
    'TASK_DETAIL_START',
    ...orderedKeys.map((key) => fields.get(key)),
    'TASK_DETAIL_END',
  ].join('\n');
  return { usable: true, repairedText: repairedText.trim() };
}

function salvageChatResponse(raw) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return { usable: false, repairedText: '', truncated: false };
  const compact = text.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
  const lines = compact.split('\n').map((line) => line.trim()).filter(Boolean);
  const bullets = lines.filter((line) => /^[-•*]\s+/.test(line)).slice(0, 4);
  let repairedText = bullets.length ? bullets.join('\n') : compact;
  repairedText = repairedText
    .split(/(?<=[.!?])\s+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(bullets.length ? '\n' : ' ');
  repairedText = repairedText.replace(/\s+\n/g, '\n').trim();
  if (!repairedText) repairedText = compact.slice(0, 500).trim();
  if (repairedText.length < 60) {
    return { usable: false, repairedText, truncated: true };
  }
  return { usable: true, repairedText, truncated: true };
}

function extractTaskDetailPromptContext(prompt) {
  const text = String(prompt || '');
  const pick = (pattern) => {
    const match = text.match(pattern);
    return match ? String(match[1] || '').trim() : '';
  };
  return {
    title: pick(/^Task:\s*(.+)$/im),
    stageTitle: pick(/^Stage:\s*(.+)$/im),
    objective: pick(/^Objective:\s*(.+)$/im),
    outcome: pick(/^Outcome:\s*(.+)$/im),
    deadline: pick(/^Deadline:\s*(.+)$/im),
    stageWindow: pick(/^Stage window:\s*(.+)$/im),
    taskSlot: pick(/^Task slot:\s*(.+)$/im),
  };
}

function clampDateLikeToWindow(value, startDate, endDate) {
  const raw = String(value || '').trim();
  const start = toIsoDateOnly(startDate);
  const end = toIsoDateOnly(endDate);
  if (!raw || raw === 'none') return end || start || 'none';
  const normalized = toIsoDateOnly(raw);
  if (!normalized) return end || start || raw;
  let time = new Date(`${normalized}T00:00:00`).getTime();
  if (Number.isFinite(new Date(`${start}T00:00:00`).getTime()) && time < new Date(`${start}T00:00:00`).getTime()) {
    time = new Date(`${start}T00:00:00`).getTime();
  }
  if (Number.isFinite(new Date(`${end}T00:00:00`).getTime()) && time > new Date(`${end}T00:00:00`).getTime()) {
    time = new Date(`${end}T00:00:00`).getTime();
  }
  return toIsoDateOnly(new Date(time));
}

function extractRoadmapTargetCount(prompt, fallbackCount = 0) {
  const text = String(prompt || '');
  const patterns = [
    /exactly\s+(\d+)\s+(?:stages?|milestones?)/i,
    /return\s+(\d+)\s+(?:stages?|milestones?)/i,
    /(?:stages?|milestones?|weeks?)\s+(\d+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const count = Number(match[1]);
      if (Number.isFinite(count) && count > 0) return count;
    }
  }
  return Math.max(0, Number(fallbackCount) || 0);
}

function normalizeRoadmapStageCandidate(candidate, index) {
  const raw = typeof candidate === 'string' ? { title: candidate } : (candidate || {});
  const title = String(raw.title || raw.name || raw.week || raw.stage || '').trim();
  const objective = String(raw.objective || raw.goal || raw.description || '').trim();
  const outcome = String(raw.outcome || raw.result || raw.expectedOutcome || '').trim();
  const reasoning = String(raw.reasoning || raw.why || raw.rationale || raw.note || '').trim();
  const safeTitle = title || objective || outcome || `Milestone ${index + 1}`;
  const safeObjective = objective || outcome || 'Concrete execution step';
  const safeOutcome = outcome || objective || 'Measurable output';
  const parts = [`${index + 1}. ${safeTitle}`, safeObjective, safeOutcome];
  if (reasoning) parts.push(reasoning);
  return parts.join(' || ');
}

function normalizeRoadmapStageObject(candidate, index) {
  const raw = typeof candidate === 'string' ? { title: candidate } : (candidate || {});
  const rawTitle = String(raw.title || raw.name || raw.week || raw.stage || '').trim();
  const title = String(rawTitle || raw.objective || raw.outcome || '').trim() || `Milestone ${index + 1}`;
  const objective = String(raw.objective || raw.goal || raw.description || '').trim()
    || String(raw.outcome || raw.result || raw.expectedOutcome || '').trim()
    || 'Concrete execution step';
  const outcome = String(raw.outcome || raw.result || raw.expectedOutcome || '').trim()
    || objective
    || 'Measurable output';
  const reasoning = String(raw.reasoning || raw.why || raw.rationale || raw.note || '').trim()
    || `Stage ${index + 1} moves the roadmap toward a measurable outcome.`;
  const completionCriteriaSource = Array.isArray(raw.completion_criteria)
    ? raw.completion_criteria
    : Array.isArray(raw.criteria)
      ? raw.criteria
      : Array.isArray(raw.days)
        ? raw.days.map((day) => day?.task || day?.title || '').filter(Boolean)
        : [];
  const completionCriteria = completionCriteriaSource
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 4);
  while (completionCriteria.length < 3) {
    completionCriteria.push(
      completionCriteria.length === 0
        ? `Complete the core work for ${title}`
        : `Advance ${title} toward the stage outcome`
    );
  }
  return {
    week: index + 1,
    title,
    titleSource: String(raw.titleSource || raw.source || (rawTitle ? 'ai' : (raw.objective || raw.outcome ? 'derived' : 'fallback')) || 'fallback'),
    titleSourceReason: String(raw.titleSourceReason || ''),
    fallbackUsed: Boolean(raw.fallbackUsed || !rawTitle),
    titleOriginal: String(raw.titleOriginal || raw.originalTitle || ''),
    source: String(raw.source || (rawTitle ? 'ai' : (raw.objective || raw.outcome ? 'derived' : 'fallback'))),
    objective,
    outcome,
    reasoning,
    completion_criteria: completionCriteria,
    target_date: String(raw.target_date || raw.targetDate || raw.deadline || '').trim(),
  };
}

function buildFallbackRoadmapStages(desiredCount = 3) {
  const templates = [
    {
      title: 'Confirm the demand signal',
      objective: 'Confirm the core problem and the audience signal',
      outcome: 'A clear problem statement and first user evidence',
      reasoning: 'The roadmap needs a real signal before it expands into execution.',
      criteria: [
        'Run user discovery or customer interviews',
        'Capture the top pain points and triggers',
        'Agree on the next product direction',
      ],
    },
    {
      title: 'Shape the first testable flow',
      objective: 'Reduce the plan to one testable path',
      outcome: 'A focused MVP scope with the critical steps defined',
      reasoning: 'Narrow scope keeps the roadmap execution-heavy and realistic.',
      criteria: [
        'Define the primary user journey',
        'List the must-have pieces of the MVP',
        'Lock the success metrics for this stage',
      ],
    },
    {
      title: 'Build the execution sequence',
      objective: 'Turn the scope into a working delivery sequence',
      outcome: 'A usable product path and the next measurable outcome',
      reasoning: 'The final stage should keep the roadmap moving toward delivery.',
      criteria: [
        'Deliver the core working flow',
        'Track the critical actions and blockers',
        'Prepare the next milestone handoff',
      ],
    },
    {
      title: 'Establish the growth loop',
      objective: 'Establish the first repeatable growth motion',
      outcome: 'Early traction and a clear iteration loop',
      reasoning: 'Extra milestones should stay concrete instead of turning abstract.',
      criteria: [
        'Pick one acquisition or distribution channel',
        'Measure the first conversion signal',
        'Record what to improve next',
      ],
    },
  ];
  const count = Math.max(3, Number(desiredCount) || 0);
  return Array.from({ length: count }, (_, index) => {
    const template = templates[index] || templates[templates.length - 1];
    const previous = index > 0 ? templates[Math.min(index - 1, templates.length - 1)] : template;
    return normalizeRoadmapStageObject({
      title: template.title || `Stage ${index + 1}`,
      objective: template.objective || previous.objective || 'Concrete execution step',
      outcome: template.outcome || previous.outcome || 'Measurable output',
      reasoning: template.reasoning || previous.reasoning || `Stage ${index + 1} supports the roadmap.`,
      completion_criteria: template.criteria || previous.criteria || [],
      target_date: '',
      source: 'fallback',
      titleSource: 'fallback',
      titleSourceReason: 'server_fallback_template',
      fallbackUsed: true,
    }, index);
  });
}

function salvageRoadmapSkeleton(raw, desiredCount = 0) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) {
    const fallbackStages = buildFallbackRoadmapStages(desiredCount || 3);
    return { usable: true, repairedText: JSON.stringify({ stages: fallbackStages }, null, 2), stageCount: fallbackStages.length, stages: fallbackStages };
  }

  const parsedStages = [];
  const tryPushStage = (candidate) => {
    if (!candidate) return;
    parsedStages.push(candidate);
  };

  const jsonVariants = [stripCodeFences(raw), extractJsonChunk(raw)].filter(Boolean);
  for (const candidate of jsonVariants) {
    try {
      const parsed = JSON.parse(candidate);
      const source = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.stages)
          ? parsed.stages
          : Array.isArray(parsed?.phases)
            ? parsed.phases
            : [];
      if (source.length) {
        source.forEach((item) => tryPushStage(item));
        break;
      }
    } catch (_err) {
      // no-op
    }
  }
  if (!parsedStages.length) {
    for (const candidate of jsonVariants.map((value) => repairTruncatedJsonCandidate(value)).filter(Boolean)) {
      try {
        const parsed = JSON.parse(candidate);
        const source = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.stages)
            ? parsed.stages
            : Array.isArray(parsed?.phases)
              ? parsed.phases
              : [];
        if (source.length) {
          source.forEach((item) => tryPushStage(item));
          break;
        }
      } catch (_err) {
        // no-op
      }
    }
  }

  if (!parsedStages.length) {
      const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
      lines.forEach((line) => {
        if (/^(?:\.\.\.|…)$/.test(line)) return;
        const match = line.match(/^(\d+)[\.\)]?\s*(.+)$/);
        if (!match) return;
        const payload = match[2].replace(/^\s*\|\s*/, '').trim();
        if (!payload) return;
        const parts = payload.split(/\s*\|\|\s*|\s*\|\s*/).map((part) => part.trim()).filter(Boolean);
        if (!parts.length) return;
        tryPushStage({
          title: parts[0],
          objective: parts[1] || '',
          outcome: parts[2] || '',
          reasoning: parts.slice(3).join(' || '),
        });
      });
    }

  if (!parsedStages.length) {
    const fallbackStages = buildFallbackRoadmapStages(desiredCount || 3);
    return { usable: true, repairedText: JSON.stringify({ stages: fallbackStages }, null, 2), stageCount: fallbackStages.length, stages: fallbackStages };
  }

  const targetCount = Math.max(3, desiredCount > 0 ? Math.max(desiredCount, parsedStages.length) : parsedStages.length);
  const filled = [];
  for (let i = 0; i < targetCount; i += 1) {
    const candidate = parsedStages[i] || parsedStages[parsedStages.length - 1] || {};
    if (i < parsedStages.length) {
      filled.push(normalizeRoadmapStageObject(candidate, i));
      continue;
    }
    const prev = parsedStages[i - 1] || parsedStages[parsedStages.length - 1] || {};
    const prevTitle = String(prev.title || prev.name || '').trim();
    const prevObjective = String(prev.objective || prev.goal || '').trim();
    const prevOutcome = String(prev.outcome || prev.result || '').trim();
    const fallbackTitle = prevTitle ? `Next: ${prevTitle}` : `Stage ${i + 1}`;
    const fallbackObjective = prevObjective
      ? `Advance ${prevObjective}`
      : `Deliver the next concrete execution step`;
    const fallbackOutcome = prevOutcome
      ? `Extend ${prevOutcome}`
      : `A measurable milestone outcome`;
    filled.push(`${i + 1}. ${fallbackTitle} || ${fallbackObjective} || ${fallbackOutcome}`);
  }

  const repairedText = JSON.stringify({
    stages: filled.map((entry, index) => normalizeRoadmapStageObject(entry, index)),
  }, null, 2);
  const stages = filled.map((entry, index) => {
    if (typeof entry === 'string') {
      const body = entry.replace(/^\s*\d+\.\s*/, '');
      const parts = body.split(/\s*\|\|\s*/).map((part) => part.trim()).filter(Boolean);
      return normalizeRoadmapStageObject({
        title: parts[0] || `Stage ${index + 1}`,
        objective: parts[1] || '',
        outcome: parts[2] || '',
        reasoning: parts.slice(3).join(' || '),
      }, index);
    }
    return normalizeRoadmapStageObject(entry, index);
  });
  return { usable: true, repairedText, stageCount: stages.length, stages };
}

function classifyFailure({ timedOut, parseFailed, upstreamStatus, upstreamErrorCode, finishReason }) {
  const normalizedUpstreamError = String(upstreamErrorCode || '').toUpperCase();
  if (finishReason === 'MAX_TOKENS') {
    return { code: 'RESPONSE_TRUNCATED', httpStatus: 502 };
  }
  if (timedOut) {
    return { code: 'TIMEOUT', httpStatus: 504 };
  }
  if (parseFailed) {
    return { code: 'PARSE_FAIL', httpStatus: 502 };
  }
  if (upstreamStatus === 401 || upstreamStatus === 403) {
    return { code: 'UPSTREAM_401_403', httpStatus: 502 };
  }
  if (upstreamStatus === 429) {
    return { code: 'UPSTREAM_429', httpStatus: 429 };
  }
  if (upstreamStatus === 503 || normalizedUpstreamError === 'UNAVAILABLE') {
    return { code: 'UPSTREAM_UNAVAILABLE', httpStatus: 503 };
  }
  if (upstreamStatus === 400 || normalizedUpstreamError === 'INVALID_ARGUMENT') {
    return { code: 'BAD_REQUEST', httpStatus: 400 };
  }
  if (upstreamStatus >= 500) {
    return { code: 'UPSTREAM_5XX', httpStatus: 502 };
  }
  return { code: 'UPSTREAM_400', httpStatus: 502 };
}

function isRetryableFailureCode(code) {
  return code === 'UPSTREAM_UNAVAILABLE' || code === 'TIMEOUT';
}

function normalizeErrorPayload(action, failure) {
  const code = failure?.code || 'UPSTREAM_5XX';
  const taskGenerationAction = TASK_GENERATION_ACTIONS.has(action);
  if (action === 'roadmap' && code === 'UPSTREAM_UNAVAILABLE') {
    return {
      error: 'Roadmap generation is temporarily unavailable. Please try again in a moment.',
      code: 'provider_unavailable',
      retryable: true,
    };
  }
  if (code === 'UPSTREAM_UNAVAILABLE') {
    return { error: 'AI provider is temporarily unavailable. Please try again shortly.', code: 'provider_unavailable', retryable: true };
  }
  if (code === 'TIMEOUT') {
    return { error: 'AI request timed out. Please try again.', code: 'timeout', retryable: true };
  }
  if (code === 'RESPONSE_TRUNCATED') {
    return {
      error: taskGenerationAction
        ? 'Task generation response was incomplete. Please retry.'
        : 'AI response was truncated. Please retry.',
      code: 'truncated_response',
      retryable: true,
    };
  }
  if (code === 'PARSE_FAIL') {
    return { error: 'AI returned an invalid response format. Please retry.', code: 'invalid_response', retryable: true };
  }
  if (code === 'BAD_REQUEST') {
    return { error: 'Invalid AI request payload.', code: 'bad_request', retryable: false };
  }
  if (code === 'UPSTREAM_401_403') {
    return { error: 'AI provider rejected the request.', code: 'provider_auth_error', retryable: false };
  }
  if (code === 'UPSTREAM_429') {
    return { error: 'AI provider is rate-limiting requests. Please retry shortly.', code: 'provider_rate_limited', retryable: true };
  }
  return { error: 'AI request failed.', code: 'invalid_response', retryable: code !== 'BAD_REQUEST' };
}

function createRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function normalizeOpenAIUsage(usage = {}) {
  const promptTokens = Math.max(0, Math.floor(Number(usage.prompt_tokens ?? usage.input_tokens ?? 0) || 0));
  const completionTokens = Math.max(0, Math.floor(Number(usage.completion_tokens ?? usage.output_tokens ?? 0) || 0));
  const reasoningTokens = Math.max(
    0,
    Math.floor(Number(
      usage.completion_tokens_details?.reasoning_tokens ??
      usage.output_tokens_details?.reasoning_tokens ??
      usage.reasoning_tokens ??
      0
    ) || 0)
  );
  const totalTokens = Math.max(0, Math.floor(Number(usage.total_tokens ?? (promptTokens + completionTokens)) || (promptTokens + completionTokens)));
  return {
    inputTokens: promptTokens,
    promptTokens,
    outputTokens: completionTokens,
    completionTokens,
    reasoningTokens,
    totalTokens,
  };
}

function estimateOpenAICostUsd(model, usage = {}) {
  const normalizedModel = String(model || '').trim().toLowerCase();
  const pricing = normalizedModel.startsWith('gpt-5-nano')
    ? { input: 0.05, output: 0.40 }
    : normalizedModel.startsWith('gpt-5-mini')
      ? { input: 0.25, output: 2.00 }
      : null;
  if (!pricing) return null;
  const promptTokens = Math.max(0, Math.floor(Number(usage.promptTokens ?? usage.inputTokens ?? 0) || 0));
  const completionTokens = Math.max(0, Math.floor(Number(usage.completionTokens ?? usage.outputTokens ?? 0) || 0));
  return Number((((promptTokens * pricing.input) + (completionTokens * pricing.output)) / 1000000).toFixed(6));
}

function buildOpenAIUsageLogFields({ model, usage, cacheHit = false }) {
  const normalizedUsage = normalizeOpenAIUsage(usage);
  const estimatedCostUsd = cacheHit ? 0 : estimateOpenAICostUsd(model, normalizedUsage);
  return {
    usage: {
      input_tokens: normalizedUsage.inputTokens,
      prompt_tokens: normalizedUsage.promptTokens,
      output_tokens: normalizedUsage.outputTokens,
      completion_tokens: normalizedUsage.completionTokens,
      reasoning_tokens: normalizedUsage.reasoningTokens,
      total_tokens: normalizedUsage.totalTokens,
    },
    input_tokens: normalizedUsage.inputTokens,
    prompt_tokens: normalizedUsage.promptTokens,
    output_tokens: normalizedUsage.outputTokens,
    completion_tokens: normalizedUsage.completionTokens,
    reasoning_tokens: normalizedUsage.reasoningTokens,
    total_tokens: normalizedUsage.totalTokens,
    estimatedCostUsd,
    cacheHit,
  };
}

function buildOpenAICacheKey({ action, model, fullPrompt, systemCtx, generationConfig }) {
  const responseShape = [
    String(generationConfig?.responseMimeType || ''),
    String(generationConfig?.reasoningEffort || ''),
    generationConfig?.responseSchema ? hashText(JSON.stringify(generationConfig.responseSchema)) : '',
  ].join('|');
  const raw = [
    normalizeAIAction(action),
    String(model || OPENAI_MODEL),
    String(fullPrompt || ''),
    String(systemCtx || ''),
    responseShape,
  ].join('\u241e');
  return `${normalizeAIAction(action)}:${String(model || OPENAI_MODEL)}:${hashText(raw)}`;
}

function pruneOpenAIResponseCache(now = Date.now()) {
  for (const [key, entry] of openAIResponseCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      openAIResponseCache.delete(key);
    }
  }
  if (openAIResponseCache.size <= OPENAI_RESPONSE_CACHE_MAX_SIZE) {
    return;
  }
  const overflow = openAIResponseCache.size - OPENAI_RESPONSE_CACHE_MAX_SIZE;
  const oldestEntries = [...openAIResponseCache.entries()]
    .sort((a, b) => a[1].createdAt - b[1].createdAt)
    .slice(0, overflow);
  oldestEntries.forEach(([key]) => openAIResponseCache.delete(key));
}

function getOpenAIResponseCache(cacheKey) {
  if (!cacheKey) return null;
  const entry = openAIResponseCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    openAIResponseCache.delete(cacheKey);
    return null;
  }
  return entry.value || null;
}

function setOpenAIResponseCache(cacheKey, value) {
  if (!cacheKey || !value) return;
  openAIResponseCache.set(cacheKey, {
    value: JSON.parse(JSON.stringify(value)),
    createdAt: Date.now(),
    expiresAt: Date.now() + OPENAI_RESPONSE_CACHE_TTL_MS,
  });
  pruneOpenAIResponseCache();
}

function buildRoadmapFingerprint({ ip, prompt, systemCtx, requestedMaxTokens, clientRequestId }) {
  if (clientRequestId) return `client:${clientRequestId}`;
  const raw = `${ip || 'unknown'}|${requestedMaxTokens}|${prompt || ''}|${systemCtx || ''}`;
  return `fp:${hashText(raw).slice(0, 20)}`;
}

function buildOpenAIPayload({ model, fullPrompt, generationConfig }) {
  const effectiveModel = model || OPENAI_MODEL;
  const isReasoningModel = usesCompletionTokenLimit(effectiveModel);
  const tokenLimitField = getOpenAITokenLimitField(effectiveModel);
  const tokenLimitValue = Number.isInteger(generationConfig.maxOutputTokens)
    ? generationConfig.maxOutputTokens
    : 1000;
  const payload = {
    model: effectiveModel,
    messages: [{ role: 'user', content: fullPrompt }],
  };
  payload[tokenLimitField] = tokenLimitValue;
  if (isReasoningModel) {
    payload.reasoning_effort = String(generationConfig.reasoningEffort || 'minimal');
    payload.temperature = Number.isFinite(generationConfig.temperature) ? generationConfig.temperature : 1;
    payload.top_p = Number.isFinite(generationConfig.topP) ? generationConfig.topP : 1;
  } else {
    payload.temperature = Number.isFinite(generationConfig.temperature) ? generationConfig.temperature : 0.7;
    if (Number.isFinite(generationConfig.topP)) {
      payload.top_p = generationConfig.topP;
    }
  }
  if (
    generationConfig.responseMimeType === 'application/json' ||
    generationConfig.responseSchema ||
    generationConfig.responseJsonSchema
  ) {
    payload.response_format = { type: 'json_object' };
  }
  return payload;
}

function safePayloadForLogs(payload) {
  const text = String(payload?.messages?.[0]?.content || '');
  const promptPreview = text.length <= 700
    ? text
    : `${text.slice(0, 500)}\n...[truncated for logs]...\n${text.slice(-180)}`;
  const tokenLimitValue = Number.isInteger(payload?.max_completion_tokens)
    ? payload.max_completion_tokens
    : (Number.isInteger(payload?.max_tokens) ? payload.max_tokens : null);
  const tokenLimitField = Number.isInteger(payload?.max_completion_tokens)
    ? 'max_completion_tokens'
    : (Number.isInteger(payload?.max_tokens) ? 'max_tokens' : '');
  return {
    model: String(payload?.model || OPENAI_MODEL),
    contentsCount: Array.isArray(payload?.contents) ? payload.contents.length : 0,
    contentRoles: Array.isArray(payload?.contents) ? payload.contents.map((item) => String(item?.role || '')) : [],
    promptChars: text.length,
    promptPreview,
    tokenLimitField,
    tokenLimitValue,
    generationConfig: {
      maxOutputTokens: tokenLimitValue,
      temperature: Number.isFinite(payload?.temperature) ? payload.temperature : null,
      topP: Number.isFinite(payload?.top_p) ? payload.top_p : null,
      reasoningEffort: String(payload?.reasoning_effort || ''),
      responseMimeType: payload?.response_format?.type === 'json_object' ? 'application/json' : '',
      schemaProvided: Boolean(payload?.response_format),
      keys: Object.keys(payload || {}),
    },
  };
}

function sanitizeResponseSchemaNode(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return undefined;
  }

  const safeType = typeof node.type === 'string' ? node.type : 'object';

  if (safeType === 'array') {
    const safeItems = sanitizeResponseSchemaNode(node.items);
    return safeItems
      ? { type: 'array', items: safeItems }
      : { type: 'array', items: { type: 'string' } };
  }

  if (safeType === 'object') {
    const sourceProperties = node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)
      ? node.properties
      : {};
    const safeProperties = {};

    Object.entries(sourceProperties).forEach(([key, value]) => {
      const sanitized = sanitizeResponseSchemaNode(value);
      safeProperties[key] = sanitized || { type: 'string' };
    });

    return { type: 'object', properties: safeProperties };
  }

  return { type: safeType };
}

function sanitizeGenerationConfig({ opts, action, effectiveMaxTokens, actionConfig }) {
  const safeAction = normalizeAIAction(action);
  const runtimeConfig = actionConfig || getActionGenerationConfig(safeAction);
  const generationConfig = {
    maxOutputTokens: effectiveMaxTokens,
  };
  const warnings = [];

  if (usesCompletionTokenLimit(runtimeConfig.model || OPENAI_MODEL)) {
    generationConfig.reasoningEffort = runtimeConfig.reasoningEffort || 'minimal';
    generationConfig.temperature = Number.isFinite(runtimeConfig.temperature) ? runtimeConfig.temperature : 1;
    generationConfig.topP = Number.isFinite(runtimeConfig.topP) ? runtimeConfig.topP : 1;
  } else if (typeof opts.temperature === 'number' && Number.isFinite(opts.temperature)) {
    generationConfig.temperature = Math.min(2, Math.max(0, opts.temperature));
  } else {
    generationConfig.temperature = safeAction === 'roadmap'
      ? 0.2
      : (safeAction === 'goal_complete' ? 0.3 : (safeAction === 'tasks_skeleton' ? 0 : (safeAction === 'task_detail' ? 0.25 : 0.7)));
  }

  if (!Number.isFinite(generationConfig.topP)) {
    if (typeof opts.topP === 'number' && Number.isFinite(opts.topP)) {
      generationConfig.topP = Math.min(1, Math.max(0, opts.topP));
    } else if (safeAction === 'tasks_skeleton') {
      generationConfig.topP = 0.1;
    } else if (safeAction === 'goal_complete') {
      generationConfig.topP = 0.8;
    } else {
      generationConfig.topP = 1;
    }
  }

  if (safeAction !== 'roadmap' && typeof opts.responseMimeType === 'string' && opts.responseMimeType.length <= 120) {
    if (OPENAI_ALLOWED_RESPONSE_MIME_TYPES.has(opts.responseMimeType)) {
      generationConfig.responseMimeType = opts.responseMimeType;
    } else {
      warnings.push(`unsupported responseMimeType dropped: ${opts.responseMimeType}`);
    }
  }

  const responseSchema = opts.responseSchema || opts.responseJsonSchema;
  if (
    safeAction !== 'roadmap'
    && responseSchema
    && typeof responseSchema === 'object'
    && !Array.isArray(responseSchema)
  ) {
    generationConfig.responseSchema = sanitizeResponseSchemaNode(responseSchema);
  }
  return { generationConfig, warnings };
}

function validateOpenAIRequestPayload({ model, fullPrompt, generationConfig, action, actionConfig }) {
  const errors = [];
  if (typeof model !== 'string' || !model.trim()) {
    errors.push('model is required');
  }
  if (typeof fullPrompt !== 'string' || !fullPrompt.trim()) {
    errors.push('prompt must be non-empty');
  }
  if (!generationConfig || typeof generationConfig !== 'object' || Array.isArray(generationConfig)) {
    errors.push('generationConfig must be an object');
    return { valid: false, errors };
  }
  const unknownKeys = Object.keys(generationConfig).filter((key) => !OPENAI_ALLOWED_CONFIG_KEYS.has(key));
  if (unknownKeys.length) {
    errors.push(`unsupported generationConfig keys: ${unknownKeys.join(',')}`);
  }
  if (!Number.isInteger(generationConfig.maxOutputTokens)) {
    errors.push('generationConfig.maxOutputTokens must be an integer');
  } else if (generationConfig.maxOutputTokens < 1 || generationConfig.maxOutputTokens > 8192) {
    errors.push('generationConfig.maxOutputTokens out of range');
  } else {
    const cap = Math.max(1, Math.floor(Number(actionConfig?.maxCompletionTokens || 8192)));
    const guardCap = applyActionTokenGuard(action, cap);
    const maxAllowedTokens = Math.min(cap, guardCap);
    if (generationConfig.maxOutputTokens > maxAllowedTokens) {
      errors.push(`${action || 'chat'} maxOutputTokens must be <= ${maxAllowedTokens}`);
    }
  }
  if (generationConfig.temperature !== undefined && (!Number.isFinite(generationConfig.temperature) || generationConfig.temperature < 0 || generationConfig.temperature > 2)) {
    errors.push('generationConfig.temperature must be 0-2');
  }
  if (generationConfig.topP !== undefined && (!Number.isFinite(generationConfig.topP) || generationConfig.topP < 0 || generationConfig.topP > 1)) {
    errors.push('generationConfig.topP must be 0-1');
  }
  if (generationConfig.reasoningEffort !== undefined && !['minimal', 'low', 'medium', 'high'].includes(String(generationConfig.reasoningEffort))) {
    errors.push('generationConfig.reasoningEffort is invalid');
  }
  if (generationConfig.responseMimeType !== undefined && !OPENAI_ALLOWED_RESPONSE_MIME_TYPES.has(generationConfig.responseMimeType)) {
    errors.push('generationConfig.responseMimeType is invalid');
  }
  if (
    generationConfig.responseSchema !== undefined
    && (
      typeof generationConfig.responseSchema !== 'object'
      || generationConfig.responseSchema === null
      || Array.isArray(generationConfig.responseSchema)
    )
  ) {
    errors.push('generationConfig.responseSchema must be an object');
  }
  return { valid: errors.length === 0, errors };
}

function guessLikelyInvalidField(errorMessage) {
  const msg = String(errorMessage || '').toLowerCase();
  if (!msg) return '';
  if (msg.includes('contents')) return 'contents';
  if (msg.includes('parts')) return 'contents.parts';
  if (msg.includes('role')) return 'contents.role';
  if (msg.includes('maxoutputtokens')) return 'generationConfig.maxOutputTokens';
  if (msg.includes('temperature')) return 'generationConfig.temperature';
  if (msg.includes('topp')) return 'generationConfig.topP';
  if (msg.includes('responsemimetype')) return 'generationConfig.responseMimeType';
  if (msg.includes('responseschema') || msg.includes('responsejsonschema')) return 'generationConfig.responseSchema';
  if (msg.includes('max_tokens')) return 'max_completion_tokens';
  if (msg.includes('model')) return 'model';
  return '';
}

async function callOpenAI({ action, model, fullPrompt, generationConfig, cacheKey }) {
  const effectiveAction = normalizeAIAction(action);
  const effectiveModel = model || OPENAI_MODEL;
  const cachedResponse = getOpenAIResponseCache(cacheKey);
  if (cachedResponse) {
    const cacheUsage = buildOpenAIUsageLogFields({
      model: effectiveModel,
      usage: cachedResponse.usage || cachedResponse.usageMetrics || {},
      cacheHit: true,
    });
    logInfo({
      area: 'openai',
      module: 'backend/server.js',
      function: 'api/openai/generate',
      action: 'cache_hit',
      model: effectiveModel,
      cacheKey: String(cacheKey || '').slice(0, 32),
      cacheHit: true,
      upstreamStatus: 200,
      finishReason: String(cachedResponse.finishReason || ''),
      ...cacheUsage,
    });
    return {
      ...cachedResponse,
      cacheHit: true,
      timedOut: false,
      upstreamStatus: 200,
      upstreamErrorCode: '',
      upstreamErrorMessage: '',
      upstreamErrorDetails: null,
    };
  }

  const controller = new AbortController();
  const timeoutMs = usesCompletionTokenLimit(effectiveModel) ? 45000 : 20000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const payload = buildOpenAIPayload({ model: effectiveModel, fullPrompt, generationConfig });
  try {
    const upstream = await fetch(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }
    );

    const rawBody = await upstream.text();
    let data = {};
    let parseFailed = false;
    if (rawBody) {
      try {
        data = JSON.parse(rawBody);
      } catch (_error) {
        parseFailed = true;
      }
    }

    const choice = data?.choices?.[0];
    const text = choice?.message?.content || '';
    const finishReason = choice?.finish_reason || '';
    const upstreamErrorCode = data?.error?.type || data?.error?.code || '';
    const upstreamErrorMessage = data?.error?.message || '';
    const upstreamErrorDetails = data?.error?.param || null;
    const unsupportedMaxTokens = upstream.status === 400 && /unsupported parameter.*max_tokens/i.test(upstreamErrorMessage);
    const success = upstream.ok && !data?.error && !parseFailed;
    const usageLogFields = buildOpenAIUsageLogFields({
      model: effectiveModel,
      usage: data?.usage || {},
      cacheHit: false,
    });
    logInfo({
      area: 'openai',
      module: 'backend/server.js',
      function: 'api/openai/generate',
      action: 'usage_snapshot',
      model: effectiveModel,
      cacheKey: String(cacheKey || '').slice(0, 32),
      upstreamStatus: upstream.status,
      upstreamErrorCode: upstreamErrorCode ? String(upstreamErrorCode) : '',
      finishReason,
      parseFailed,
      cacheHit: false,
      ...usageLogFields,
    });

    const response = {
      success,
      parseFailed,
      timedOut: false,
      upstreamStatus: upstream.status,
      upstreamErrorCode: upstreamErrorCode ? String(upstreamErrorCode) : '',
      upstreamErrorMessage: upstreamErrorMessage ? String(upstreamErrorMessage) : '',
      upstreamErrorDetails,
      unsupportedMaxTokens,
      finishReason,
      text: text || '',
      payloadForLogs: safePayloadForLogs(payload),
      usage: usageLogFields.usage,
      usageMetrics: usageLogFields.usage,
      estimatedCostUsd: usageLogFields.estimatedCostUsd,
      cacheHit: false,
    };

    if (success && response.text.trim()) {
      setOpenAIResponseCache(cacheKey, response);
    }

    return response;
  } catch (error) {
    if (error?.name === 'AbortError') {
      return {
        success: false,
        parseFailed: false,
        timedOut: true,
        upstreamStatus: 0,
        upstreamErrorCode: '',
        upstreamErrorMessage: '',
        upstreamErrorDetails: null,
        finishReason: '',
        text: '',
        payloadForLogs: safePayloadForLogs(payload),
        cacheHit: false,
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function logAIRequest(fields) {
  const payload = {
    area: 'openai',
    module: 'backend/server.js',
    function: 'api/openai/generate',
    ...fields,
  };
  if (fields?.logType === 'attempt' || fields?.logType === 'attempt_start') {
    if (fields?.logType === 'attempt_start') {
      logDebug(payload);
      return;
    }
    const isFailure = Boolean(fields.upstreamErrorCode || fields.finishReason === 'MAX_TOKENS');
    if (isFailure) {
      logWarn(payload);
      return;
    }
    logDebug(payload);
    return;
  }
  if (fields?.logType === 'final_failure' || fields?.logType === 'internal_error') {
    logError(payload);
    return;
  }
  if (fields?.logType === 'validation') {
    logWarn(payload);
    return;
  }
  if (fields?.logType === 'success') {
    logInfo(payload);
    return;
  }
  if (
    fields?.logType === 'truncated_response_detected' ||
    fields?.logType === 'truncated_response_usable' ||
    fields?.logType === 'truncated_response_invalid'
  ) {
    if (fields?.logType === 'truncated_response_invalid') {
      logWarn(payload);
      return;
    }
    logInfo(payload);
    return;
  }
  logInfo(payload);
}

const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

app.use(express.json({ limit: '100kb' }));
app.use(express.static(frontendDir));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/config', (_req, res) => {
  res.json({
    openaiConfigured: Boolean(OPENAI_API_KEY),
    paypalClientId: PAYPAL_CLIENT_ID,
    planPro: PLAN_PRO,
    planTeam: PLAN_TEAM,
    paypalSdkUrl: PAYPAL_SDK_URL,
    firebaseConfigured: FIREBASE_CONFIGURED,
    firebaseConfig: FIREBASE_CONFIGURED ? FIREBASE_WEB_CONFIG : null,
  });
});

app.post('/api/openai/generate', aiLimiter, async (req, res) => {
  const startedAt = Date.now();
  const requestId = createRequestId();
  const sessionId = String(req.get('x-session-id') || req.get('x-strive-session-id') || '').slice(0, 120);
  const baseLog = {
    logType: 'request',
    requestId,
    sessionId,
    userId: '',
    model: OPENAI_MODEL,
    route: req.originalUrl || '/api/openai/generate',
    clientRequestId: '',
    action: 'chat',
    promptChars: 0,
    systemChars: 0,
    totalChars: 0,
    promptPreview: '',
    approxInputTokens: 0,
    requestedMaxTokens: 0,
    effectiveMaxTokens: 0,
    trimmed: false,
    upstreamStatus: null,
    upstreamErrorCode: '',
    latencyMs: 0,
    finishReason: '',
    attempt: 0,
    chainAttempt: 0,
    retryAttempt: 0,
  };
  const reject = (httpStatus, payload, marker = 'VALIDATION') => {
    baseLog.logType = 'validation';
    baseLog.upstreamStatus = marker;
    baseLog.upstreamErrorCode = marker;
    baseLog.latencyMs = Date.now() - startedAt;
    logAIRequest(baseLog);
    const safePayload = { ...payload };
    safePayload.requestId = requestId;
    if (!safePayload.code && httpStatus === 400) {
      safePayload.code = 'bad_request';
    }
    return res.status(httpStatus).json(safePayload);
  };
  let roadmapFingerprint = '';
  try {
    const { prompt, systemCtx = '', maxTokens = 1000, opts = {}, action = 'chat' } = req.body || {};
    const safeAction = normalizeAIAction(action);
    baseLog.action = safeAction || 'chat';
    baseLog.logType = 'request_received';
    const clientRequestId = String(opts?.clientRequestId || '').trim().slice(0, 120);
    const contextFields = Array.isArray(opts?.contextFields)
      ? opts.contextFields.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 24)
      : [];
    const missingContextFields = Array.isArray(opts?.missingContextFields)
      ? opts.missingContextFields.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 24)
      : [];
    const userId = String(opts?.userId || req.get('x-user-id') || '').trim().slice(0, 120);
    Object.assign(
      baseLog,
      createRequestTrace({
        requestId,
        sessionId,
        userId,
        route: req.originalUrl || '/api/openai/generate',
        clientRequestId,
      })
    );
    const actionRuntimePreview = resolveActionGenerationConfig({ action: safeAction, requestedMaxTokens: maxTokens, opts });
    baseLog.model = actionRuntimePreview.model;
    logAIRequest(baseLog);

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return reject(400, { error: 'Invalid request body: "prompt" must be a non-empty string.' });
    }
    if (typeof systemCtx !== 'string') {
      return reject(400, { error: 'Invalid request body: "systemCtx" must be a string.' });
    }
    if (typeof maxTokens !== 'number' || !Number.isFinite(maxTokens)) {
      return reject(400, { error: 'Invalid request body: "maxTokens" must be a number.' });
    }
    if (typeof opts !== 'object' || opts === null || Array.isArray(opts)) {
      return reject(400, { error: 'Invalid request body: "opts" must be an object.' });
    }
    if (!AI_ACTIONS.has(safeAction)) {
      return reject(400, { error: 'Invalid request body: unsupported "action".' });
    }

    if (!OPENAI_API_KEY) {
      return reject(503, { error: 'AI service is not configured.' }, 'CONFIG');
    }

    const requestedMaxTokens = Math.min(8192, Math.max(1, Math.floor(maxTokens)));
    const actionRuntimeConfig = resolveActionGenerationConfig({ action: safeAction, requestedMaxTokens, opts });
    const requestedRoadmapCount = safeAction === 'roadmap'
      ? extractRoadmapTargetCount(String(opts?.milestoneCount || opts?.roadmapMilestoneCount || ''), 0)
      : 0;
    const effectiveMaxTokens = actionRuntimeConfig.effectiveMaxTokens;
    const trimmedCtx = trimContextByAction(safeAction, prompt, systemCtx);
    const promptChars = trimmedCtx.prompt.length;
    const systemChars = trimmedCtx.systemCtx.length;
    const totalChars = promptChars + systemChars;

    baseLog.promptChars = promptChars;
    baseLog.systemChars = systemChars;
    baseLog.totalChars = totalChars;
    baseLog.promptPreview = trimmedCtx.prompt.length <= 700
      ? trimmedCtx.prompt
      : `${trimmedCtx.prompt.slice(0, 500)}\n...[truncated for logs]...\n${trimmedCtx.prompt.slice(-180)}`;
    baseLog.contextFields = contextFields;
    baseLog.missingContextFields = missingContextFields;
    baseLog.approxInputTokens = approxInputTokens(totalChars);
    baseLog.requestedMaxTokens = requestedMaxTokens;
    baseLog.effectiveMaxTokens = effectiveMaxTokens;
    baseLog.trimmed = trimmedCtx.trimmed;
    baseLog.model = actionRuntimeConfig.model;
    baseLog.logType = 'prompt_prepared';
    logAIRequest(baseLog);

    if (safeAction === 'roadmap') {
      roadmapFingerprint = buildRoadmapFingerprint({
        ip: req.ip,
        prompt: trimmedCtx.prompt,
        systemCtx: trimmedCtx.systemCtx,
        requestedMaxTokens,
        clientRequestId,
      });
      const alreadyInFlight = roadmapInFlightByFingerprint.get(roadmapFingerprint);
      if (alreadyInFlight) {
        baseLog.upstreamStatus = 'DUPLICATE_BLOCKED';
        baseLog.upstreamErrorCode = 'DUPLICATE_BLOCKED';
        baseLog.latencyMs = Date.now() - startedAt;
        logAIRequest(baseLog);
        return res.status(409).json({
          error: 'Roadmap generation is already running. Please wait for the current request to finish.',
          code: 'duplicate_request_blocked',
          retryable: true,
          requestId,
          blockedByRequestId: alreadyInFlight,
        });
      }
      roadmapInFlightByFingerprint.set(roadmapFingerprint, requestId);
    }

    if (!trimmedCtx.prompt.trim()) {
      return reject(400, { error: 'Prompt became empty after trimming.' });
    }

    const { generationConfig, warnings: configWarnings } = sanitizeGenerationConfig({
      opts,
      action: safeAction,
      effectiveMaxTokens,
      actionConfig: actionRuntimeConfig,
    });
    if (configWarnings.length) {
      logAIRequest({
        ...baseLog,
        logType: 'validation',
        upstreamStatus: 'CONFIG_SANITIZED',
        upstreamErrorCode: 'CONFIG_SANITIZED',
        validationWarnings: configWarnings,
        latencyMs: Date.now() - startedAt,
      });
    }

    const attempts = [
      {
        maxTokens: effectiveMaxTokens,
        prompt: trimmedCtx.prompt,
        systemCtx: trimmedCtx.systemCtx,
      },
    ];
    if (safeAction === 'roadmap') {
      attempts.push({
        maxTokens: Math.max(900, Math.min(1000, effectiveMaxTokens - 200)),
        prompt: trimmedCtx.prompt,
        systemCtx: trimmedCtx.systemCtx,
        compactRetry: true,
        compactRoadmapCount: requestedRoadmapCount,
      });
    }
    if (safeAction === 'tasks' && effectiveMaxTokens > 1000) {
      attempts.push({
        maxTokens: Math.max(900, Math.min(1000, effectiveMaxTokens - 120)),
        prompt: trimmedCtx.prompt,
        systemCtx: trimmedCtx.systemCtx,
      });
    }
    if (safeAction === 'task_detail' && effectiveMaxTokens > 950) {
      attempts.push({
        maxTokens: Math.max(850, Math.min(950, effectiveMaxTokens - 100)),
        prompt: trimmedCtx.prompt,
        systemCtx: trimmedCtx.systemCtx,
      });
    }
    if (safeAction === 'chat' && effectiveMaxTokens > 800) {
      attempts.push({
        maxTokens: Math.max(650, Math.min(800, effectiveMaxTokens - 140)),
        prompt: trimmedCtx.prompt,
        systemCtx: trimmedCtx.systemCtx,
        compactRetry: true,
      });
    }
    const retryBackoffMs = TRANSIENT_RETRY_BACKOFF_MS;

    let lastFailure = null;
    let providerAttempt = 0;
    let lastChainAttempt = 0;
    let lastAttemptMaxTokens = effectiveMaxTokens;
    let lastRetryAttempt = 0;
    let lastChatSalvage = null;
    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
      const attempt = attempts[attemptIndex];
      lastChainAttempt = attemptIndex + 1;
      lastAttemptMaxTokens = attempt.maxTokens;
      generationConfig.maxOutputTokens = attempt.maxTokens;
      baseLog.effectiveMaxTokens = attempt.maxTokens;
      const attemptPrompt = safeAction === 'roadmap' && attemptIndex > 0
        ? compactRoadmapPrompt(trimmedCtx.prompt, trimmedCtx.systemCtx, requestedRoadmapCount)
        : safeAction === 'task_detail' && attemptIndex > 0
          ? compactTaskDetailPrompt(trimmedCtx.prompt, trimmedCtx.systemCtx)
          : safeAction === 'chat' && attemptIndex > 0
            ? compactChatPrompt(trimmedCtx.prompt, trimmedCtx.systemCtx)
        : { prompt: attempt.prompt, systemCtx: attempt.systemCtx };
      const fullPrompt = attemptPrompt.systemCtx ? `${attemptPrompt.systemCtx}\n\n---\n\n${attemptPrompt.prompt}` : attemptPrompt.prompt;
      for (let retryIndex = 0; retryIndex <= retryBackoffMs.length; retryIndex += 1) {
        providerAttempt += 1;
        logAIRequest({
          ...baseLog,
          logType: 'attempt_start',
          attempt: providerAttempt,
          chainAttempt: attemptIndex + 1,
          retryAttempt: retryIndex,
          upstreamStatus: 'REQUEST_STARTED',
          upstreamErrorCode: '',
          finishReason: '',
          latencyMs: 0,
        });
        const attemptStartedAt = Date.now();
        const validation = validateOpenAIRequestPayload({
          model: actionRuntimeConfig.model,
          fullPrompt,
          generationConfig,
          action: safeAction,
          actionConfig: actionRuntimeConfig,
        });
        if (!validation.valid) {
          const failedAt = Date.now();
          logAIRequest({
            ...baseLog,
            logType: 'validation',
            upstreamStatus: 'VALIDATION_ERROR',
            upstreamErrorCode: 'VALIDATION_ERROR',
            error: 'OpenAI request validation failed before API call.',
            validationErrors: validation.errors,
            promptPreview: fullPrompt.slice(0, 200),
            generationConfig,
            model: actionRuntimeConfig.model,
            attempt: providerAttempt,
            chainAttempt: attemptIndex + 1,
            retryAttempt: retryIndex,
            latencyMs: failedAt - attemptStartedAt,
          });
          lastFailure = {
            success: false,
            parseFailed: false,
            timedOut: false,
            upstreamStatus: 400,
            upstreamErrorCode: 'INVALID_ARGUMENT',
            upstreamErrorMessage: validation.errors.join('; '),
            upstreamErrorDetails: null,
            finishReason: '',
            text: '',
            code: 'BAD_REQUEST',
            httpStatus: 400,
          };
          break;
        }
        const cacheKey = buildOpenAICacheKey({
          action: safeAction,
          model: actionRuntimeConfig.model,
          fullPrompt,
          systemCtx: attemptPrompt.systemCtx,
          generationConfig,
        });
        const result = await callOpenAI({
          action: safeAction,
          model: actionRuntimeConfig.model,
          fullPrompt,
          generationConfig,
          cacheKey,
        });
        if (result.unsupportedMaxTokens) {
          logWarn({
            ...baseLog,
            logType: 'validation',
            upstreamStatus: result.upstreamStatus,
            upstreamErrorCode: result.upstreamErrorCode || 'INVALID_ARGUMENT',
            upstreamErrorMessage: result.upstreamErrorMessage || '',
            invalidFieldHint: 'max_completion_tokens',
            modelRequires: 'max_completion_tokens',
            note: 'OpenAI model rejected max_tokens. This model family requires max_completion_tokens.',
            latencyMs: Date.now() - attemptStartedAt,
            attempt: providerAttempt,
            chainAttempt: attemptIndex + 1,
            retryAttempt: retryIndex,
          });
        }
        const roadmapCountHint = safeAction === 'roadmap'
          ? (requestedRoadmapCount || extractRoadmapTargetCount(trimmedCtx.prompt, 0))
          : 0;
        const roadmapRawText = String(result.text || '');
        const roadmapStructured = safeAction === 'roadmap'
          ? salvageRoadmapSkeleton(roadmapRawText, roadmapCountHint || 0)
          : null;
        if (safeAction === 'roadmap') {
          logAIRequest({
            ...baseLog,
            logType: 'roadmap_parse_snapshot',
            upstreamStatus: result.timedOut ? 'TIMEOUT' : result.upstreamStatus,
            upstreamErrorCode: result.upstreamErrorCode || '',
            finishReason: result.finishReason || '',
            attempt: providerAttempt,
            chainAttempt: attemptIndex + 1,
            retryAttempt: retryIndex,
            latencyMs: Date.now() - attemptStartedAt,
            rawResponseText: roadmapRawText.slice(0, 1200),
            rawResponseLength: roadmapRawText.length,
            parsedRoadmap: roadmapStructured ? {
              usable: Boolean(roadmapStructured.usable),
              stageCount: Number(roadmapStructured.stageCount) || 0,
              fallbackUsed: !roadmapStructured.usable,
              stages: Array.isArray(roadmapStructured.stages)
                ? roadmapStructured.stages.map((stage, index) => ({
                    week: stage?.week || index + 1,
                    title: String(stage?.title || ''),
                    titleSource: String(stage?.titleSource || stage?.source || ''),
                    titleSourceReason: String(stage?.titleSourceReason || ''),
                    fallbackUsed: Boolean(stage?.fallbackUsed),
                    objective: String(stage?.objective || ''),
                    outcome: String(stage?.outcome || ''),
                    target_date: String(stage?.target_date || ''),
                  }))
                : [],
            } : null,
          });
        }
        if (safeAction === 'roadmap' && roadmapRawText.trim()) {
          const fallbackStages = buildFallbackRoadmapStages(roadmapCountHint || 3);
          const finalizedRoadmap = roadmapStructured && roadmapStructured.usable
            ? roadmapStructured
            : {
                usable: true,
                repairedText: JSON.stringify({ stages: fallbackStages }, null, 2),
                stageCount: fallbackStages.length,
                stages: fallbackStages,
              };
          logAIRequest({
            ...baseLog,
            logType: result.success ? 'success' : 'truncated_response_usable',
            upstreamStatus: result.timedOut ? 'TIMEOUT' : result.upstreamStatus,
            upstreamErrorCode: result.upstreamErrorCode || '',
            finishReason: result.finishReason || '',
            attempt: providerAttempt,
            chainAttempt: attemptIndex + 1,
            retryAttempt: retryIndex,
            latencyMs: Date.now() - startedAt,
            finalStageCount: finalizedRoadmap.stageCount,
            fallbackUsed: Boolean(finalizedRoadmap !== roadmapStructured),
            finalStages: Array.isArray(finalizedRoadmap.stages)
              ? finalizedRoadmap.stages.map((stage, index) => ({
                  week: stage?.week || index + 1,
                  title: String(stage?.title || ''),
                  titleSource: String(stage?.titleSource || stage?.source || ''),
                  titleSourceReason: String(stage?.titleSourceReason || ''),
                  fallbackUsed: Boolean(stage?.fallbackUsed),
                  objective: String(stage?.objective || ''),
                  outcome: String(stage?.outcome || ''),
                  target_date: String(stage?.target_date || ''),
                }))
              : [],
          });
          baseLog.logType = 'success';
          baseLog.upstreamStatus = result.timedOut ? 'TIMEOUT' : result.upstreamStatus;
          baseLog.upstreamErrorCode = result.upstreamErrorCode;
          baseLog.finishReason = result.finishReason;
          baseLog.latencyMs = Date.now() - startedAt;
          baseLog.attempt = providerAttempt;
          baseLog.chainAttempt = attemptIndex + 1;
          baseLog.retryAttempt = retryIndex;
          lastRetryAttempt = retryIndex;
          logAIRequest(baseLog);
          return res.json({
            text: finalizedRoadmap.repairedText,
            stages: finalizedRoadmap.stages || [],
            stageCount: finalizedRoadmap.stageCount || 0,
            finishReason: result.finishReason || '',
            requestId,
            model: actionRuntimeConfig.model,
            status: result.success ? 'success' : 'degraded_success',
            degraded: !result.success,
            truncated: Boolean(result.finishReason === 'MAX_TOKENS'),
          });
        }
        if (result.success && roadmapRawText.trim()) {
          if (result.finishReason === 'MAX_TOKENS') {
            logAIRequest({
              ...baseLog,
              logType: 'truncated_response_detected',
              upstreamStatus: result.upstreamStatus,
              upstreamErrorCode: result.upstreamErrorCode || 'MAX_TOKENS',
              finishReason: result.finishReason || '',
              attempt: providerAttempt,
              chainAttempt: attemptIndex + 1,
              retryAttempt: retryIndex,
              latencyMs: Date.now() - attemptStartedAt,
            });
            if (safeAction === 'tasks') {
              const salvagedTasks = salvagePlainTextTasks(result.text || '');
              if (salvagedTasks.usable) {
                logAIRequest({
                  ...baseLog,
                  logType: 'truncated_response_usable',
                  upstreamStatus: result.upstreamStatus,
                  upstreamErrorCode: result.upstreamErrorCode || 'MAX_TOKENS',
                  finishReason: result.finishReason || '',
                  attempt: providerAttempt,
                  chainAttempt: attemptIndex + 1,
                  retryAttempt: retryIndex,
                  latencyMs: Date.now() - attemptStartedAt,
                  salvagedTaskCount: salvagedTasks.taskCount,
                });
                baseLog.logType = 'success';
                baseLog.upstreamStatus = result.upstreamStatus;
                baseLog.upstreamErrorCode = result.upstreamErrorCode;
                baseLog.finishReason = result.finishReason;
                baseLog.latencyMs = Date.now() - startedAt;
                baseLog.attempt = providerAttempt;
                baseLog.chainAttempt = attemptIndex + 1;
                baseLog.retryAttempt = retryIndex;
                lastRetryAttempt = retryIndex;
                logAIRequest(baseLog);
                return res.json({
                  text: salvagedTasks.repairedText,
                  finishReason: result.finishReason || '',
                  requestId,
                  status: 'degraded_success',
                  degraded: true,
                  truncated: true,
                });
              }
            }
            if (safeAction === 'tasks_skeleton') {
              const salvagedSkeleton = salvageTaskSkeleton(result.text || '');
              if (salvagedSkeleton.usable) {
                logAIRequest({
                  ...baseLog,
                  logType: 'truncated_response_usable',
                  upstreamStatus: result.upstreamStatus,
                  upstreamErrorCode: result.upstreamErrorCode || 'MAX_TOKENS',
                  finishReason: result.finishReason || '',
                  attempt: providerAttempt,
                  chainAttempt: attemptIndex + 1,
                  retryAttempt: retryIndex,
                  latencyMs: Date.now() - attemptStartedAt,
                  salvagedTaskCount: salvagedSkeleton.taskCount,
                });
                baseLog.logType = 'success';
                baseLog.upstreamStatus = result.upstreamStatus;
                baseLog.upstreamErrorCode = result.upstreamErrorCode;
                baseLog.finishReason = result.finishReason;
                baseLog.latencyMs = Date.now() - startedAt;
                baseLog.attempt = providerAttempt;
                baseLog.chainAttempt = attemptIndex + 1;
                baseLog.retryAttempt = retryIndex;
                lastRetryAttempt = retryIndex;
                logAIRequest(baseLog);
                return res.json({
                  text: salvagedSkeleton.repairedText,
                  finishReason: result.finishReason || '',
                  requestId,
                  status: 'degraded_success',
                  degraded: true,
                  truncated: true,
                });
              }
            }
            if (safeAction === 'task_detail') {
              const salvagedDetail = salvageTaskDetail(result.text || '');
              if (salvagedDetail.usable) {
                logAIRequest({
                  ...baseLog,
                  logType: 'truncated_response_usable',
                  upstreamStatus: result.upstreamStatus,
                  upstreamErrorCode: result.upstreamErrorCode || 'MAX_TOKENS',
                  finishReason: result.finishReason || '',
                  attempt: providerAttempt,
                  chainAttempt: attemptIndex + 1,
                  retryAttempt: retryIndex,
                  latencyMs: Date.now() - attemptStartedAt,
                });
                baseLog.logType = 'success';
                baseLog.upstreamStatus = result.upstreamStatus;
                baseLog.upstreamErrorCode = result.upstreamErrorCode;
                baseLog.finishReason = result.finishReason;
                baseLog.latencyMs = Date.now() - startedAt;
                baseLog.attempt = providerAttempt;
                baseLog.chainAttempt = attemptIndex + 1;
                baseLog.retryAttempt = retryIndex;
                lastRetryAttempt = retryIndex;
                logAIRequest(baseLog);
                return res.json({
                  text: salvagedDetail.repairedText,
                  finishReason: result.finishReason || '',
                  requestId,
                  status: 'degraded_success',
                  degraded: true,
                  truncated: true,
                });
              }
              logAIRequest({
                ...baseLog,
                logType: 'truncated_response_invalid',
                upstreamStatus: result.upstreamStatus,
                upstreamErrorCode: result.upstreamErrorCode || 'MAX_TOKENS',
                finishReason: result.finishReason || '',
                attempt: providerAttempt,
                chainAttempt: attemptIndex + 1,
                retryAttempt: retryIndex,
                latencyMs: Date.now() - attemptStartedAt,
              });
              lastFailure = { ...result, ...classifyFailure(result) };
              break;
            }
            if (safeAction === 'roadmap') {
              const salvagedRoadmap = roadmapStructured && roadmapStructured.usable
                ? roadmapStructured
                : salvageRoadmapSkeleton(result.text || '', roadmapCountHint || 0);
              if (salvagedRoadmap.usable) {
                logAIRequest({
                  ...baseLog,
                  logType: 'truncated_response_usable',
                  upstreamStatus: result.upstreamStatus,
                  upstreamErrorCode: result.upstreamErrorCode || 'MAX_TOKENS',
                  finishReason: result.finishReason || '',
                  attempt: providerAttempt,
                  chainAttempt: attemptIndex + 1,
                  retryAttempt: retryIndex,
                  latencyMs: Date.now() - attemptStartedAt,
                  salvagedStageCount: salvagedRoadmap.stageCount,
                });
                baseLog.logType = 'success';
                baseLog.upstreamStatus = result.upstreamStatus;
                baseLog.upstreamErrorCode = result.upstreamErrorCode;
                baseLog.finishReason = result.finishReason;
                baseLog.latencyMs = Date.now() - startedAt;
                baseLog.attempt = providerAttempt;
                baseLog.chainAttempt = attemptIndex + 1;
                baseLog.retryAttempt = retryIndex;
                lastRetryAttempt = retryIndex;
                logAIRequest(baseLog);
                return res.json({
                  text: salvagedRoadmap.repairedText,
                  stages: salvagedRoadmap.stages || [],
                  stageCount: salvagedRoadmap.stageCount || 0,
                  finishReason: result.finishReason || '',
                  requestId,
                  model: actionRuntimeConfig.model,
                  status: 'degraded_success',
                  degraded: true,
                  truncated: true,
                });
              }
            }
            if (safeAction === 'chat') {
              const salvagedChat = salvageChatResponse(result.text || '');
              lastChatSalvage = salvagedChat.usable ? salvagedChat : lastChatSalvage;
              if (salvagedChat.usable) {
                logAIRequest({
                  ...baseLog,
                  logType: 'truncated_response_usable',
                  upstreamStatus: result.upstreamStatus,
                  upstreamErrorCode: result.upstreamErrorCode || 'MAX_TOKENS',
                  finishReason: result.finishReason || '',
                  attempt: providerAttempt,
                  chainAttempt: attemptIndex + 1,
                  retryAttempt: retryIndex,
                  latencyMs: Date.now() - attemptStartedAt,
                });
                baseLog.logType = 'success';
                baseLog.upstreamStatus = result.upstreamStatus;
                baseLog.upstreamErrorCode = result.upstreamErrorCode;
                baseLog.finishReason = result.finishReason;
                baseLog.latencyMs = Date.now() - startedAt;
                baseLog.attempt = providerAttempt;
                baseLog.chainAttempt = attemptIndex + 1;
                baseLog.retryAttempt = retryIndex;
                lastRetryAttempt = retryIndex;
                logAIRequest(baseLog);
                return res.json({
                  text: salvagedChat.repairedText,
                  finishReason: result.finishReason || '',
                  requestId,
                  status: 'degraded_success',
                  degraded: true,
                  truncated: true,
                });
              }
              lastFailure = { ...result, ...classifyFailure(result) };
              break;
            }
            if (!TASK_GENERATION_ACTIONS.has(safeAction) && safeAction !== 'chat') {
              const repaired = parseJsonWithRepair(result.text || '');
              if (repaired.usable) {
                logAIRequest({
                  ...baseLog,
                  logType: 'truncated_response_usable',
                  upstreamStatus: result.upstreamStatus,
                  upstreamErrorCode: result.upstreamErrorCode || 'MAX_TOKENS',
                  finishReason: result.finishReason || '',
                  attempt: providerAttempt,
                  chainAttempt: attemptIndex + 1,
                  retryAttempt: retryIndex,
                  latencyMs: Date.now() - attemptStartedAt,
                });
                baseLog.logType = 'success';
                baseLog.upstreamStatus = result.upstreamStatus;
                baseLog.upstreamErrorCode = result.upstreamErrorCode;
                baseLog.finishReason = result.finishReason;
                baseLog.latencyMs = Date.now() - startedAt;
                baseLog.attempt = providerAttempt;
                baseLog.chainAttempt = attemptIndex + 1;
                baseLog.retryAttempt = retryIndex;
                lastRetryAttempt = retryIndex;
                logAIRequest(baseLog);
                return res.json({
                  text: repaired.repairedText || result.text || '',
                  finishReason: result.finishReason || '',
                  requestId,
                  status: 'degraded_success',
                  degraded: true,
                  truncated: true,
                });
              }
            }
            logAIRequest({
              ...baseLog,
              logType: 'truncated_response_invalid',
              upstreamStatus: result.upstreamStatus,
              upstreamErrorCode: result.upstreamErrorCode || 'MAX_TOKENS',
              finishReason: result.finishReason || '',
              attempt: providerAttempt,
              chainAttempt: attemptIndex + 1,
              retryAttempt: retryIndex,
              latencyMs: Date.now() - attemptStartedAt,
            });
            const failure = classifyFailure(result);
            lastFailure = { ...result, ...failure };
            lastRetryAttempt = retryIndex;
            break;
          }
          baseLog.logType = 'success';
          baseLog.upstreamStatus = result.upstreamStatus;
          baseLog.upstreamErrorCode = result.upstreamErrorCode;
          baseLog.finishReason = result.finishReason;
          baseLog.latencyMs = Date.now() - startedAt;
          baseLog.attempt = providerAttempt;
          baseLog.chainAttempt = attemptIndex + 1;
        baseLog.retryAttempt = retryIndex;
        lastRetryAttempt = retryIndex;
        logAIRequest(baseLog);
        return res.json({
          text: result.text || '',
          stages: roadmapStructured?.stages || [],
          stageCount: roadmapStructured?.stageCount || 0,
          finishReason: result.finishReason || '',
          requestId,
          model: actionRuntimeConfig.model,
        });
      }

        const failure = classifyFailure(result);
        lastFailure = { ...result, ...failure };
        lastRetryAttempt = retryIndex;
        const likelyInvalidField =
          failure.code === 'BAD_REQUEST'
            ? guessLikelyInvalidField(result.upstreamErrorMessage)
            : '';
        logAIRequest({
          ...baseLog,
          logType: 'attempt',
          upstreamStatus: result.timedOut ? 'TIMEOUT' : result.upstreamStatus,
          upstreamErrorCode: result.upstreamErrorCode || failure.code,
          upstreamErrorMessage: result.upstreamErrorMessage || '',
          upstreamErrorDetails: result.upstreamErrorDetails || null,
          model: actionRuntimeConfig.model,
          invalidFieldHint: likelyInvalidField,
          requestPayload: failure.code === 'BAD_REQUEST' ? result.payloadForLogs : undefined,
          finishReason: result.finishReason || '',
          latencyMs: Date.now() - attemptStartedAt,
          attempt: providerAttempt,
          chainAttempt: attemptIndex + 1,
          retryAttempt: retryIndex,
          effectiveMaxTokens: attempt.maxTokens,
        });

        if (safeAction === 'roadmap' && failure.code === 'RESPONSE_TRUNCATED') {
          const roadmapCountHint = requestedRoadmapCount || extractRoadmapTargetCount(trimmedCtx.prompt, 0);
          const salvagedRoadmap = salvageRoadmapSkeleton(result.text || '', roadmapCountHint || 0);
          if (salvagedRoadmap.usable) {
            logAIRequest({
              ...baseLog,
              logType: 'truncated_response_usable',
              upstreamStatus: result.timedOut ? 'TIMEOUT' : result.upstreamStatus,
              upstreamErrorCode: result.upstreamErrorCode || failure.code,
              finishReason: result.finishReason || '',
              attempt: providerAttempt,
              chainAttempt: attemptIndex + 1,
              retryAttempt: retryIndex,
              latencyMs: Date.now() - attemptStartedAt,
              salvagedStageCount: salvagedRoadmap.stageCount,
            });
            baseLog.logType = 'success';
            baseLog.upstreamStatus = result.timedOut ? 'TIMEOUT' : result.upstreamStatus;
            baseLog.upstreamErrorCode = result.upstreamErrorCode || failure.code;
            baseLog.finishReason = result.finishReason || '';
            baseLog.latencyMs = Date.now() - startedAt;
            baseLog.attempt = providerAttempt;
            baseLog.chainAttempt = attemptIndex + 1;
            baseLog.retryAttempt = retryIndex;
            logAIRequest(baseLog);
            return res.json({
              text: salvagedRoadmap.repairedText,
              finishReason: result.finishReason || '',
              requestId,
              model: actionRuntimeConfig.model,
              status: 'degraded_success',
              degraded: true,
              truncated: true,
            });
          }
        }
        if (safeAction === 'task_detail' && failure.code === 'RESPONSE_TRUNCATED') {
          const salvagedDetail = salvageTaskDetail(result.text || '');
          if (salvagedDetail.usable) {
            logAIRequest({
              ...baseLog,
              logType: 'truncated_response_usable',
              upstreamStatus: result.timedOut ? 'TIMEOUT' : result.upstreamStatus,
              upstreamErrorCode: result.upstreamErrorCode || failure.code,
              finishReason: result.finishReason || '',
              attempt: providerAttempt,
              chainAttempt: attemptIndex + 1,
              retryAttempt: retryIndex,
              latencyMs: Date.now() - attemptStartedAt,
            });
            baseLog.logType = 'success';
            baseLog.upstreamStatus = result.timedOut ? 'TIMEOUT' : result.upstreamStatus;
            baseLog.upstreamErrorCode = result.upstreamErrorCode || failure.code;
            baseLog.finishReason = result.finishReason || '';
            baseLog.latencyMs = Date.now() - startedAt;
            baseLog.attempt = providerAttempt;
            baseLog.chainAttempt = attemptIndex + 1;
            baseLog.retryAttempt = retryIndex;
            logAIRequest(baseLog);
            return res.json({
              text: salvagedDetail.repairedText,
              finishReason: result.finishReason || '',
              requestId,
              status: 'degraded_success',
              degraded: true,
              truncated: true,
            });
          }
          logAIRequest({
            ...baseLog,
            logType: 'truncated_response_invalid',
            upstreamStatus: result.timedOut ? 'TIMEOUT' : result.upstreamStatus,
            upstreamErrorCode: result.upstreamErrorCode || failure.code,
            finishReason: result.finishReason || '',
            attempt: providerAttempt,
            chainAttempt: attemptIndex + 1,
            retryAttempt: retryIndex,
            latencyMs: Date.now() - attemptStartedAt,
          });
          lastFailure = { ...result, ...classifyFailure(result) };
          break;
        }

        if (
          (safeAction === 'tasks' || safeAction === 'tasks_skeleton' || safeAction === 'task_detail') &&
          failure.code === 'RESPONSE_TRUNCATED' &&
          attemptIndex === 0
        ) {
          continue;
        }
        if (
          safeAction === 'roadmap' &&
          failure.code === 'RESPONSE_TRUNCATED' &&
          attemptIndex === 0
        ) {
          break;
        }
        if (!isRetryableFailureCode(failure.code) || retryIndex >= retryBackoffMs.length) {
          break;
        }
        await sleep(retryBackoffMs[retryIndex]);
      }

      if (lastFailure?.code === 'UPSTREAM_401_403' || lastFailure?.code === 'BAD_REQUEST') {
        break;
      }
      const firstChainWithFallback = attemptIndex === 0 && (safeAction === 'roadmap' || TASK_GENERATION_ACTIONS.has(safeAction));
      if (
        firstChainWithFallback &&
        lastFailure &&
        lastFailure.code !== 'RESPONSE_TRUNCATED' &&
        lastFailure.code !== 'PARSE_FAIL'
      ) {
        break;
      }
    }

    if (safeAction === 'chat' && lastChatSalvage?.usable) {
      logAIRequest({
        ...baseLog,
        logType: 'truncated_response_usable',
        upstreamStatus: lastFailure?.timedOut ? 'TIMEOUT' : lastFailure?.upstreamStatus || 0,
        upstreamErrorCode: lastFailure?.upstreamErrorCode || lastFailure?.code || 'MAX_TOKENS',
        finishReason: lastFailure?.finishReason || 'MAX_TOKENS',
        attempt: providerAttempt,
        chainAttempt: lastChainAttempt,
        retryAttempt: lastRetryAttempt,
        latencyMs: Date.now() - startedAt,
      });
      baseLog.logType = 'success';
      baseLog.upstreamStatus = lastFailure?.timedOut ? 'TIMEOUT' : lastFailure?.upstreamStatus || 0;
      baseLog.upstreamErrorCode = lastFailure?.upstreamErrorCode || lastFailure?.code || 'MAX_TOKENS';
      baseLog.finishReason = lastFailure?.finishReason || 'MAX_TOKENS';
      baseLog.latencyMs = Date.now() - startedAt;
      baseLog.attempt = providerAttempt;
      baseLog.chainAttempt = lastChainAttempt;
      baseLog.retryAttempt = lastRetryAttempt;
      logAIRequest(baseLog);
      return res.json({
        text: lastChatSalvage.repairedText,
        finishReason: lastFailure?.finishReason || 'MAX_TOKENS',
        requestId,
        status: 'degraded_success',
        degraded: true,
        truncated: true,
      });
    }

    if (safeAction === 'task_detail') {
      logAIRequest({
        ...baseLog,
        logType: 'final_failure',
        upstreamStatus: lastFailure?.timedOut ? 'TIMEOUT' : lastFailure?.upstreamStatus || 0,
        upstreamErrorCode: lastFailure?.upstreamErrorCode || lastFailure?.code || 'TASK_DETAIL_FAILED',
        finishReason: lastFailure?.finishReason || '',
        attempt: providerAttempt,
        chainAttempt: lastChainAttempt,
        retryAttempt: lastRetryAttempt,
        latencyMs: Date.now() - startedAt,
      });
      baseLog.logType = 'success';
      baseLog.upstreamStatus = lastFailure?.timedOut ? 'TIMEOUT' : lastFailure?.upstreamStatus || 0;
      baseLog.upstreamErrorCode = lastFailure?.upstreamErrorCode || lastFailure?.code || 'TASK_DETAIL_FAILED';
      baseLog.finishReason = lastFailure?.finishReason || '';
      baseLog.latencyMs = Date.now() - startedAt;
      baseLog.attempt = providerAttempt;
      baseLog.chainAttempt = lastChainAttempt;
      baseLog.retryAttempt = lastRetryAttempt;
      logAIRequest(baseLog);
      return res.status(502).json({
        error: 'Task detail generation failed. Please retry.',
        code: 'task_detail_generation_failed',
        retryable: true,
        requestId,
      });
    }

    // v2 deterministic fallback — returned when all AI attempts are exhausted
    if (V2_JSON_ACTIONS.has(safeAction) || V2_PLAINTEXT_ACTIONS.has(safeAction)) {
      const fallbackText = V2_JSON_ACTIONS.has(safeAction)
        ? JSON.stringify(buildV2Fallback(safeAction, trimmedCtx.prompt))
        : buildV2PlaintextFallback(safeAction, trimmedCtx.prompt);
      logAIRequest({
        ...baseLog,
        logType: 'fallback_used',
        upstreamStatus: lastFailure?.timedOut ? 'TIMEOUT' : (lastFailure?.upstreamStatus || 0),
        upstreamErrorCode: lastFailure?.upstreamErrorCode || lastFailure?.code || 'V2_FALLBACK',
        finishReason: '',
        attempt: providerAttempt,
        chainAttempt: lastChainAttempt,
        retryAttempt: lastRetryAttempt,
        latencyMs: Date.now() - startedAt,
        fallbackUsed: true,
      });
      baseLog.logType = 'success';
      baseLog.latencyMs = Date.now() - startedAt;
      baseLog.attempt = providerAttempt;
      baseLog.chainAttempt = lastChainAttempt;
      baseLog.retryAttempt = lastRetryAttempt;
      logAIRequest(baseLog);
      return res.json({
        text: fallbackText,
        finishReason: '',
        requestId,
        model: actionRuntimeConfig.model,
        status: 'fallback',
        fallbackUsed: true,
        degraded: true,
      });
    }

    const safeFailure = lastFailure || { code: 'UPSTREAM_5XX', httpStatus: 502, upstreamStatus: 0 };
    if (safeAction === 'chat' && safeFailure.code === 'RESPONSE_TRUNCATED' && String(lastChatSalvage?.repairedText || '').trim()) {
      return res.json({
        text: lastChatSalvage.repairedText,
        finishReason: safeFailure.finishReason || 'MAX_TOKENS',
        requestId,
        status: 'degraded_success',
        degraded: true,
        truncated: true,
      });
    }
    baseLog.logType = 'final_failure';
    baseLog.upstreamStatus = safeFailure.timedOut ? 'TIMEOUT' : safeFailure.upstreamStatus;
    baseLog.upstreamErrorCode = safeFailure.upstreamErrorCode || safeFailure.code;
    baseLog.upstreamErrorMessage = safeFailure.upstreamErrorMessage || '';
    baseLog.upstreamErrorDetails = safeFailure.upstreamErrorDetails || null;
    baseLog.invalidFieldHint = safeFailure.code === 'BAD_REQUEST'
      ? guessLikelyInvalidField(safeFailure.upstreamErrorMessage)
      : '';
    baseLog.requestPayload = safeFailure.code === 'BAD_REQUEST' ? safeFailure.payloadForLogs : undefined;
    baseLog.finishReason = safeFailure.finishReason || '';
    baseLog.latencyMs = Date.now() - startedAt;
    baseLog.attempt = providerAttempt;
    baseLog.chainAttempt = lastChainAttempt;
    baseLog.retryAttempt = lastRetryAttempt;
    baseLog.effectiveMaxTokens = lastAttemptMaxTokens;
    logAIRequest(baseLog);

    const payload = normalizeErrorPayload(safeAction, safeFailure);
    return res.status(safeFailure.httpStatus).json({
      error: payload.error,
      code: payload.code,
      retryable: payload.retryable,
      requestId,
    });
  } catch (error) {
    baseLog.logType = 'internal_error';
    baseLog.upstreamStatus = 'INTERNAL';
    baseLog.upstreamErrorCode = 'INTERNAL';
    baseLog.latencyMs = Date.now() - startedAt;
    const normalized = normalizeError(error);
    baseLog.errorCategory = normalized.category;
    baseLog.errorCode = normalized.code;
    baseLog.errorMessage = normalized.message;
    logAIRequest(baseLog);
    logError({
      area: 'backend',
      module: 'backend/server.js',
      function: 'api/openai/generate',
      action: 'unexpected_exception',
      requestId,
      sessionId,
      userId: baseLog.userId,
      errorCategory: normalized.category,
      errorCode: normalized.code,
      errorMessage: normalized.message,
      stack: normalized.stack,
    });
    return res.status(500).json({ error: 'Internal server error', code: 'invalid_response', retryable: false, requestId });
  } finally {
    if (roadmapFingerprint) {
      const activeRequestId = roadmapInFlightByFingerprint.get(roadmapFingerprint);
      if (activeRequestId === requestId) {
        roadmapInFlightByFingerprint.delete(roadmapFingerprint);
        logDebug({
          area: 'api',
          module: 'backend/server.js',
          function: 'api/openai/generate',
          action: 'duplicate_guard_released',
          requestId,
          sessionId,
          userId: baseLog.userId,
          route: baseLog.route,
        });
      }
    }
  }
});

// ── Telegram Integration ───────────────────────────────────────────────────
// Deep-link token flow (webhook-based, no polling).
// TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set in env.
// If absent, routes return 503; server still boots.

const TELEGRAM_BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN     || '';
const TELEGRAM_BOT_USERNAME  = (process.env.TELEGRAM_BOT_USERNAME  || '').replace(/^@/, '');
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const CRON_SECRET             = process.env.CRON_SECRET             || '';
const TELEGRAM_CONFIGURED     = Boolean(TELEGRAM_BOT_TOKEN);

// Link tokens live in memory (primary, fast) + Firestore (secondary, survives restarts).
// TTL: 15 minutes. Format: 32 URL-safe chars (A-Z a-z 0-9 _ -).
const LINK_TOKEN_TTL_MS = 15 * 60 * 1000;
// Map<token, { uid: string, expiresAt: number }>
const linkTokenStore = new Map();

function generateLinkToken() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  const bytes = crypto.randomBytes(32);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function pruneLinkTokens() {
  const now = Date.now();
  for (const [tok, entry] of linkTokenStore) {
    if (now > entry.expiresAt) linkTokenStore.delete(tok);
  }
}

function maskChatId(chatId) {
  const s = String(chatId || '');
  return s.length <= 4 ? '***' : `${s.slice(0, 4)}***`;
}

async function tgSend(method, body) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Telegram ${method} → ${resp.status}: ${errText.slice(0, 200)}`);
  }
  return resp.json();
}

function getFirestoreOrNull() {
  try {
    const adminApp = getFirebaseAdmin();
    if (!adminApp) return null;
    const admin = require('firebase-admin');
    return admin.firestore();
  } catch (_) {
    return null;
  }
}

// Core webhook logic extracted so the route handler can ack 200 first.
async function handleTelegramUpdate(update) {
  const message = update?.message;
  if (!message) return;

  const chatId   = message.chat?.id;
  const text     = (message.text || '').trim();
  const username = message.from?.username  || '';
  const firstName = message.from?.first_name || '';

  if (!chatId || !text) return;

  if (text === '/help' || text.startsWith('/help@')) {
    await tgSend('sendMessage', {
      chat_id: chatId,
      text: 'I send your daily StriveAI execution ping.\n\nTo connect your account, open StriveAI, go to Settings → Telegram, and tap "Connect".\n\nUse /stop to pause pings.',
    });
    return;
  }

  if (text === '/stop' || text.startsWith('/stop@')) {
    await tgSend('sendMessage', {
      chat_id: chatId,
      text: 'Pings paused. Reconnect any time in StriveAI settings.',
    });
    return;
  }

  if (!text.startsWith('/start')) return; // ignore all other messages

  const token = text.split(' ')[1] || '';

  if (!token) {
    await tgSend('sendMessage', {
      chat_id: chatId,
      text: 'To connect StriveAI, open the app, go to Settings → Telegram, and tap "Connect" to get a link.',
    });
    return;
  }

  // Look up token: memory first, then Firestore (handles server restart).
  let uid = null;
  const memEntry = linkTokenStore.get(token);
  if (memEntry && Date.now() <= memEntry.expiresAt) {
    uid = memEntry.uid;
    linkTokenStore.delete(token);
  } else {
    linkTokenStore.delete(token); // clean up expired entry
    const db = getFirestoreOrNull();
    if (db) {
      const snap = await db.collection('telegram_link_tokens').doc(token).get();
      if (snap.exists) {
        const d = snap.data();
        if (!d.used && d.expiresAt.toDate().getTime() > Date.now()) {
          uid = d.uid;
        }
      }
    }
  }

  if (!uid) {
    await tgSend('sendMessage', {
      chat_id: chatId,
      text: 'That link has expired or is not valid. Open StriveAI and tap "Connect Telegram" again to get a fresh link.',
    });
    return;
  }

  // Persist connection — idempotent (merge: true overwrites same uid).
  const db = getFirestoreOrNull();
  if (!db) {
    await tgSend('sendMessage', {
      chat_id: chatId,
      text: 'Connection could not be saved (server configuration issue). Please try again later.',
    });
    return;
  }

  await db.collection('telegram_connections').doc(uid).set({
    chatId:        String(chatId),
    username,
    firstName,
    connectedAt:   new Date(),
    pingHour:      9,
    pingEnabled:   true,
    lastPingSentAt: null,
    lastPingStatus: '',
  }, { merge: true });

  // Mark token used so replay is rejected.
  db.collection('telegram_link_tokens').doc(token)
    .set({ used: true }, { merge: true })
    .catch(() => {});

  logInfo({ area: 'telegram', module: 'backend/server.js', action: 'connected', uid, chatId: maskChatId(chatId) });

  await tgSend('sendMessage', {
    chat_id: chatId,
    text: 'StriveAI connected. I\'ll check in with your daily action here.',
  });
}

// POST /api/v2/telegram/link-token — authenticated; creates a deep-link token.
app.post('/api/v2/telegram/link-token', requireFirebaseUser, async (req, res) => {
  if (!TELEGRAM_CONFIGURED) {
    return res.status(503).json({ error: 'Telegram is not configured on this server' });
  }
  const uid = req.firebaseUser.uid;
  pruneLinkTokens();

  const token     = generateLinkToken();
  const expiresAt = Date.now() + LINK_TOKEN_TTL_MS;
  linkTokenStore.set(token, { uid, expiresAt });

  // Best-effort Firestore write so token survives a server restart.
  const db = getFirestoreOrNull();
  if (db) {
    db.collection('telegram_link_tokens').doc(token).set({
      uid,
      expiresAt: new Date(expiresAt),
      used:      false,
      createdAt: new Date(),
    }).catch((err) =>
      logWarn({ area: 'telegram', module: 'backend/server.js', action: 'link_token_firestore_write_failed', error: err.message })
    );
  }

  const botUser    = TELEGRAM_BOT_USERNAME || 'StriveAIBot';
  const connectUrl = `https://t.me/${botUser}?start=${token}`;
  return res.json({
    botUsername: botUser,
    connectUrl,
    expiresAt: new Date(expiresAt).toISOString(),
  });
});

// GET /api/v2/telegram/status — authenticated; returns connection status without exposing chatId.
app.get('/api/v2/telegram/status', requireFirebaseUser, async (req, res) => {
  const uid = req.firebaseUser.uid;
  const db  = getFirestoreOrNull();
  if (!db) {
    return res.status(503).json({ error: 'Firebase is not configured on this server' });
  }
  try {
    const snap = await db.collection('telegram_connections').doc(uid).get();
    if (!snap.exists) {
      return res.json({ connected: false });
    }
    const d = snap.data();
    return res.json({
      connected:   Boolean(d.chatId),
      username:    d.username    || '',
      firstName:   d.firstName   || '',
      pingHour:    typeof d.pingHour === 'number' ? d.pingHour : 9,
      pingEnabled: d.pingEnabled !== false,
      connectedAt: d.connectedAt ? d.connectedAt.toDate().toISOString() : '',
    });
  } catch (err) {
    logError({ area: 'telegram', module: 'backend/server.js', action: 'status_read_failed', uid, error: err.message });
    return res.status(500).json({ error: 'Failed to read Telegram status' });
  }
});

// POST /api/v2/telegram/disconnect — authenticated; removes connection record.
app.post('/api/v2/telegram/disconnect', requireFirebaseUser, async (req, res) => {
  const uid = req.firebaseUser.uid;
  const db  = getFirestoreOrNull();
  if (!db) {
    return res.status(503).json({ error: 'Firebase is not configured on this server' });
  }
  try {
    await db.collection('telegram_connections').doc(uid).delete();
    logInfo({ area: 'telegram', module: 'backend/server.js', action: 'disconnected', uid });
    return res.json({ ok: true });
  } catch (err) {
    logError({ area: 'telegram', module: 'backend/server.js', action: 'disconnect_failed', uid, error: err.message });
    return res.status(500).json({ error: 'Failed to disconnect Telegram' });
  }
});

// POST /api/telegram/webhook — receives Telegram updates; always responds 200 immediately.
app.post('/api/telegram/webhook', async (req, res) => {
  res.sendStatus(200); // ack before any processing; Telegram retries on non-2xx

  const secret = req.headers['x-telegram-bot-api-secret-token'] || '';
  if (!TELEGRAM_WEBHOOK_SECRET || secret !== TELEGRAM_WEBHOOK_SECRET) {
    // Reject silently — do not reveal whether the secret is configured.
    return;
  }
  if (!TELEGRAM_CONFIGURED) return;

  try {
    await handleTelegramUpdate(req.body);
  } catch (err) {
    logError({ area: 'telegram', module: 'backend/server.js', action: 'webhook_handler_error', error: err.message });
  }
});

// ── End Telegram Integration ───────────────────────────────────────────────

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }
  if (err instanceof SyntaxError && Object.prototype.hasOwnProperty.call(err, 'body')) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  const normalized = normalizeError(err);
  logError({
    area: 'backend',
    module: 'backend/server.js',
    function: 'express_error_handler',
    action: 'unexpected_exception',
    errorCategory: normalized.category,
    errorCode: normalized.code,
    errorMessage: normalized.message,
    stack: normalized.stack,
  });
  return res.status(500).json({ error: 'Internal server error' });
});

// EMAIL NOTIFICATION SYSTEM
// ═══════════════════════════════════════════════
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@striveai.app';
const EMAIL_ENABLED = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

// Simple SMTP mailer — no nodemailer dependency, uses raw Node net/tls
// We use nodemailer if available, else log and skip gracefully
let nodemailerSend = null;
try {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  nodemailerSend = async (to, subject, html) => {
    await transporter.sendMail({ from: SMTP_FROM, to, subject, html });
  };
} catch (_e) {
  // nodemailer not installed — email sending will be skipped
}

function buildInactivityEmailHtml(data) {
  const { name, daysSince, streak, goal } = data;
  const streakLine = streak > 0
    ? `<p style="color:#f59e0b;font-weight:700;">🔥 You had a ${streak}-day streak. Don't let it fade!</p>`
    : '';
  const goalLine = goal
    ? `<p style="color:#8b8b9c;font-size:13px;">Current goal: <em>${String(goal).slice(0, 120)}</em></p>`
    : '';
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0e0e12;color:#e0e0e8;padding:40px 0;margin:0">
<div style="max-width:480px;margin:0 auto;background:#16161e;border-radius:12px;overflow:hidden;border:1px solid #2a2a3a">
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px 32px 24px">
    <div style="font-size:24px;font-weight:800;letter-spacing:-.5px;color:#fff">StriveAI</div>
    <div style="font-size:11px;color:#6b6b7e;font-weight:600;letter-spacing:.1em;margin-top:4px">BUILD WHAT MATTERS</div>
  </div>
  <div style="padding:32px">
    <h2 style="margin:0 0 8px;font-size:20px;color:#fff">Hey ${String(name||'builder').slice(0,40)} 👋</h2>
    <p style="color:#8b8b9c;line-height:1.6;margin:0 0 16px">
      You haven't had a session in <strong style="color:#e0e0e8">${daysSince} day${daysSince===1?'':'s'}</strong>.
      Your roadmap is waiting — every day without progress is a day closer to missing your deadline.
    </p>
    ${streakLine}
    ${goalLine}
    <a href="https://striveai.app" style="display:inline-block;margin-top:20px;background:#0052ff;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">
      Back to StriveAI →
    </a>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #2a2a3a;font-size:11px;color:#6b6b7e">
    You're receiving this because you have a StriveAI account. To opt out, adjust notification settings in the app.
  </div>
</div></body></html>`;
}

function buildStreakRiskEmailHtml(data) {
  const { name, streak, goal } = data;
  const goalLine = goal
    ? `<p style="color:#8b8b9c;font-size:13px;">Current goal: <em>${String(goal).slice(0, 120)}</em></p>`
    : '';
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0e0e12;color:#e0e0e8;padding:40px 0;margin:0">
<div style="max-width:480px;margin:0 auto;background:#16161e;border-radius:12px;overflow:hidden;border:1px solid #2a2a3a">
  <div style="background:linear-gradient(135deg,#1a0a00,#2d1200);padding:32px 32px 24px">
    <div style="font-size:24px;font-weight:800;letter-spacing:-.5px;color:#fff">StriveAI</div>
    <div style="font-size:11px;color:#6b6b7e;font-weight:600;letter-spacing:.1em;margin-top:4px">BUILD WHAT MATTERS</div>
  </div>
  <div style="padding:32px">
    <h2 style="margin:0 0 8px;font-size:20px;color:#fff">Your streak is at risk 🔥</h2>
    <p style="color:#8b8b9c;line-height:1.6;margin:0 0 16px">
      Hey <strong style="color:#e0e0e8">${String(name||'builder').slice(0,40)}</strong>,
      you've built a <strong style="color:#f59e0b">${streak}-day streak</strong> and it expires tonight if you don't log a session.
    </p>
    ${goalLine}
    <a href="https://striveai.app" style="display:inline-block;margin-top:20px;background:#f59e0b;color:#000;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px">
      Protect my streak →
    </a>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #2a2a3a;font-size:11px;color:#6b6b7e">
    You're receiving this because you have a StriveAI account.
  </div>
</div></body></html>`;
}

// Rate limit: 1 reminder per user per day
const reminderSentToday = new Map();

app.post('/api/notify/reminder', async (req, res) => {
  const trace = createRequestTrace();
  try {
    const { email, name, daysSince, streak, goal } = req.body || {};
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    const today = new Date().toDateString();
    const cacheKey = `${email}:${today}`;
    if (reminderSentToday.has(cacheKey)) {
      return res.status(429).json({ ok: false, reason: 'already_sent_today' });
    }
    reminderSentToday.set(cacheKey, true);
    // Prune old keys to avoid memory leak
    if (reminderSentToday.size > 10000) {
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      for (const [k] of reminderSentToday) {
        if (k.endsWith(`:${yesterday}`)) reminderSentToday.delete(k);
      }
    }
    if (!EMAIL_ENABLED || !nodemailerSend) {
      logInfo(trace, 'Email not configured — reminder skipped', { email, daysSince });
      return res.json({ ok: true, sent: false, reason: 'email_not_configured' });
    }
    const numDays = Math.max(0, parseInt(daysSince, 10) || 0);
    const numStreak = Math.max(0, parseInt(streak, 10) || 0);
    let subject, html;
    if (numDays >= 2) {
      subject = `${numDays} days without a session — come back`;
      html = buildInactivityEmailHtml({ name, daysSince: numDays, streak: numStreak, goal });
    } else if (numStreak > 0) {
      subject = `Your ${numStreak}-day streak expires tonight 🔥`;
      html = buildStreakRiskEmailHtml({ name, streak: numStreak, goal });
    } else {
      return res.json({ ok: true, sent: false, reason: 'no_trigger' });
    }
    await nodemailerSend(email, subject, html);
    logInfo(trace, 'Reminder email sent', { email, type: numDays >= 2 ? 'inactivity' : 'streak' });
    return res.json({ ok: true, sent: true });
  } catch (err) {
    logError(trace, 'Failed to send reminder', normalizeError(err));
    return res.status(500).json({ error: 'Failed to send reminder' });
  }
});

// module.exports lets @vercel/node use this as a serverless request handler.
// app.listen is still called for local dev (node ignores the export).
module.exports = app;

app.listen(PORT, () => {
  logInfo({
    area: 'backend',
    module: 'backend/server.js',
    function: 'app.listen',
    action: 'server_started',
    port: PORT,
    route: '/',
  });
});
