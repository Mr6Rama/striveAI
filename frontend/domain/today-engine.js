import { createDefaultToday, isoDateNow } from '../core/state-model.js';
import { getActiveStage, getTask, markTaskDone, overallProgress, recalculatePlan, stageProgress, taskPriorityWeight } from './plan-engine.js';

const MAX_SIMPLIFICATION_LEVEL = 2;

export async function rolloverAndAssign(state, deps = {}) {
  const now = deps.now || new Date();
  const todayDate = isoDateNow(now);
  let next = cloneState(state);

  if (next.today?.date && next.today.date < todayDate && next.today.status === 'pending') {
    next = await markOutcome(next, 'missed', { ...deps, source: 'auto' });
  }

  if (!next.today || next.today.date !== todayDate) {
    next.today = createDefaultToday(todayDate);
  }

  next = ensureTaskAssigned(next, deps);
  return next;
}

export async function markOutcome(state, outcome, deps = {}) {
  const allowed = new Set(['done', 'missed', 'blocked']);
  if (!allowed.has(outcome)) return state;

  let next = cloneState(state);
  const activeToday = next.today || createDefaultToday();
  const taskId = activeToday.primaryTaskId || '';
  const taskText = activeToday.primaryTaskText || '';
  const resolved = getTask(next.plan, taskId);
  const stage = resolved.stage || getActiveStage(next.plan);

  const entry = {
    date: activeToday.date || isoDateNow(),
    outcome,
    taskId,
    taskTitle: taskText,
    stageId: stage?.id || '',
    source: deps.source || 'manual',
    createdAt: new Date().toISOString(),
  };
  next.history.entries.push(entry);

  if (outcome === 'done' && taskId) {
    next.plan = markTaskDone(next.plan, taskId);
    next.history.successStreak = (next.history.successStreak || 0) + 1;
    next.history.missStreak = 0;
    const overall = overallProgress(next.plan);
    const stageRef = stage || getActiveStage(next.plan);
    const stageProg = stageRef ? stageProgress(stageRef) : { done: 0, total: 0, pct: 0 };
    next.ui.feedback = `Completed. Overall progress ${overall.done}/${overall.total} (${overall.pct}%). Stage progress ${stageProg.done}/${stageProg.total}.`;
    next.today.forceTaskId = '';
  } else if (outcome === 'missed') {
    next.history.successStreak = 0;
    next.history.missStreak = (next.history.missStreak || 0) + 1;
    next = await applyMissedAdaptation(next, deps);
  } else if (outcome === 'blocked') {
    next.history.successStreak = 0;
    // blocked does not count as failure streak
    next = await applyBlockedAdaptation(next, deps);
    next.today.forceTaskId = '';
  }

  next.today.status = outcome;
  next.today.lastOutcomeAt = new Date().toISOString();
  next = ensureTaskAssigned(next, deps, { allowSameDateReset: true });
  return next;
}

export function skipToNextBest(state, deps = {}) {
  let next = cloneState(state);
  if (next.today?.forceTaskId) {
    next.ui.feedback = 'Execution enforced for current task. Complete it before skipping.';
    return next;
  }
  const currentTaskId = next.today?.primaryTaskId || '';
  if (currentTaskId) {
    next.today.skippedTaskIds = Array.isArray(next.today.skippedTaskIds) ? next.today.skippedTaskIds : [];
    if (!next.today.skippedTaskIds.includes(currentTaskId)) next.today.skippedTaskIds.push(currentTaskId);
  }
  next = ensureTaskAssigned(next, deps);
  next.ui.feedback = 'Switched to next best valid task in current stage.';
  return next;
}

function ensureTaskAssigned(state, deps = {}, options = {}) {
  let next = cloneState(state);
  next.plan = recalculatePlan(next.plan);
  const todayDate = isoDateNow(deps.now || new Date());
  if (!next.today) next.today = createDefaultToday(todayDate);
  if (next.today.date !== todayDate || options.allowSameDateReset) {
    next.today = {
      ...createDefaultToday(todayDate),
      skippedTaskIds: [],
      forceTaskId: options.allowSameDateReset ? next.today.forceTaskId || '' : '',
    };
  }

  if (next.today.forceTaskId) {
    const forced = getTask(next.plan, next.today.forceTaskId);
    if (forced.task && forced.task.status === 'todo') {
      const prog = stageProgress(forced.stage);
      next.today.primaryTaskId = forced.task.id;
      next.today.primaryTaskText = forced.task.title;
      next.today.status = 'pending';
      next.today.reason = 'Execution required: complete this task to recover momentum.';
      next.today.stageProgressHint = `${prog.done}/${prog.total} tasks completed in this stage`;
      return next;
    }
    next.today.forceTaskId = '';
  }

  const selected = selectTask(next.plan, next.history, next.today);
  if (selected) {
    const { stage, task } = selected;
    const prog = stageProgress(stage);
    next.today.primaryTaskId = task.id;
    next.today.primaryTaskText = task.title;
    next.today.status = 'pending';
    next.today.reason = buildReason(next.plan, stage, task);
    next.today.stageProgressHint = `${prog.done}/${prog.total} tasks completed in this stage`;
    next.today.attemptCount = Number(next.today.attemptCount || 0);
    next.today.adjustmentLevel = Number(next.today.adjustmentLevel || 0);
    return next;
  }

  // No task should ever be empty: assign enforced completion maintenance task.
  next.today.primaryTaskId = 'meta-next-goal';
  next.today.primaryTaskText = 'Define next goal and deadline for the next execution cycle';
  next.today.status = 'pending';
  next.today.reason = 'Current plan is complete. This keeps execution momentum alive.';
  next.today.stageProgressHint = 'All planned stage tasks are complete';
  return next;
}

function selectTask(plan, history, today) {
  const stage = getActiveStage(plan);
  if (!stage) return null;
  const skipped = new Set(Array.isArray(today?.skippedTaskIds) ? today.skippedTaskIds : []);
  const blockedRecently = new Set(recentTaskOutcomes(history.entries, 'blocked', 3).map((entry) => entry.taskId));
  const missedRecently = new Set(recentTaskOutcomes(history.entries, 'missed', 2).map((entry) => entry.taskId));

  const candidates = (stage.tasks || [])
    .filter((task) => task.status === 'todo')
    .filter((task) => !skipped.has(task.id))
    .filter((task) => isTaskValidForToday(task));

  const ranked = candidates
    .map((task, idx) => {
      let score = taskPriorityWeight(task.priority) - idx;
      if (blockedRecently.has(task.id)) score -= 14;
      if (missedRecently.has(task.id)) score -= 10;
      return { stage, task, score };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0] || null;
}

function isTaskValidForToday(task) {
  const estimate = Number(task.estimateHours || 2);
  if (!Number.isFinite(estimate) || estimate < 1 || estimate > 3) return false;
  const text = String(task.title || '').trim();
  if (!text) return false;
  if (text.length < 6) return false;
  return true;
}

function buildReason(plan, stage, task) {
  const goal = plan.goal || 'your goal';
  return `Completing "${task.title}" directly advances stage "${stage.title}" toward ${goal}.`;
}

async function applyMissedAdaptation(state, deps) {
  let next = cloneState(state);
  const misses = Number(next.history.missStreak || 0);
  const todayTaskId = next.today?.primaryTaskId || '';
  if (!todayTaskId) return next;

  const lookup = getTask(next.plan, todayTaskId);
  if (!lookup.task || !lookup.stage) return next;

  const currentLevel = Number(next.today.adjustmentLevel || 0);
  if (misses >= 3 && currentLevel >= MAX_SIMPLIFICATION_LEVEL) {
    next.ui.feedback = 'Execution lock: complete this task before further scope changes.';
    next.today.forceTaskId = todayTaskId;
    return next;
  }

  if (misses === 1 || misses === 2) {
    const adjustmentLevel = Math.min(MAX_SIMPLIFICATION_LEVEL, currentLevel + 1);
    const adjusted = await getAdjustedTaskText(lookup.task, lookup.stage, next, deps, {
      mode: 'missed',
      adjustmentLevel,
    });
    next = replaceTaskTitle(next, lookup.task.id, adjusted.text, adjusted.estimateHours);
    next.today.adjustmentLevel = adjustmentLevel;
    next.ui.feedback = misses === 1
      ? 'Task simplified after one miss. Focus on the smaller step today.'
      : 'Repeated misses detected. Scope reduced and task tightened.';
    if (misses >= 2) {
      next = await maybeRebuildCurrentStage(next, deps, 'repeated_missed');
    }
  }
  return next;
}

async function applyBlockedAdaptation(state, deps) {
  let next = cloneState(state);
  const todayTaskId = next.today?.primaryTaskId || '';
  if (!todayTaskId) return next;
  const lookup = getTask(next.plan, todayTaskId);
  if (!lookup.task || !lookup.stage) return next;

  const adjustmentLevel = Math.min(MAX_SIMPLIFICATION_LEVEL, Number(next.today.adjustmentLevel || 0) + 1);
  const adjusted = await getAdjustedTaskText(lookup.task, lookup.stage, next, deps, {
    mode: 'blocked',
    adjustmentLevel,
  });
  next = replaceTaskTitle(next, lookup.task.id, adjusted.text, adjusted.estimateHours);
  next.today.adjustmentLevel = adjustmentLevel;
  next.ui.feedback = 'Blocked acknowledged. Task adjusted immediately.';
  return next;
}

async function getAdjustedTaskText(task, stage, state, deps, context) {
  const deterministic = deterministicAdjust(task.title, context.adjustmentLevel);
  if (!deps.aiAdjustTodayTask) {
    return deterministic;
  }
  try {
    const aiResult = await deps.aiAdjustTodayTask({
      task,
      stage,
      context: {
        goal: state.plan.goal,
        stageObjective: stage.objective,
        mode: context.mode,
        adjustmentLevel: context.adjustmentLevel,
      },
    });
    const text = String(aiResult?.title || '').trim();
    const hours = Number(aiResult?.estimateHours);
    if (text && Number.isFinite(hours) && hours >= 1 && hours <= 3) {
      return { text, estimateHours: hours };
    }
    if (text) return { text, estimateHours: 1 };
  } catch (_error) {
    // fall through to deterministic
  }
  return deterministic;
}

function deterministicAdjust(original, level) {
  const base = String(original || '').replace(/\s+/g, ' ').trim();
  if (!base) return { text: 'Prepare one concrete next step and ship it today', estimateHours: 1 };
  if (level <= 1) return { text: `Complete first concrete part: ${truncate(base, 70)}`, estimateHours: 1 };
  return { text: `Deliver one minimal executable output for: ${truncate(base, 60)}`, estimateHours: 1 };
}

async function maybeRebuildCurrentStage(state, deps, reason) {
  if (!deps.aiRebuildPlanPartially) return state;
  if ((state.history.missStreak || 0) < 2) return state;
  const active = getActiveStage(state.plan);
  if (!active) return state;
  try {
    const rebuilt = await deps.aiRebuildPlanPartially({
      plan: state.plan,
      stageId: active.id,
      reason,
    });
    const next = cloneState(state);
    next.plan = recalculatePlan(rebuilt);
    next.ui.feedback = 'Current stage adjusted after repeated misses.';
    return next;
  } catch (_error) {
    return state;
  }
}

function replaceTaskTitle(state, taskId, text, estimateHours) {
  const next = cloneState(state);
  next.plan = {
    ...next.plan,
    stages: (next.plan.stages || []).map((stage) => ({
      ...stage,
      tasks: (stage.tasks || []).map((task) =>
        task.id === taskId
          ? { ...task, title: String(text || task.title), estimateHours: clamp(estimateHours, 1, 3) }
          : task
      ),
    })),
  };
  next.plan = recalculatePlan(next.plan);
  return next;
}

function recentTaskOutcomes(entries, outcome, daysBack = 2) {
  const recent = [];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  for (const entry of entries || []) {
    if (entry.outcome !== outcome) continue;
    const date = new Date(entry.createdAt || `${entry.date}T00:00:00`);
    if (Number.isNaN(date.getTime()) || date < cutoff) continue;
    recent.push(entry);
  }
  return recent;
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function truncate(value, max = 80) {
  return String(value || '').slice(0, max);
}

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}
