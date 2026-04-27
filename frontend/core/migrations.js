import { createDefaultHistory, createDefaultPlan, createDefaultToday, createDefaultUser } from './state-model.js';
import { normalizePlan } from '../domain/plan-engine.js';

export function migrateFromLegacy(localRead) {
  const safeRead = (key) => {
    try {
      return localRead(key);
    } catch (_error) {
      return null;
    }
  };

  const legacyUser = parseJson(safeRead('sa_user'));
  const legacyRoadmap = parseJson(safeRead('sa_roadmap'));
  const legacyTasks = parseJson(safeRead('sa_tasks'));
  const legacyToday = parseJson(safeRead('sa_today'));
  const legacyHistory = parseJson(safeRead('sa_history'));

  const hasLegacy = Boolean(legacyUser || legacyRoadmap || legacyTasks || legacyToday || legacyHistory);
  if (!hasLegacy) return null;

  const user = {
    ...createDefaultUser(),
    name: String(legacyUser?.name || '').trim(),
    goal: String(legacyUser?.goal || '').trim(),
    deadline: String(legacyUser?.deadline || '').trim(),
    niche: String(legacyUser?.niche || '').trim(), 
    executionStyle: String(legacyUser?.executionStyle || '').trim().slice(0, 300), // Trim to 300 chars for safety
  };

  const candidateStages = (Array.isArray(legacyRoadmap) ? legacyRoadmap : []).map((wk, index) => {
    const dayTasks = Array.isArray(wk?.days)
      ? wk.days
          .map((day, dayIndex) => ({
            id: `stage-${index + 1}-task-${dayIndex + 1}`,
            title: String(day?.task || '').trim(),
            priority: dayIndex === 0 ? 'high' : dayIndex < 3 ? 'med' : 'low',
            estimateHours: toHours(day?.duration),
            status: 'todo',
            stageId: `stage-${index + 1}`,
          }))
      : [];
    return {
      id: `stage-${index + 1}`,
      title: String(wk?.title || '').trim(),
      objective: String(wk?.objective || '').trim(),
      source: String(wk?.source || 'legacy').trim(),
      titleSource: String(wk?.titleSource || (wk?.title ? 'legacy' : 'default')).trim(),
      tasks: dayTasks,
    };
  });

  let plan = createDefaultPlan();
  if (candidateStages.length) {
    plan = normalizePlan(
      {
        goal: user.goal,
        deadline: user.deadline,
        stages: candidateStages,
      },
      { goal: user.goal, deadline: user.deadline }
    );
  }

  const doneTexts = (Array.isArray(legacyTasks) ? legacyTasks : [])
    .filter((task) => Boolean(task?.done))
    .map((task) => normalizeLoose(task?.text || ''));
  if (doneTexts.length && plan.stages.length) {
    plan = applyLooseDoneMapping(plan, doneTexts);
  }

  const today = {
    ...createDefaultToday(),
    ...(legacyToday && typeof legacyToday === 'object' ? legacyToday : {}),
  };
  today.status = normalizeTodayStatus(today.status);
  today.primaryTaskText = String(today.primaryTaskText || '').trim();

  const history = {
    ...createDefaultHistory(),
    ...(legacyHistory && typeof legacyHistory === 'object' ? legacyHistory : {}),
  };
  if (!Array.isArray(history.entries)) history.entries = [];
  history.entries = history.entries
    .map((entry) => ({
      date: String(entry?.date || '').slice(0, 10),
      outcome: normalizeOutcome(entry?.outcome),
      taskId: String(entry?.taskId || ''),
      taskTitle: String(entry?.taskTitle || ''),
      stageId: String(entry?.stageId || ''),
      createdAt: String(entry?.createdAt || ''),
      source: String(entry?.source || 'migration'),
    }))
    .filter((entry) => entry.date && entry.outcome);
  history.successStreak = Number(history.successStreak || 0);
  history.missStreak = Number(history.missStreak || 0);

  return { user, plan, today, history };
}

function applyLooseDoneMapping(plan, doneTexts) {
  const next = JSON.parse(JSON.stringify(plan));
  next.stages = (next.stages || []).map((stage) => ({
    ...stage,
    tasks: (stage.tasks || []).map((task) => {
      const key = normalizeLoose(task.title);
      const match = doneTexts.find((doneText) => looseMatch(key, doneText));
      return match ? { ...task, status: 'done' } : { ...task, status: 'todo' };
    }),
  }));
  return normalizePlan(next, { goal: next.goal, deadline: next.deadline });
}

function looseMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;
  const aTokens = a.split(' ').filter(Boolean);
  const bTokens = b.split(' ').filter(Boolean);
  if (!aTokens.length || !bTokens.length) return false;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.includes(token)) overlap += 1;
  }
  const ratio = overlap / Math.max(aTokens.length, bTokens.length);
  return ratio >= 0.6;
}

function normalizeOutcome(value) {
  const str = String(value || '').toLowerCase();
  if (str === 'done' || str === 'missed' || str === 'blocked') return str;
  return '';
}

function normalizeTodayStatus(value) {
  const str = normalizeOutcome(value);
  return str || 'pending';
}

function normalizeLoose(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toHours(duration) {
  const text = String(duration || '').trim().toLowerCase();
  if (text.includes('30')) return 1;
  if (text.includes('45')) return 1;
  if (text.includes('1.5')) return 1.5;
  if (text.includes('2')) return 2;
  if (text.includes('3')) return 3;
  return 2;
}

function parseJson(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}
