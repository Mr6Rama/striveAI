export const STORAGE_KEYS = Object.freeze({
  user: 'sa_user',
  plan: 'sa_plan',
  today: 'sa_today',
  history: 'sa_history',
});

export function createDefaultUser() {
  return {
    id: '',
    email: '',
    name: '',
    goal: '',
    deadline: '',
  };
}

export function createDefaultUser() {
  return {
    id: '',
    email: '',
    name: '',
    goal: '',
    deadline: '',
    niche: '',           // Здесь будет храниться выбранная сфера (IT, Бизнес и т.д.)
    executionStyle: '',  // Здесь будет текст о стиле (до 300 символов)
    // --------------------------
  };
}
export function createDefaultToday(date = isoDateNow()) {
  return {
    date,
    primaryTaskId: '',
    primaryTaskText: '',
    status: 'pending', // pending | done | missed | blocked
    reason: '',
    stageProgressHint: '',
    attemptCount: 0,
    adjustmentLevel: 0,
    skippedTaskIds: [],
    forceTaskId: '',
    lastOutcomeAt: '',
  };
}

export function createDefaultHistory() {
  return {
    entries: [],
    successStreak: 0,
    missStreak: 0,
  };
}

export function createInitialState() {
  return {
    user: createDefaultUser(),
    plan: createDefaultPlan(),
    today: createDefaultToday(),
    history: createDefaultHistory(),
    ui: {
      activeRoute: '/',
      authReady: false,
      loading: false,
      feedback: '',
      message: '',
      error: '',
    },
  };
}

export function isoDateNow(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
