import { normalizePlan } from '../domain/plan-engine.js';

export async function generatePlan(input) {
  try {
    const prompt = buildPlanPrompt(input);
    const schema = planSchema();
    const aiData = await requestJson({
      action: 'plan_generate',
      prompt,
      schema,
      maxTokens: 2400,
      temperature: 0.25,
    });
    const normalized = normalizePlan(aiData, {
      goal: input.goal,
      deadline: input.deadline,
    });
    return normalized;
  } catch (_error) {
    return deterministicPlanFallback(input);
  }
}

export async function rebuildPlanPartially({ plan, stageId, reason }) {
  try {
    const stage = (plan.stages || []).find((item) => item.id === stageId);
    if (!stage) throw new Error('stage not found');
    const prompt = buildPartialRebuildPrompt(plan, stage, reason);
    const schema = stageSchema();
    const rebuiltStage = await requestJson({
      action: 'plan_rebuild_partial',
      prompt,
      schema,
      maxTokens: 1400,
      temperature: 0.2,
    });
    const merged = {
      ...plan,
      stages: (plan.stages || []).map((item) => (item.id === stageId ? { ...item, ...rebuiltStage, id: stageId } : item)),
    };
    return normalizePlan(merged, { goal: plan.goal, deadline: plan.deadline });
  } catch (_error) {
    return deterministicPartialRebuild(plan, stageId);
  }
}

export async function adjustTodayTask({ task, stage, context }) {
  try {
    const prompt = buildTodayAdjustPrompt({ task, stage, context });
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'estimateHours'],
      properties: {
        title: { type: 'string', maxLength: 120 },
        estimateHours: { type: 'number' },
      },
    };
    const adjusted = await requestJson({
      action: 'today_adjust',
      prompt,
      schema,
      maxTokens: 280,
      temperature: 0.15,
    });
    const title = String(adjusted?.title || '').trim();
    const estimateHours = Number(adjusted?.estimateHours);
    if (!title) throw new Error('bad adjusted title');
    return {
      title,
      estimateHours: clamp(estimateHours, 1, 3),
    };
  } catch (_error) {
    return deterministicTodayAdjust(task, context?.adjustmentLevel || 1);
  }
}

async function requestJson({ action, prompt, schema, maxTokens, temperature }) {
  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      prompt,
      systemCtx: '',
      maxTokens,
      opts: {
        temperature,
        responseMimeType: 'application/json',
        responseJsonSchema: schema,
      },
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok || payload.error) {
    throw new Error(payload.error || 'AI request failed');
  }
  return safeParseJson(payload.text || '');
}

function deterministicPlanFallback(input) {
  const goal = String(input.goal || 'Reach the target outcome').trim();
  const deadline = String(input.deadline || '').trim();
  return normalizePlan(
    {
      id: `plan-fallback-${Date.now()}`,
      goal,
      deadline,
      stages: [
        {
          id: 'stage-1',
          title: 'Foundation',
          objective: 'Set minimal execution baseline and unblock first delivery.',
          tasks: [
            { id: 's1-t1', title: `Define one clear output for "${goal}"`, priority: 'high', estimateHours: 1, status: 'todo' },
            { id: 's1-t2', title: 'Prepare required inputs for first delivery', priority: 'med', estimateHours: 2, status: 'todo' },
            { id: 's1-t3', title: 'Ship first verifiable micro-result', priority: 'high', estimateHours: 2, status: 'todo' },
          ],
        },
        {
          id: 'stage-2',
          title: 'Execution',
          objective: 'Deliver core value with consistent output.',
          tasks: [
            { id: 's2-t1', title: 'Ship one core implementation step', priority: 'high', estimateHours: 3, status: 'todo' },
            { id: 's2-t2', title: 'Validate result against stage objective', priority: 'med', estimateHours: 2, status: 'todo' },
            { id: 's2-t3', title: 'Fix one critical gap discovered in validation', priority: 'med', estimateHours: 2, status: 'todo' },
          ],
        },
        {
          id: 'stage-3',
          title: 'Completion',
          objective: 'Finalize and close objective with measurable outcome.',
          tasks: [
            { id: 's3-t1', title: 'Deliver final required output', priority: 'high', estimateHours: 3, status: 'todo' },
            { id: 's3-t2', title: 'Run final outcome check and document proof', priority: 'med', estimateHours: 2, status: 'todo' },
            { id: 's3-t3', title: 'Prepare next-goal transition step', priority: 'low', estimateHours: 1, status: 'todo' },
          ],
        },
      ],
    },
    { goal, deadline }
  );
}

function deterministicPartialRebuild(plan, stageId) {
  const target = (plan.stages || []).find((stage) => stage.id === stageId);
  if (!target) return plan;
  const rebuilt = {
    ...plan,
    stages: (plan.stages || []).map((stage) => {
      if (stage.id !== stageId) return stage;
      return {
        ...stage,
        tasks: [
          { id: `${stageId}-r1`, title: `Re-focus one executable action for ${stage.title}`, priority: 'high', estimateHours: 1, status: 'todo', stageId },
          { id: `${stageId}-r2`, title: `Ship one measurable output for ${stage.title}`, priority: 'med', estimateHours: 2, status: 'todo', stageId },
          { id: `${stageId}-r3`, title: `Validate output and close one gap in ${stage.title}`, priority: 'med', estimateHours: 2, status: 'todo', stageId },
        ],
      };
    }),
  };
  return normalizePlan(rebuilt, { goal: plan.goal, deadline: plan.deadline });
}

function deterministicTodayAdjust(task, level) {
  const base = String(task?.title || 'Execute one concrete step').trim();
  if (level <= 1) {
    return { title: `Deliver the smallest first part of: ${base}`.slice(0, 120), estimateHours: 1 };
  }
  return { title: `Complete one minimal verifiable output for: ${base}`.slice(0, 120), estimateHours: 1 };
}

function buildPlanPrompt(input) {
  return `Create an execution plan.
Goal: ${String(input.goal || '').trim()}
Deadline: ${String(input.deadline || '').trim()}

Rules:
- Return 3 stages.
- Max 5 tasks per stage.
- Every task must be executable in 1-3 hours.
- Every task must be concrete, action-based, single-step.
- Status must be todo.
- Include priority high|med|low.
- Keep concise. Return JSON only.`;
}

function buildPartialRebuildPrompt(plan, stage, reason) {
  return `Partially rebuild one stage in execution plan.
Goal: ${plan.goal}
Stage: ${stage.title}
Objective: ${stage.objective}
Reason: ${reason || 'adaptation needed'}

Rules:
- Max 5 tasks.
- 1-3 hours each.
- Concrete, action-based, single-step.
- Include priority high|med|low.
- Return JSON only for one stage object.`;
}

function buildTodayAdjustPrompt({ task, stage, context }) {
  return `Adjust today's task.
Current task: ${task.title}
Stage: ${stage.title}
Stage objective: ${stage.objective}
Mode: ${context.mode}
Adjustment level: ${context.adjustmentLevel}

Rules:
- Return one task only.
- Must be executable in 1-3 hours.
- Must be concrete and single-step.
- Return JSON only.`;
}

function planSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['goal', 'deadline', 'stages'],
    properties: {
      goal: { type: 'string' },
      deadline: { type: 'string' },
      stages: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        items: stageSchema(),
      },
    },
  };
}

function stageSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'objective', 'tasks'],
    properties: {
      id: { type: 'string' },
      title: { type: 'string', maxLength: 80 },
      objective: { type: 'string', maxLength: 180 },
      tasks: {
        type: 'array',
        minItems: 1,
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'priority', 'estimateHours', 'status'],
          properties: {
            id: { type: 'string' },
            title: { type: 'string', maxLength: 120 },
            priority: { type: 'string', enum: ['high', 'med', 'low'] },
            estimateHours: { type: 'number' },
            status: { type: 'string', enum: ['todo', 'done'] },
          },
        },
      },
    },
  };
}

function safeParseJson(raw) {
  const text = String(raw || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
  try {
    return JSON.parse(text);
  } catch (_error) {
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first >= 0 && last > first) {
      return JSON.parse(text.slice(first, last + 1));
    }
    throw new Error('Failed to parse AI JSON');
  }
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  if (number < min) return min;
  if (number > max) return max;
  return Math.round(number * 10) / 10;
}

