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
const frontendDir = path.join(__dirname, '..', 'frontend');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
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
const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
const GEMINI_ALLOWED_RESPONSE_MIME_TYPES = new Set(['application/json', 'text/plain']);
const GEMINI_ALLOWED_CONFIG_KEYS = new Set([
  'maxOutputTokens',
  'temperature',
  'topP',
  'responseMimeType',
  'responseSchema',
  'thinkingConfig',
]);
const AI_ACTIONS = new Set(['roadmap', 'tasks', 'tasks_skeleton', 'task_detail', 'task_audit', 'goals_review', 'note_process', 'session_review', 'chat']);
const ACTION_MAX_OUTPUT_TOKENS = {
  roadmap: 2200,
  tasks: 1200,
  tasks_skeleton: 600,
  task_detail: 1100,
  task_audit: 700,
  goals_review: 500,
  note_process: 700,
  session_review: 900,
  chat: 900,
};
const ACTION_CONTEXT_LIMITS = {
  roadmap: { promptChars: 9000, systemChars: 2200, totalChars: 11000 },
  tasks: { promptChars: 7000, systemChars: 1800, totalChars: 8200 },
  tasks_skeleton: { promptChars: 5200, systemChars: 1500, totalChars: 6200 },
  task_detail: { promptChars: 6000, systemChars: 1600, totalChars: 7000 },
  task_audit: { promptChars: 5200, systemChars: 1700, totalChars: 6400 },
  goals_review: { promptChars: 4200, systemChars: 1500, totalChars: 5200 },
  note_process: { promptChars: 5200, systemChars: 1500, totalChars: 6200 },
  session_review: { promptChars: 5200, systemChars: 1500, totalChars: 6400 },
  chat: { promptChars: 6000, systemChars: 1700, totalChars: 7200 },
};
const TASK_GENERATION_ACTIONS = new Set(['tasks', 'tasks_skeleton', 'task_detail']);

function approxInputTokens(charCount) {
  return Math.max(1, Math.round(charCount / 4));
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
  const limits = ACTION_CONTEXT_LIMITS[action] || ACTION_CONTEXT_LIMITS.chat;
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
    fields.set('DESCRIPTION', `DESCRIPTION | Выполнить задачу "${titleValue}" как конкретный следующий шаг.`);
  }
  if (!fields.has('WHY')) {
    fields.set('WHY', `WHY | Держит текущий этап в execution и снижает риск простоя.`);
  }
  if (!fields.has('DELIVERABLE') && fields.has('DONE')) {
    fields.set('DELIVERABLE', `DELIVERABLE | ${String(fields.get('DONE') || '').replace(/^DONE\s*\|\s*/i, '')}`);
  }
  if (!fields.has('DONE') && fields.has('DELIVERABLE')) {
    fields.set('DONE', `DONE | ${String(fields.get('DELIVERABLE') || '').replace(/^DELIVERABLE\s*\|\s*/i, '')}`);
  }
  if (!fields.has('DELIVERABLE')) {
    fields.set('DELIVERABLE', `DELIVERABLE | Проверяемый артефакт или измеримый результат по задаче "${titleValue}".`);
  }
  if (!fields.has('DONE')) {
    fields.set('DONE', `DONE | Есть завершённый результат и короткая фиксация вывода.`);
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

function buildFallbackTaskDetailContract(prompt, opts = {}) {
  const promptCtx = extractTaskDetailPromptContext(prompt);
  const title = String(promptCtx.title || opts?.taskTitle || opts?.stageTitle || 'Task').trim();
  const stageTitle = String(promptCtx.stageTitle || opts?.stageTitle || 'Stage').trim();
  const objective = String(promptCtx.objective || opts?.stageObjective || 'validate demand and keep execution moving').trim();
  const outcome = String(promptCtx.outcome || opts?.stageOutcome || 'a measurable stage outcome').trim();
  const deadline = String(promptCtx.deadline || opts?.deadline || 'none').trim();
  const description = `Execute "${title}" for ${stageTitle}.`;
  const why = `WHY | Keeps ${objective} moving with a concrete execution step.`;
  const deliverable = `DELIVERABLE | A verifiable result for "${title}".`;
  const done = `DONE | The task is finished and the result is recorded.`;
  return {
    usable: true,
    repairedText: [
      'TASK_DETAIL_START',
      `TITLE | ${title}`,
      `DESCRIPTION | ${description}`,
      why,
      deliverable,
      done,
      'PRIORITY | med',
      `DEADLINE | ${deadline || 'none'}`,
      'TASK_DETAIL_END',
    ].join('\n'),
    title,
    stageTitle,
    objective,
    outcome,
    deadline,
  };
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
  const safeTitle = title || `Stage ${index + 1}`;
  const safeObjective = objective || outcome || 'Concrete execution step';
  const safeOutcome = outcome || objective || 'Measurable output';
  const parts = [`${index + 1}. ${safeTitle}`, safeObjective, safeOutcome];
  if (reasoning) parts.push(reasoning);
  return parts.join(' || ');
}

function normalizeRoadmapStageObject(candidate, index) {
  const raw = typeof candidate === 'string' ? { title: candidate } : (candidate || {});
  const title = String(raw.title || raw.name || raw.week || raw.stage || '').trim() || `Stage ${index + 1}`;
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
      title: 'Validate demand',
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
      title: 'Shape MVP scope',
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
      title: 'Build execution path',
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
      title: 'Launch growth loop',
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

function buildRoadmapFingerprint({ ip, prompt, systemCtx, requestedMaxTokens, clientRequestId }) {
  if (clientRequestId) return `client:${clientRequestId}`;
  const raw = `${ip || 'unknown'}|${requestedMaxTokens}|${prompt || ''}|${systemCtx || ''}`;
  return `fp:${hashText(raw).slice(0, 20)}`;
}

function buildGeminiPayload({ fullPrompt, generationConfig }) {
  return {
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    generationConfig,
  };
}

function safePayloadForLogs(payload) {
  const text = String(payload?.contents?.[0]?.parts?.[0]?.text || '');
  const cfg = payload?.generationConfig && typeof payload.generationConfig === 'object'
    ? payload.generationConfig
    : {};
  const promptPreview = text.length <= 700
    ? text
    : `${text.slice(0, 500)}\n...[truncated for logs]...\n${text.slice(-180)}`;
  return {
    contentsCount: Array.isArray(payload?.contents) ? payload.contents.length : 0,
    contentRoles: Array.isArray(payload?.contents) ? payload.contents.map((item) => String(item?.role || '')) : [],
    promptChars: text.length,
    promptPreview,
    generationConfig: {
      maxOutputTokens: Number.isFinite(cfg.maxOutputTokens) ? cfg.maxOutputTokens : null,
      temperature: Number.isFinite(cfg.temperature) ? cfg.temperature : null,
      topP: Number.isFinite(cfg.topP) ? cfg.topP : null,
      responseMimeType: typeof cfg.responseMimeType === 'string' ? cfg.responseMimeType : '',
      thinkingBudget: Number.isFinite(cfg?.thinkingConfig?.thinkingBudget) ? cfg.thinkingConfig.thinkingBudget : null,
      schemaProvided: Boolean(cfg.responseSchema || cfg.responseJsonSchema),
      keys: Object.keys(cfg || {}),
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

function sanitizeGenerationConfig({ opts, action, effectiveMaxTokens }) {
  const generationConfig = {
    maxOutputTokens: effectiveMaxTokens,
  };
  const warnings = [];

  if (typeof opts.temperature === 'number' && Number.isFinite(opts.temperature)) {
    generationConfig.temperature = Math.min(2, Math.max(0, opts.temperature));
  } else {
    generationConfig.temperature = action === 'roadmap'
      ? 0.2
      : (action === 'tasks_skeleton' ? 0 : (action === 'task_detail' ? 0.25 : 0.7));
  }

  if (typeof opts.topP === 'number' && Number.isFinite(opts.topP)) {
    generationConfig.topP = Math.min(1, Math.max(0, opts.topP));
  } else if (action === 'tasks_skeleton') {
    generationConfig.topP = 0.1;
  }

  if (action !== 'roadmap' && typeof opts.responseMimeType === 'string' && opts.responseMimeType.length <= 120) {
    if (GEMINI_ALLOWED_RESPONSE_MIME_TYPES.has(opts.responseMimeType)) {
      generationConfig.responseMimeType = opts.responseMimeType;
    } else {
      warnings.push(`unsupported responseMimeType dropped: ${opts.responseMimeType}`);
    }
  }

  const responseSchema = opts.responseSchema || opts.responseJsonSchema;
  if (
    action !== 'roadmap'
    && responseSchema
    && typeof responseSchema === 'object'
    && !Array.isArray(responseSchema)
  ) {
    generationConfig.responseSchema = sanitizeResponseSchemaNode(responseSchema);
  }
  if (action === 'tasks_skeleton') {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  return { generationConfig, warnings };
}

function validateGeminiRequestPayload({ model, fullPrompt, generationConfig, action }) {
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
  const unknownKeys = Object.keys(generationConfig).filter((key) => !GEMINI_ALLOWED_CONFIG_KEYS.has(key));
  if (unknownKeys.length) {
    errors.push(`unsupported generationConfig keys: ${unknownKeys.join(',')}`);
  }
  if (!Number.isInteger(generationConfig.maxOutputTokens)) {
    errors.push('generationConfig.maxOutputTokens must be an integer');
  } else if (generationConfig.maxOutputTokens < 1 || generationConfig.maxOutputTokens > 8192) {
    errors.push('generationConfig.maxOutputTokens out of range');
  } else if (action === 'roadmap' && (generationConfig.maxOutputTokens < 1200 || generationConfig.maxOutputTokens > 2200)) {
    errors.push('roadmap maxOutputTokens must be 1200-2200');
  } else if (action === 'tasks' && (generationConfig.maxOutputTokens < 400 || generationConfig.maxOutputTokens > 1200)) {
    errors.push('tasks maxOutputTokens must be 400-1200');
  } else if (action === 'tasks_skeleton' && (generationConfig.maxOutputTokens < 400 || generationConfig.maxOutputTokens > 600)) {
    errors.push('tasks_skeleton maxOutputTokens must be 400-600');
  } else if (action === 'task_detail' && (generationConfig.maxOutputTokens < 850 || generationConfig.maxOutputTokens > 1100)) {
    errors.push('task_detail maxOutputTokens must be 850-1100');
  }
  if (generationConfig.temperature !== undefined && (!Number.isFinite(generationConfig.temperature) || generationConfig.temperature < 0 || generationConfig.temperature > 2)) {
    errors.push('generationConfig.temperature must be 0-2');
  }
  if (generationConfig.topP !== undefined && (!Number.isFinite(generationConfig.topP) || generationConfig.topP < 0 || generationConfig.topP > 1)) {
    errors.push('generationConfig.topP must be 0-1');
  }
  if (generationConfig.responseMimeType !== undefined && !GEMINI_ALLOWED_RESPONSE_MIME_TYPES.has(generationConfig.responseMimeType)) {
    errors.push('generationConfig.responseMimeType is invalid');
  }
  if (
    generationConfig.thinkingConfig !== undefined
    && (
      typeof generationConfig.thinkingConfig !== 'object'
      || generationConfig.thinkingConfig === null
      || Array.isArray(generationConfig.thinkingConfig)
      || !Number.isInteger(generationConfig.thinkingConfig.thinkingBudget)
      || generationConfig.thinkingConfig.thinkingBudget < 0
      || generationConfig.thinkingConfig.thinkingBudget > 24576
    )
  ) {
    errors.push('generationConfig.thinkingConfig.thinkingBudget must be an integer 0-24576');
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
  if (msg.includes('model')) return 'model';
  return '';
}

async function callGemini({ model, fullPrompt, generationConfig }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  const payload = buildGeminiPayload({ fullPrompt, generationConfig });
  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

    const candidate = data?.candidates?.[0];
    const text = (candidate?.content?.parts || []).map((part) => part.text || '').join('');
    const finishReason = candidate?.finishReason || '';
    const upstreamErrorCode = data?.error?.status || data?.error?.code || '';
    const upstreamErrorMessage = data?.error?.message || '';
    const upstreamErrorDetails = data?.error?.details || null;
    const success = upstream.ok && !data?.error && !parseFailed;

    return {
      success,
      parseFailed,
      timedOut: false,
      upstreamStatus: upstream.status,
      upstreamErrorCode: upstreamErrorCode ? String(upstreamErrorCode) : '',
      upstreamErrorMessage: upstreamErrorMessage ? String(upstreamErrorMessage) : '',
      upstreamErrorDetails,
      finishReason,
      text: text || '',
      payloadForLogs: safePayloadForLogs(payload),
    };
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
      };
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function logGeminiRequest(fields) {
  const payload = {
    area: 'gemini',
    module: 'backend/server.js',
    function: 'api/gemini/generate',
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

const geminiLimiter = rateLimit({
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
    geminiConfigured: Boolean(GEMINI_API_KEY),
    paypalClientId: PAYPAL_CLIENT_ID,
    planPro: PLAN_PRO,
    planTeam: PLAN_TEAM,
    paypalSdkUrl: PAYPAL_SDK_URL,
    firebaseConfigured: FIREBASE_CONFIGURED,
    firebaseConfig: FIREBASE_CONFIGURED ? FIREBASE_WEB_CONFIG : null,
  });
});

app.post('/api/gemini/generate', geminiLimiter, async (req, res) => {
  const startedAt = Date.now();
  const requestId = createRequestId();
  const sessionId = String(req.get('x-session-id') || req.get('x-strive-session-id') || '').slice(0, 120);
  const baseLog = {
    logType: 'request',
    requestId,
    sessionId,
    userId: '',
    model: GEMINI_MODEL,
    route: req.originalUrl || '/api/gemini/generate',
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
    logGeminiRequest(baseLog);
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
    const safeAction = typeof action === 'string' ? action.trim().toLowerCase() : '';
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
        route: req.originalUrl || '/api/gemini/generate',
        clientRequestId,
      })
    );
    logGeminiRequest(baseLog);

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

    if (!GEMINI_API_KEY) {
      return reject(503, { error: 'AI service is not configured.' }, 'CONFIG');
    }

    const requestedMaxTokens = Math.min(8192, Math.max(1, Math.floor(maxTokens)));
    const normalizedRequestedMaxTokens = safeAction === 'roadmap'
      ? Math.min(2200, Math.max(1200, requestedMaxTokens))
      : safeAction === 'tasks'
        ? Math.min(1200, Math.max(900, requestedMaxTokens))
        : safeAction === 'tasks_skeleton'
          ? Math.min(600, Math.max(400, requestedMaxTokens))
          : safeAction === 'task_detail'
            ? Math.min(1100, Math.max(850, requestedMaxTokens))
        : requestedMaxTokens;
    const requestedRoadmapCount = safeAction === 'roadmap'
      ? extractRoadmapTargetCount(String(opts?.milestoneCount || opts?.roadmapMilestoneCount || ''), 0)
      : 0;
    const actionCap = ACTION_MAX_OUTPUT_TOKENS[safeAction] || ACTION_MAX_OUTPUT_TOKENS.chat;
    const effectiveMaxTokens = Math.min(normalizedRequestedMaxTokens, actionCap);
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
    baseLog.logType = 'prompt_prepared';
    logGeminiRequest(baseLog);

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
        logGeminiRequest(baseLog);
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
    });
    if (configWarnings.length) {
      logGeminiRequest({
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
        maxTokens: Math.max(1200, Math.min(1600, effectiveMaxTokens - 240)),
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
    const retryBackoffMs = TRANSIENT_RETRY_BACKOFF_MS;

    let lastFailure = null;
    let providerAttempt = 0;
    let lastChainAttempt = 0;
    let lastAttemptMaxTokens = effectiveMaxTokens;
    let lastRetryAttempt = 0;
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
        : { prompt: attempt.prompt, systemCtx: attempt.systemCtx };
      const fullPrompt = attemptPrompt.systemCtx ? `${attemptPrompt.systemCtx}\n\n---\n\n${attemptPrompt.prompt}` : attemptPrompt.prompt;
      for (let retryIndex = 0; retryIndex <= retryBackoffMs.length; retryIndex += 1) {
        providerAttempt += 1;
        logGeminiRequest({
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
        const validation = validateGeminiRequestPayload({
          model: GEMINI_MODEL,
          fullPrompt,
          generationConfig,
          action: safeAction,
        });
        if (!validation.valid) {
          const failedAt = Date.now();
          logGeminiRequest({
            ...baseLog,
            logType: 'validation',
            upstreamStatus: 'VALIDATION_ERROR',
            upstreamErrorCode: 'VALIDATION_ERROR',
            error: 'Gemini request validation failed before API call.',
            validationErrors: validation.errors,
            promptPreview: fullPrompt.slice(0, 200),
            generationConfig,
            model: GEMINI_MODEL,
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
        const result = await callGemini({ model: GEMINI_MODEL, fullPrompt, generationConfig });
        const roadmapCountHint = safeAction === 'roadmap'
          ? (requestedRoadmapCount || extractRoadmapTargetCount(trimmedCtx.prompt, 0))
          : 0;
        const roadmapRawText = String(result.text || '');
        const roadmapStructured = safeAction === 'roadmap'
          ? salvageRoadmapSkeleton(roadmapRawText, roadmapCountHint || 0)
          : null;
        if (safeAction === 'roadmap') {
          logGeminiRequest({
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
            parsedRoadmap: roadmapStructured ? {
              usable: Boolean(roadmapStructured.usable),
              stageCount: Number(roadmapStructured.stageCount) || 0,
              stages: Array.isArray(roadmapStructured.stages)
                ? roadmapStructured.stages.map((stage, index) => ({
                    week: stage?.week || index + 1,
                    title: String(stage?.title || ''),
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
          logGeminiRequest({
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
            finalStages: Array.isArray(finalizedRoadmap.stages)
              ? finalizedRoadmap.stages.map((stage, index) => ({
                  week: stage?.week || index + 1,
                  title: String(stage?.title || ''),
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
          logGeminiRequest(baseLog);
          return res.json({
            text: finalizedRoadmap.repairedText,
            stages: finalizedRoadmap.stages || [],
            stageCount: finalizedRoadmap.stageCount || 0,
            finishReason: result.finishReason || '',
            requestId,
            status: result.success ? 'success' : 'degraded_success',
            degraded: !result.success,
            truncated: Boolean(result.finishReason === 'MAX_TOKENS'),
          });
        }
        if (result.success && roadmapRawText.trim()) {
          if (result.finishReason === 'MAX_TOKENS') {
            logGeminiRequest({
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
                logGeminiRequest({
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
                logGeminiRequest(baseLog);
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
                logGeminiRequest({
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
                logGeminiRequest(baseLog);
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
                logGeminiRequest({
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
                logGeminiRequest(baseLog);
                return res.json({
                  text: salvagedDetail.repairedText,
                  finishReason: result.finishReason || '',
                  requestId,
                  status: 'degraded_success',
                  degraded: true,
                  truncated: true,
                });
              }
              const fallbackDetail = buildFallbackTaskDetailContract(trimmedCtx.prompt, opts);
              logGeminiRequest({
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
              logGeminiRequest(baseLog);
              return res.json({
                text: fallbackDetail.repairedText,
                finishReason: result.finishReason || '',
                requestId,
                status: 'degraded_success',
                degraded: true,
                truncated: true,
              });
            }
            if (safeAction === 'roadmap') {
              const salvagedRoadmap = roadmapStructured && roadmapStructured.usable
                ? roadmapStructured
                : salvageRoadmapSkeleton(result.text || '', roadmapCountHint || 0);
              if (salvagedRoadmap.usable) {
                logGeminiRequest({
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
                logGeminiRequest(baseLog);
                return res.json({
                  text: salvagedRoadmap.repairedText,
                  stages: salvagedRoadmap.stages || [],
                  stageCount: salvagedRoadmap.stageCount || 0,
                  finishReason: result.finishReason || '',
                  requestId,
                  status: 'degraded_success',
                  degraded: true,
                  truncated: true,
                });
              }
            }
            if (!TASK_GENERATION_ACTIONS.has(safeAction)) {
              const repaired = parseJsonWithRepair(result.text || '');
              if (repaired.usable) {
                logGeminiRequest({
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
                logGeminiRequest(baseLog);
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
            logGeminiRequest({
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
        logGeminiRequest(baseLog);
        return res.json({
          text: result.text || '',
          stages: roadmapStructured?.stages || [],
          stageCount: roadmapStructured?.stageCount || 0,
          finishReason: result.finishReason || '',
          requestId,
        });
      }

        const failure = classifyFailure(result);
        lastFailure = { ...result, ...failure };
        lastRetryAttempt = retryIndex;
        const likelyInvalidField =
          failure.code === 'BAD_REQUEST'
            ? guessLikelyInvalidField(result.upstreamErrorMessage)
            : '';
        logGeminiRequest({
          ...baseLog,
          logType: 'attempt',
          upstreamStatus: result.timedOut ? 'TIMEOUT' : result.upstreamStatus,
          upstreamErrorCode: result.upstreamErrorCode || failure.code,
          upstreamErrorMessage: result.upstreamErrorMessage || '',
          upstreamErrorDetails: result.upstreamErrorDetails || null,
          model: GEMINI_MODEL,
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
            logGeminiRequest({
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
            logGeminiRequest(baseLog);
            return res.json({
              text: salvagedRoadmap.repairedText,
              finishReason: result.finishReason || '',
              requestId,
              status: 'degraded_success',
              degraded: true,
              truncated: true,
            });
          }
        }
        if (safeAction === 'task_detail' && failure.code === 'RESPONSE_TRUNCATED') {
          const salvagedDetail = salvageTaskDetail(result.text || '');
          if (salvagedDetail.usable) {
            logGeminiRequest({
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
            logGeminiRequest(baseLog);
            return res.json({
              text: salvagedDetail.repairedText,
              finishReason: result.finishReason || '',
              requestId,
              status: 'degraded_success',
              degraded: true,
              truncated: true,
            });
          }
          const fallbackDetail = buildFallbackTaskDetailContract(trimmedCtx.prompt, opts);
          logGeminiRequest({
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
          logGeminiRequest(baseLog);
          return res.json({
            text: fallbackDetail.repairedText,
            finishReason: result.finishReason || '',
            requestId,
            status: 'degraded_success',
            degraded: true,
            truncated: true,
          });
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

    if (safeAction === 'task_detail') {
      const fallbackDetail = buildFallbackTaskDetailContract(trimmedCtx.prompt, opts);
      const fallbackLogType = lastFailure?.code === 'RESPONSE_TRUNCATED' || lastFailure?.finishReason === 'MAX_TOKENS'
        ? 'truncated_response_usable'
        : 'task_detail_fallback_used';
      logGeminiRequest({
        ...baseLog,
        logType: fallbackLogType,
        upstreamStatus: lastFailure?.timedOut ? 'TIMEOUT' : lastFailure?.upstreamStatus || 0,
        upstreamErrorCode: lastFailure?.upstreamErrorCode || lastFailure?.code || 'TASK_DETAIL_FALLBACK',
        finishReason: lastFailure?.finishReason || '',
        attempt: providerAttempt,
        chainAttempt: lastChainAttempt,
        retryAttempt: lastRetryAttempt,
        latencyMs: Date.now() - startedAt,
      });
      baseLog.logType = 'success';
      baseLog.upstreamStatus = lastFailure?.timedOut ? 'TIMEOUT' : lastFailure?.upstreamStatus || 0;
      baseLog.upstreamErrorCode = lastFailure?.upstreamErrorCode || lastFailure?.code || 'TASK_DETAIL_FALLBACK';
      baseLog.finishReason = lastFailure?.finishReason || '';
      baseLog.latencyMs = Date.now() - startedAt;
      baseLog.attempt = providerAttempt;
      baseLog.chainAttempt = lastChainAttempt;
      baseLog.retryAttempt = lastRetryAttempt;
      logGeminiRequest(baseLog);
      return res.json({
        text: fallbackDetail.repairedText,
        finishReason: lastFailure?.finishReason || '',
        requestId,
        status: 'degraded_success',
        degraded: true,
        truncated: Boolean(lastFailure?.code === 'RESPONSE_TRUNCATED' || lastFailure?.finishReason === 'MAX_TOKENS'),
      });
    }

    const safeFailure = lastFailure || { code: 'UPSTREAM_5XX', httpStatus: 502, upstreamStatus: 0 };
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
    logGeminiRequest(baseLog);

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
    logGeminiRequest(baseLog);
    logError({
      area: 'backend',
      module: 'backend/server.js',
      function: 'api/gemini/generate',
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
          function: 'api/gemini/generate',
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

