// StriveAI v2 coaching AI actions.
// Separated from ai-v2.js to keep that file under 500 lines.

import { getAuthToken } from './auth.js';

// ── Network layer ─────────────────────────────────────────────────────────────

async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = await getAuthToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function requestJson({ action, prompt, schema }) {
  const res = await fetch('/api/openai/generate', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ action, prompt, opts: { responseJsonSchema: schema } }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) throw new Error(payload.error || 'AI request failed');
  const raw = String(payload.text || '').trim().replace(/^```json\s*/i, '').replace(/```$/g, '').trim();
  try { return JSON.parse(raw); } catch (_e) {
    const s = raw.indexOf('{'), e = raw.lastIndexOf('}');
    if (s >= 0 && e > s) return JSON.parse(raw.slice(s, e + 1));
    throw new Error('unparseable AI response');
  }
}

// ── Goal sharpening ───────────────────────────────────────────────────────────
// Turns a vague goal into a specific, artifact-anchored sentence.
// Never throws — returns null on any failure so onboarding is never blocked.

export async function sharpenGoal(input) {
  const { goal, category, weekGoal, currentProject } = input;
  const prompt = [
    `Goal: ${String(goal || '').slice(0, 200)}`,
    `Category: ${category || 'other'}`,
    weekGoal       ? `Day-28 target: ${String(weekGoal).slice(0, 100)}`       : '',
    currentProject ? `Current project: ${String(currentProject).slice(0, 100)}` : '',
    '',
    'Sharpen the goal into one specific, actionable sentence (≤80 chars).',
    'Name the one concrete artifact that exists at the end (≤100 chars).',
    'Write why it matters in one sentence (≤100 chars).',
  ].filter(Boolean).join('\n');

  const schema = {
    type: 'object',
    properties: {
      sharpenedGoal:     { type: 'string' },
      artifactStatement: { type: 'string' },
      whyItMatters:      { type: 'string' },
    },
    required: ['sharpenedGoal', 'artifactStatement', 'whyItMatters'],
    additionalProperties: false,
  };

  try {
    const result = await requestJson({ action: 'sharpen_goal', prompt, schema });
    return {
      sharpenedGoal:     String(result.sharpenedGoal     || goal).slice(0, 160),
      artifactStatement: String(result.artifactStatement || '').slice(0, 160),
      whyItMatters:      String(result.whyItMatters      || '').slice(0, 160),
    };
  } catch (_e) {
    return null; // never block onboarding
  }
}

// ── Agent step feedback ───────────────────────────────────────────────────────
// Fast micro-coaching chip after a step note is submitted.
// Returns null (silently) on short notes or any AI failure.

export async function getStepFeedback(step, userNote) {
  if (!userNote || String(userNote).trim().length < 10) return null;
  const prompt = [
    `Step: ${String(step?.text || '').slice(0, 150)}`,
    `Expected output: ${String(step?.expectedOutput || '').slice(0, 100)}`,
    `User note: ${String(userNote).slice(0, 200)}`,
    '',
    'Is the note a reasonable attempt at the expected output? ok: true/false.',
    'tip: one brief coaching note, max 100 chars.',
  ].join('\n');

  const schema = {
    type: 'object',
    properties: {
      ok:  { type: 'boolean' },
      tip: { type: 'string'  },
    },
    required: ['ok', 'tip'],
    additionalProperties: false,
  };

  try {
    const result = await requestJson({ action: 'agent_step_feedback', prompt, schema });
    return { ok: Boolean(result.ok), tip: String(result.tip || '').slice(0, 120) };
  } catch (_e) { return null; }
}

// ── Weekly ship checkpoint ────────────────────────────────────────────────────
// Generates a brief recap card shown at the start of a new week.

export async function generateWeekRecap(weekData) {
  const { weekNumber, phaseName, goal, goalArtifact, daysThisWeek } = weekData;
  const daysList = Array.isArray(daysThisWeek)
    ? daysThisWeek.map((d) => `Day ${d.dayNumber}: ${d.outcome} — ${String(d.taskTitle || '').slice(0, 60)}`).join('\n')
    : '';

  const prompt = [
    `Week ${weekNumber} of a 28-day Track just ended.`,
    `Goal: ${String(goal || '').slice(0, 150)}`,
    goalArtifact ? `Final artifact: ${String(goalArtifact).slice(0, 100)}` : '',
    phaseName    ? `Phase: ${String(phaseName).slice(0, 80)}`              : '',
    daysList     ? `Days this week:\n${daysList}`                          : '',
    '',
    'What did the user ship this week (1 sentence, ≤120 chars)?',
    'Are they on track for the final day? (true/false)',
    'What is the one focus for next week (≤120 chars)?',
  ].filter(Boolean).join('\n');

  const schema = {
    type: 'object',
    properties: {
      shipped:       { type: 'string'  },
      onTrack:       { type: 'boolean' },
      nextWeekFocus: { type: 'string'  },
    },
    required: ['shipped', 'onTrack', 'nextWeekFocus'],
    additionalProperties: false,
  };

  const fallback = { shipped: `Week ${weekNumber} done`, onTrack: true, nextWeekFocus: 'Keep building momentum' };

  try {
    const result = await requestJson({ action: 'week_recap', prompt, schema });
    return {
      shipped:       String(result.shipped       || fallback.shipped).slice(0, 160),
      onTrack:       Boolean(result.onTrack ?? true),
      nextWeekFocus: String(result.nextWeekFocus || fallback.nextWeekFocus).slice(0, 160),
    };
  } catch (_e) { return fallback; }
}
