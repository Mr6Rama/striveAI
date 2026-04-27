import { normalizePlan } from '../domain/plan-engine.js';

export async function generatePlan(input) {
  try {
    const prompt = buildPlanPrompt(input);
    const schema = planSchema();
    // FIX: action 'plan_generate' did not exist in AI_ACTIONS on server — corrected to 'roadmap'
    const aiData = await requestJson({
      action: 'roadmap',
      prompt,
      schema,
      maxTokens: 1200,
      temperature: 0.2,
    });
    const normalized = normalizePlan(aiData, {
      goal: input.goal,
      deadline: input.deadline,
      niche: input.niche,
      executionStyle: input.executionStyle,
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
      action: 'tasks',
      prompt,
      schema,
      maxTokens: 1500,
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
      action: 'task_detail',
      prompt,
      schema,
      maxTokens: 250,
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
  const res = await fetch('/api/openai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      prompt,
      systemCtx: '',
      maxTokens,
      opts: {
        temperature,
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
  const project = String(input.project || input.niche || goal || 'the project').trim();
  return normalizePlan(
    {
      id: `plan-fallback-${Date.now()}`,
      goal,
      deadline,
      source: 'fallback',
      createdAt: new Date().toISOString(),
      model: 'deterministic-fallback',
      promptHash: '',
      stages: [
        {
          id: 'stage-1',
          title: `Confirm demand for ${project}`,
          objective: 'Set a minimal execution baseline and confirm the project is worth building.',
          tasks: [
            { id: 's1-t1', title: `Interview 3 real users about ${project}`, priority: 'high', estimateHours: 2, status: 'todo' },
            { id: 's1-t2', title: 'Capture the top 3 pain points with quotes', priority: 'med', estimateHours: 2, status: 'todo' },
            { id: 's1-t3', title: `Define the first success signal for "${goal}"`, priority: 'high', estimateHours: 2, status: 'todo' },
          ],
        },
        {
          id: 'stage-2',
          title: `Ship the first working flow for ${project}`,
          objective: 'Deliver core value with one visible, testable flow.',
          tasks: [
            { id: 's2-t1', title: 'Build the smallest working version of the core flow', priority: 'high', estimateHours: 3, status: 'todo' },
            { id: 's2-t2', title: 'Track completion of the core action', priority: 'med', estimateHours: 2, status: 'todo' },
            { id: 's2-t3', title: 'Fix the biggest blocker found in the first test', priority: 'med', estimateHours: 2, status: 'todo' },
          ],
        },
        {
          id: 'stage-3',
          title: `Prove repeatable results for ${project}`,
          objective: 'Finalize the loop with a measurable, repeatable outcome.',
          tasks: [
            { id: 's3-t1', title: 'Repeat the core flow with 5 real users', priority: 'high', estimateHours: 3, status: 'todo' },
            { id: 's3-t2', title: 'Document the repeatable steps and proof points', priority: 'med', estimateHours: 2, status: 'todo' },
            { id: 's3-t3', title: 'Define the next execution lever from the evidence', priority: 'low', estimateHours: 1, status: 'todo' },
          ],
        },
      ],
    },
    {
      goal,
      deadline,
      niche: input.niche,
      executionStyle: input.executionStyle,
    }
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
          { id: `${stageId}-r1`, title: `Interview one user to re-scope ${stage.title}`, priority: 'high', estimateHours: 1, status: 'todo', stageId },
          { id: `${stageId}-r2`, title: `Ship one measurable output for ${stage.title}`, priority: 'med', estimateHours: 2, status: 'todo', stageId },
          { id: `${stageId}-r3`, title: `Close the biggest gap found in ${stage.title}`, priority: 'med', estimateHours: 2, status: 'todo', stageId },
        ],
      };
    }),
  };
  return normalizePlan(rebuilt, { goal: plan.goal, deadline: plan.deadline });
}

function deterministicTodayAdjust(task, level) {
  const base = String(task?.title || 'Execute one concrete step').trim();
  if (level <= 1) {
    return { title: `Deliver the smallest verifiable step for: ${base}`.slice(0, 120), estimateHours: 1 };
  }
  return { title: `Complete one minimal verifiable output for: ${base}`.slice(0, 120), estimateHours: 1 };
}

function buildPlanPrompt(input) {
  const projectText = input.project ? `\nProject: ${input.project}` : '';
  const nicheText = input.niche ? `\nNiche/Industry: ${input.niche}` : '';
  const styleText = input.executionStyle ? `\nExecution Style: ${input.executionStyle}` : '';

  return `Create an execution plan.
Goal: ${String(input.goal || '').trim()}
Deadline: ${String(input.deadline || '').trim()}${nicheText}${styleText}
${projectText}

Rules:
- Return 3-5 stages. Prefer 3 unless the scope clearly needs more.
- Max 6 tasks per stage.
- Milestone titles must be specific, project-aware, and non-generic.
- Bad milestone titles: Validate, Build MVP, Launch, Growth, Discovery.
- Good milestone titles: Confirm founder demand for StriveAI, Ship daily execution loop, Prove 7-day retention.
- Every task must be concrete, action-based, single-step, and short.
- Bad task titles: Research market, Build prototype, Launch campaign.
- Good task titles: Interview 10 early-stage founders about execution failure, Add daily check-in completion tracking, Post 3 founder pain videos on TikTok.
- Status must be todo.
- Include priority high|med|low.
- Keep concise. Return JSON only.`;
}

function buildPartialRebuildPrompt(plan, stage, reason) {
  const styleText = plan.executionStyle ? `\nExecution Style: ${plan.executionStyle}` : '';
  return `Partially rebuild one stage in execution plan.
Goal: ${plan.goal}
Stage: ${stage.title}
Objective: ${stage.objective}
Reason: ${reason || 'adaptation needed'}${styleText}

Rules:
- Max 4 tasks.
- 1-3 hours each.
- Concrete, action-based, single-step, short.
- Use project-aware actions, not placeholders.
- Include priority high|med|low.
- Return JSON only for one stage object.`;
}

function buildTodayAdjustPrompt({ task, stage, context }) {
  const styleText = context.executionStyle ? `\nExecution Style: ${context.executionStyle}` : '';
  const nicheText = context.niche ? `\nNiche: ${context.niche}` : '';
  return `Adjust today's task.${nicheText}${styleText}
Current task: ${task.title}
Stage: ${stage.title}
Stage objective: ${stage.objective}
Mode: ${context.mode}
Adjustment level: ${context.adjustmentLevel}

Rules:
- Return one task only.
- Must be executable in 1-3 hours.
- Must be concrete and single-step.
- Avoid generic titles like research market, build prototype, launch campaign.
- No intro, no explanation, no extra notes.
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
          maxItems: 6,
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
