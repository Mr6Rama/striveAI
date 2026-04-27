import { isoDateNow } from '../core/state-model.js';

const VALID_PRIORITIES = new Set(['high', 'med', 'low']);
const VAGUE_PATTERNS = [
  /\bwork on\b/i,
  /\bimprove\b/i,
  /\bexplore\b/i,
  /\bthink about\b/i,
  /\bresearch\b/i,
  /\bresearch market\b/i,
  /\bbuild prototype\b/i,
  /\blaunch campaign\b/i,
  /\bvalidate demand\b/i,
  /\bbuild mvp\b/i,
  /\bmisc\b/i,
  /\bvarious\b/i,
];
const MULTI_STEP_PATTERNS = [/\band\b/i, /->/i, /\bthen\b/i, /,/];

// FIX: removed duplicated code block — function now has one body and one return
export function normalizePlan(rawPlan, context = {}) {
  const goal = String(rawPlan?.goal || context.goal || '').trim();
  const deadline = String(rawPlan?.deadline || context.deadline || '').trim();
  const niche = String(rawPlan?.niche || context.niche || '').trim();
  const executionStyle = String(rawPlan?.executionStyle || context.executionStyle || '').trim().slice(0, 300);
  const source = String(rawPlan?.source || context.source || '').trim();
  const createdAt = String(rawPlan?.createdAt || context.createdAt || '').trim();
  const model = String(rawPlan?.model || context.model || '').trim();
  const promptHash = String(rawPlan?.promptHash || context.promptHash || '').trim();
  const rawStages = Array.isArray(rawPlan?.stages) ? rawPlan.stages : [];
  const stages = rawStages.length
    ? rawStages
    : [createFallbackStage(goal, 0), createFallbackStage(goal, 1), createFallbackStage(goal, 2)];

  const normalizedStages = stages.map((stage, stageIndex) => {
    const stageId = safeId(stage?.id, `stage-${stageIndex + 1}`);
    const title = tidy(stage?.title) || `Stage ${stageIndex + 1}`;
    const objective = tidy(stage?.objective) || `Advance "${goal || 'goal'}" with concrete output.`;
    const stageSource = tidy(stage?.source) || (rawStages.length ? 'ai' : 'fallback');

    const rawTasks = Array.isArray(stage?.tasks) ? stage.tasks : [];
    const cleaned = rawTasks.map((task, taskIndex) =>
      normalizeTask(task, {
        stageId,
        stageIndex,
        taskIndex,
        stageTitle: title,
        stageObjective: objective,
        goal,
      })
    );
    const unique = dedupeTasks(cleaned).slice(0, 5);
    const tasks = unique.length
      ? unique
      : createFallbackTasks({ stageId, stageTitle: title, stageObjective: objective, goal, stageIndex });

    return {
      id: stageId,
      title,
      objective,
      status: 'locked',
      source: stageSource,
      titleSource: tidy(stage?.titleSource) || (rawStages.length ? 'ai' : 'fallback'),
      tasks: tasks.map((task) => ({
        ...task,
        status: task.status === 'done' ? 'done' : 'todo',
        stageId,
      })),
    };
  });

  const plan = {
    id: safeId(rawPlan?.id, `plan-${isoDateNow()}-${Math.floor(Date.now() / 1000)}`),
    goal,
    deadline,
    niche,
    executionStyle,
    source: source || (rawStages.length ? 'ai' : 'fallback'),
    createdAt: createdAt || isoDateNow(),
    model,
    promptHash,
    currentStageId: '',
    stages: normalizedStages,
  };
  return recalculatePlan(plan);
}

export function recalculatePlan(plan) {
  const next = {
    ...plan,
    stages: (plan.stages || []).map((stage) => ({
      ...stage,
      tasks: (stage.tasks || []).slice(0, 5).map((task) => ({
        ...task,
        status: task.status === 'done' ? 'done' : 'todo',
      })),
    })),
  };
  const activeStage = firstUnfinishedStage(next);
  next.currentStageId = activeStage ? activeStage.id : '';
  next.stages = next.stages.map((stage, index) => {
    if (isStageDone(stage)) return { ...stage, status: 'done' };
    if (activeStage && stage.id === activeStage.id) return { ...stage, status: 'active' };
    if (!activeStage && index === next.stages.length - 1) return { ...stage, status: 'done' };
    return { ...stage, status: activeStage ? 'locked' : 'done' };
  });
  return next;
}

export function markTaskDone(plan, taskId) {
  const updated = {
    ...plan,
    stages: (plan.stages || []).map((stage) => ({
      ...stage,
      tasks: (stage.tasks || []).map((task) =>
        task.id === taskId ? { ...task, status: 'done' } : task
      ),
    })),
  };
  return recalculatePlan(updated);
}

export function getActiveStage(plan) {
  return (plan.stages || []).find((stage) => stage.status === 'active') || null;
}

export function getTask(plan, taskId) {
  for (const stage of plan.stages || []) {
    for (const task of stage.tasks || []) {
      if (task.id === taskId) return { stage, task };
    }
  }
  return { stage: null, task: null };
}

export function stageProgress(stage) {
  const total = Math.max(1, (stage.tasks || []).length);
  const done = (stage.tasks || []).filter((task) => task.status === 'done').length;
  return {
    done,
    total,
    pct: Math.round((done / total) * 100),
  };
}

export function overallProgress(plan) {
  const tasks = (plan.stages || []).flatMap((stage) => stage.tasks || []);
  const total = Math.max(1, tasks.length);
  const done = tasks.filter((task) => task.status === 'done').length;
  return {
    done,
    total,
    pct: Math.round((done / total) * 100),
  };
}

export function isPlanReady(plan) {
  return Boolean(plan?.goal && Array.isArray(plan?.stages) && plan.stages.length);
}

export function taskPriorityWeight(priority) {
  if (priority === 'high') return 30;
  if (priority === 'med') return 20;
  return 10;
}

export function enforceTaskQuality(task, context = {}) {
  return normalizeTask(task, {
    stageId: context.stageId || 'stage-x',
    stageIndex: Number(context.stageIndex) || 0,
    taskIndex: Number(context.taskIndex) || 0,
    stageTitle: context.stageTitle || 'Stage',
    stageObjective: context.stageObjective || '',
    goal: context.goal || '',
  });
}

function normalizeTask(task, ctx) {
  const rawTitle = tidy(task?.title || task?.text || '');
  const id = safeId(task?.id, `${ctx.stageId}-task-${ctx.taskIndex + 1}`);
  const extracted = extractSingleStep(rawTitle);
  const rewritten = rewriteIfNeeded(extracted || rawTitle, ctx);
  const title = rewritten || fallbackTaskTitle(ctx);
  const priority = VALID_PRIORITIES.has(task?.priority) ? task.priority : fallbackPriority(ctx);
  const estimateHours = clampEstimate(task?.estimateHours);
  const status = task?.status === 'done' ? 'done' : 'todo';
  return { id, title, priority, estimateHours, stageId: ctx.stageId, status };
}

function rewriteIfNeeded(title, ctx) {
  let out = tidy(title);
  if (!out) return fallbackTaskTitle(ctx);
  if (isVague(out)) out = concretize(out, ctx);
  if (isMultiStep(out)) out = extractSingleStep(out);
  out = tidy(out);
  if (!out) out = fallbackTaskTitle(ctx);
  return out;
}

function concretize(title, ctx) {
  const objective = ctx.stageObjective || ctx.stageTitle || ctx.goal || 'current stage';
  const root = tidy(title.replace(/\b(work on|improve|explore|think about|research)\b/gi, ''));
  if (root) return `Produce concrete output for ${objective}: ${root}`.slice(0, 120);
  return fallbackTaskTitle(ctx);
}

function extractSingleStep(title) {
  if (!title) return '';
  const splitters = [' then ', ' and ', ' -> ', ',', ';'];
  let reduced = title;
  for (const splitter of splitters) {
    const index = reduced.toLowerCase().indexOf(splitter.trim());
    if (index > 0) {
      reduced = reduced.slice(0, index);
      break;
    }
  }
  return tidy(reduced);
}

function fallbackTaskTitle(ctx) {
  const stageName = tidy(ctx.stageTitle) || `Stage ${ctx.stageIndex + 1}`;
  const options = [
    `Interview one real user for ${stageName}`,
    `Ship one verifiable step for ${stageName}`,
    `Validate one result tied to ${stageName}`,
  ];
  return options[ctx.taskIndex % options.length];
}

function fallbackPriority(ctx) {
  if (ctx.taskIndex === 0) return 'high';
  if (ctx.taskIndex <= 2) return 'med';
  return 'low';
}

function createFallbackStage(goal, idx) {
  const project = tidy(goal) || 'the project';
  return {
    id: `stage-${idx + 1}`,
      title:
        idx === 0
          ? `Confirm demand for ${project}`
          : idx === 1
            ? `Ship the first working flow for ${project}`
            : `Prove repeatable results for ${project}`,
    objective: goal ? `Advance goal "${goal}" with measurable output.` : 'Advance toward target outcome.',
    source: 'fallback',
    titleSource: 'fallback',
    titleSourceReason: 'deterministic_fallback',
    tasks: [],
  };
}

function createFallbackTasks(ctx) {
  return [
    {
      id: `${ctx.stageId}-task-1`,
      title: fallbackTaskTitle({ ...ctx, taskIndex: 0 }),
      priority: 'high',
      estimateHours: 2,
      stageId: ctx.stageId,
      status: 'todo',
      titleSource: 'fallback',
    },
    {
      id: `${ctx.stageId}-task-2`,
      title: fallbackTaskTitle({ ...ctx, taskIndex: 1 }),
      priority: 'med',
      estimateHours: 2,
      stageId: ctx.stageId,
      status: 'todo',
      titleSource: 'fallback',
    },
    {
      id: `${ctx.stageId}-task-3`,
      title: fallbackTaskTitle({ ...ctx, taskIndex: 2 }),
      priority: 'low',
      estimateHours: 1,
      stageId: ctx.stageId,
      status: 'todo',
      titleSource: 'fallback',
    },
  ];
}

function dedupeTasks(tasks) {
  const seen = new Set();
  const output = [];
  for (const task of tasks) {
    const key = normalizeLoose(task.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(task);
  }
  return output;
}

function firstUnfinishedStage(plan) {
  return (plan.stages || []).find((stage) => !isStageDone(stage)) || null;
}

function isStageDone(stage) {
  return Boolean((stage.tasks || []).length) && (stage.tasks || []).every((task) => task.status === 'done');
}

function clampEstimate(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  if (parsed < 1) return 1;
  if (parsed > 3) return 3;
  return Math.round(parsed * 10) / 10;
}

function isVague(text) {
  return VAGUE_PATTERNS.some((pattern) => pattern.test(text));
}

function isMultiStep(text) {
  return MULTI_STEP_PATTERNS.some((pattern) => pattern.test(text));
}

function safeId(value, fallback) {
  const raw = tidy(String(value || ''));
  if (!raw) return fallback;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '-');
}

function tidy(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeLoose(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
