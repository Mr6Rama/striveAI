import { overallProgress, stageProgress } from '../../domain/plan-engine.js';

export function renderRoadmap(state) {
  const goal = state.plan.goal || 'No plan goal set';
  const progress = overallProgress(state.plan);
  setText('roadmap-goal', goal);
  setText('roadmap-progress', `Overall progress: ${progress.done}/${progress.total} tasks (${progress.pct}%).`);

  const host = document.getElementById('roadmap-stages');
  if (!host) return;
  const stages = state.plan.stages || [];
  if (!stages.length) {
    host.innerHTML = '<div class="stage">No stages available yet.</div>';
    return;
  }

  host.innerHTML = stages
    .map((stage) => {
      const prog = stageProgress(stage);
      const tasks = (stage.tasks || [])
        .map(
          (task) => `<div class="task-row ${task.status === 'done' ? 'done' : ''}">
            <span>${escapeHtml(task.title)}</span>
            <span class="task-prio">${escapeHtml(task.priority)} · ${task.estimateHours}h · ${task.status}</span>
          </div>`
        )
        .join('');
      return `<article class="stage ${stage.status}">
        <div class="stage-head">
          <div>
            <div class="stage-title">${escapeHtml(stage.title)}</div>
            <div class="stage-meta">${escapeHtml(stage.objective)}</div>
          </div>
          <div class="stage-meta">${prog.done}/${prog.total} · ${prog.pct}% · ${escapeHtml(stage.status)}</div>
        </div>
        <div class="task-list">${tasks}</div>
      </article>`;
    })
    .join('');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value || '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

