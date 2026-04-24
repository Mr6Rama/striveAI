import { overallProgress, stageProgress } from '../../domain/plan-engine.js';

export function renderRoadmap(state) {
  const { plan, stats } = state;

  const progress = overallProgress(plan);
  
  setText('rm-pct', `${progress.pct}%`);
  setText('rm-tasks', `${progress.done}/${progress.total}`);
  setText('rm-sess', stats.completedSessions || 0);
  setText('rm-streak', `${stats.dayStreak || 0}🔥`);
  
  const stages = plan.stages || [];
  const currentStageIdx = stages.findIndex(s => s.status === 'active');
  setText('rm-ms', currentStageIdx !== -1 ? currentStageIdx + 1 : 0);
  setText('rm-total-weeks', `of ${stages.length} milestones`);

  const host = document.getElementById('rb'); // В твоем HTML контейнер называется 'rb'
  if (!host) return;

  if (!stages.length) {

    return;
  }
  host.innerHTML = stages
    .map((stage, idx) => {
      const prog = stageProgress(stage);
      const tasks = (stage.tasks || [])
        .map(
          (task) => `
          <div class="task-row ${task.status === 'done' ? 'done' : ''}">
            <div class="task-info">
              <span class="task-check">${task.status === 'done' ? '●' : '○'}</span>
              <span class="task-title">${escapeHtml(task.title)}</span>
            </div>
            <span class="task-meta">${task.estimateHours}h · ${escapeHtml(task.priority)}</span>
          </div>`
        )
        .join('');

      return `
      <article class="rm-stage ${stage.status}">
        <div class="rm-stage-header">
          <div class="rm-stage-number">Milestone ${idx + 1}</div>
          <div class="rm-stage-info">
            <h3 class="rm-stage-title">${escapeHtml(stage.title)}</h3>
            <p class="rm-stage-desc">${escapeHtml(stage.objective)}</p>
          </div>
          <div class="rm-stage-stats">
            <div class="rm-stage-pct">${prog.pct}%</div>
            <div class="rm-stage-count">${prog.done}/${prog.total} tasks</div>
          </div>
        </div>
        <div class="rm-task-list">${tasks}</div>
      </article>`;
    })
    .join('');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value ?? '';
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
