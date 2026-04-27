import { createInitialState } from './core/state-model.js';
import { getState, replaceState, subscribe, updateState } from './core/store.js';
import { initAuth, onAuthChanged, signIn, signOut, authErrorMessage, getDb } from './services/auth.js';
import { loadPersistedDomains, saveDomains } from './services/persistence.js';
import { generatePlan, rebuildPlanPartially, adjustTodayTask } from './services/ai.js';
import { bindOnboardingHandlers, renderOnboarding } from './ui/pages/onboarding.js';
import { bindTodayHandlers, renderToday } from './ui/pages/today.js';
import { bindSettingsHandlers, renderSettings } from './ui/pages/settings.js';
import { renderRoadmap } from './ui/pages/roadmap.js';
import { initRouter, navigate, normalizeRoute } from './ui/router.js';
import { getActiveStage, isPlanReady, normalizePlan } from './domain/plan-engine.js';
import { markOutcome, rolloverAndAssign, skipToNextBest } from './domain/today-engine.js';

let runtimeConfig = null;
let currentUser = null;
let rolloverTimer = null;

boot().catch((error) => {
  console.error(error);
  showAuthError('Failed to initialize app.');
});

async function boot() {
  runtimeConfig = await loadRuntimeConfig();
  initAuth(runtimeConfig);

  bindStaticHandlers();
  bindOnboardingHandlers({ onGenerate: handleGeneratePlan });
  bindTodayHandlers({
    onDone: () => handleTodayOutcome('done'),
    onMissed: () => handleTodayOutcome('missed'),
    onBlocked: () => handleTodayOutcome('blocked'),
    onSkip: handleSkipTodayTask,
  });
  bindSettingsHandlers({
    onSave: handleSaveSettings,
    onRebuild: handleRebuildCurrentStage,
  });

  initRouter(handleRouteChange);
  subscribe(renderApp);

  onAuthChanged(async (user) => {
    if (!user) {
      currentUser = null;
      clearRolloverTimer();
      replaceState(createInitialState());
      showAuth();
      return;
    }
    await handleSignedIn(user);
  });
}

function bindStaticHandlers() {
  document.getElementById('auth-signin-btn')?.addEventListener('click', async () => {
    const email = String(document.getElementById('auth-email')?.value || '').trim();
    const password = String(document.getElementById('auth-password')?.value || '').trim();
    if (!email || !password) {
      showAuthError('Enter email and password.');
      return;
    }
    setAuthStatus('Signing in...');
    try {
      await signIn(email, password);
      showAuthError('');
    } catch (error) {
      showAuthError(authErrorMessage(error));
    } finally {
      setAuthStatus('');
    }
  });

  document.getElementById('auth-signout-btn')?.addEventListener('click', async () => {
    await signOut();
  });

  document.getElementById('btn-complete-goal')?.addEventListener('click', handleGoalCompletion);
}

async function handleSignedIn(user) {
  currentUser = user;
  hideAuth();
  updateState((draft) => {
    draft.ui.loading = true;
    draft.ui.error = '';
    draft.ui.message = 'Loading workspace...';
    return draft;
  });

  const domains = await loadPersistedDomains({ userId: user.uid, db: getDb() });
  replaceState({
    ...createInitialState(),
    ...domains,
    user: {
      ...domains.user,
      id: user.uid,
      email: user.email || '',
      goal: domains.user.goal || domains.plan.goal || '',
      deadline: domains.user.deadline || domains.plan.deadline || '',
    },
    ui: {
      ...createInitialState().ui,
      loading: false,
      message: '',
      error: '',
      activeRoute: '/',
    },
  });

  await ensureTodayAssignedAndPersist();

  const state = getState();
  const initialRoute = isPlanReady(state.plan) ? normalizeRoute(window.location.pathname) : '/onboarding';
  navigate(initialRoute, handleRouteChange, true);

  startRolloverTimer();
}

function handleRouteChange(route) {
  updateState((draft) => {
    const nextRoute = shouldForceOnboarding(draft) ? '/onboarding' : route;
    draft.ui.activeRoute = nextRoute;
    draft.ui.error = '';
    draft.ui.message = '';
    return draft;
  });
}

async function handleGeneratePlan(payload) {
  const goal = String(payload.goal || '').trim();
  const deadline = String(payload.deadline || '').trim();
  const niche = String(payload.niche || '').trim();                  
  const executionStyle = String(payload.executionStyle || '').trim(); 

  if (!goal || !deadline) {
    updateState((draft) => {
      draft.ui.error = 'Goal and deadline are required.';
      return draft;
    });
    return;
  }

  updateState((draft) => {
    draft.ui.loading = true;
    draft.ui.message = 'Generating plan...';
    draft.ui.error = '';
    return draft;
  });

  // Pass new fields to the AI
  const plan = await generatePlan({ goal, deadline, niche, executionStyle, project: String(payload.project || '').trim() }); 

  updateState((draft) => {
    draft.user.name = String(payload.name || draft.user.name || '').trim();
    draft.user.goal = goal;
    draft.user.deadline = deadline;
    draft.user.niche = niche;                  
    draft.user.executionStyle = executionStyle;
    draft.user.email = draft.user.email || '';
    if (payload.project) draft.user.project = String(payload.project).trim();
    

    draft.plan = normalizePlan(plan, { goal, deadline, niche, executionStyle }); 
    
    draft.history.entries = [];
    draft.history.successStreak = 0;
    draft.history.missStreak = 0;
    draft.ui.loading = false;
    draft.ui.message = '';
    draft.ui.error = '';
    return draft;
  });

  await ensureTodayAssignedAndPersist();
  navigate('/', handleRouteChange);
}

async function handleTodayOutcome(outcome) {
  const state = getState();
  const next = await markOutcome(state, outcome, {
    aiAdjustTodayTask: adjustTodayTask,
    aiRebuildPlanPartially: rebuildPlanPartially,
  });
  replaceState(next);
  await persistCurrentDomains();
}

function handleSkipTodayTask() {
  const next = skipToNextBest(getState());
  replaceState(next);
  persistCurrentDomains().catch(console.error);
}

async function handleSaveSettings(payload) {
  updateState((draft) => {
    draft.user.name = String(payload.name || draft.user.name || '').trim();
    draft.user.goal = String(payload.goal || draft.user.goal || '').trim();
    draft.user.deadline = String(payload.deadline || draft.user.deadline || '').trim();
    draft.user.niche = String(payload.niche || draft.user.niche || '').trim();                   
    draft.user.executionStyle = String(payload.executionStyle || draft.user.executionStyle || '').trim(); 
    draft.plan.goal = draft.user.goal || draft.plan.goal;
    draft.plan.deadline = draft.user.deadline || draft.plan.deadline;
    draft.ui.message = 'Settings saved.';
    draft.ui.error = '';
    draft.plan.niche = draft.user.niche; 
    draft.plan.executionStyle = draft.user.executionStyle;
    return draft;
  });
  await persistCurrentDomains();
  await ensureTodayAssignedAndPersist();
}
async function handleRebuildCurrentStage() {
  const state = getState();
  const active = getActiveStage(state.plan);
  if (!active) {
    updateState((draft) => {
      draft.ui.error = 'No active stage to rebuild.';
      return draft;
    });
    return;
  }
  updateState((draft) => {
    draft.ui.loading = true;
    draft.ui.message = 'Rebuilding current stage...';
    draft.ui.error = '';
    return draft;
  });

  const rebuilt = await rebuildPlanPartially({
    plan: state.plan,
    stageId: active.id,
    reason: 'manual_rebuild',
  });
  updateState((draft) => {
    draft.plan = rebuilt;
    draft.ui.loading = false;
    draft.ui.message = 'Current stage rebuilt.';
    draft.ui.error = '';
    return draft;
  });
  await ensureTodayAssignedAndPersist();
}

async function ensureTodayAssignedAndPersist() {
  const next = await rolloverAndAssign(getState(), {
    aiAdjustTodayTask: adjustTodayTask,
    aiRebuildPlanPartially: rebuildPlanPartially,
  });
  replaceState(next);
  await persistCurrentDomains();
}

async function persistCurrentDomains() {
  const state = getState();
  await saveDomains(
    {
      user: state.user,
      plan: state.plan,
      today: state.today,
      history: state.history,
    },
    { userId: currentUser?.uid || '', db: getDb() }
  );
}

function startRolloverTimer() {
  clearRolloverTimer();
  rolloverTimer = setInterval(() => {
    ensureTodayAssignedAndPersist().catch((error) => console.error('Rollover check failed', error));
  }, 60 * 1000);
}

function clearRolloverTimer() {
  if (rolloverTimer) {
    clearInterval(rolloverTimer);
    rolloverTimer = null;
  }
}

function renderApp(state) {
  const route = shouldForceOnboarding(state) ? '/onboarding' : state.ui.activeRoute || '/';
  const app = document.getElementById('app');
  const topUser = document.getElementById('top-user');
  if (app) app.style.display = currentUser ? 'block' : 'none';
  if (topUser) topUser.textContent = state.user.name || state.user.email || 'User';

  setActiveView(route);
  setActiveNav(route);

  renderOnboarding(state);
  renderToday(state);
  renderRoadmap(state);
  renderSettings(state);
}

function setActiveView(route) {
  const map = {
    '/': 'view-today',
    '/dashboard': 'view-today',
    '/work': 'view-today',     
    '/onboarding': 'view-onboarding',
    '/roadmap': 'view-roadmap',
    '/settings': 'view-settings',
    '/goals': 'view-roadmap',   
  };
  const activeId = map[route] || 'view-today';
  document.querySelectorAll('.view').forEach((view) => {
    view.classList.remove('on');
  });
  const active = document.getElementById(activeId);
  if (active) active.classList.add('on');
}

function setActiveNav(route) {
  const today = document.getElementById('nav-today');
  const roadmap = document.getElementById('nav-roadmap');
  const settings = document.getElementById('nav-settings');
  [today, roadmap, settings].forEach((button) => button?.classList.remove('on'));
  if (route === '/' || route === '/work' || route === '/dashboard') today?.classList.add('on');
  if (route === '/roadmap') roadmap?.classList.add('on');
  if (route === '/settings') settings?.classList.add('on');
}

function shouldForceOnboarding(state) {
  return !isPlanReady(state.plan);
}

async function loadRuntimeConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) throw new Error('Failed to load runtime config');
  return res.json();
}

function showAuth() {
  const authScreen = document.getElementById('auth-screen');
  const app = document.getElementById('app');
  if (authScreen) authScreen.style.display = 'flex';
  if (app) app.style.display = 'none';
}

function hideAuth() {
  const authScreen = document.getElementById('auth-screen');
  if (authScreen) authScreen.style.display = 'none';
}

function showAuthError(message) {
  const el = document.getElementById('auth-error');
  if (el) el.textContent = message || '';
}

function setAuthStatus(message) {
  const el = document.getElementById('auth-status');
  if (el) el.textContent = message || '';
}
async function handleGoalCompletion() {
  if (!confirm('Are you sure you have reached your goal? This will clear your current plan and save it to history.')) {
    return;
  }

  try {
    // FIX: corrected endpoint — was /api/goal/complete, server registers /api/goals/:id/complete
    const userId = currentUser?.uid || 'anonymous';
    const res = await fetch(`/api/goals/${userId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser?.uid }),
    });

    if (res.ok) {
      alert('Congratulations! Goal completed.');
      window.location.reload(); 
    } else {
      const err = await res.json();
      alert('Error: ' + err.error);
    }
  } catch (error) {
    console.error('Failed to complete goal:', error);
  }
}

window.handleGoalCompletion = handleGoalCompletion;
