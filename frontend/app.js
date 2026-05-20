// v2 boot — mounts into #app-v2 (not yet in index.html; exits silently until HTML is updated).
// No v1 dependencies: no plan-engine, no ai.js v1 actions, no today-engine.

import { createInitialState, createDefaultTodayV2, isoDateNow } from './core/state-model.js';
import { getState, replaceState, subscribe, updateState } from './core/store.js';
import { initAuth, onAuthChanged, signIn, signUp, signOut, sendPasswordReset, authErrorMessage, getDb } from './services/auth.js';
import { loadPersistedDomains, saveDomains, saveDomain } from './services/persistence.js';
import { generateExecutionTrack, generateAgentSteps, checkProof, generateActionKit } from './services/ai-v2.js';
import { resetProofState } from './ui/pages/proof.js';
import { initRouter, navigate, normalizeRoute } from './ui/router.js';
import { renderRoute } from './ui/pages/index.js';

const ROOT_ID = 'app-v2';

let currentUser = null;

boot().catch((err) => {
  console.error('[striveai v2] boot failed:', err);
  const root = document.getElementById(ROOT_ID);
  if (root) {
    root.innerHTML = '<div style="padding:2rem;font-family:monospace;color:#f87171">Boot failed — please refresh.</div>';
  }
});

async function boot() {
  const root = document.getElementById(ROOT_ID);
  if (!root) {
    // index.html not yet updated for v2; script.js handles the v1 boot. Exit silently.
    return;
  }

  const config = await fetch('/api/config').then((r) => {
    if (!r.ok) throw new Error(`Config fetch ${r.status}`);
    return r.json();
  });

  initAuth(config);
  initRouter(handleRouteChange);
  subscribe(() => renderApp(getState()));

  onAuthChanged(async (user) => {
    if (!user) {
      currentUser = null;
      replaceState(createInitialState());
      navigate('/landing', handleRouteChange, true);
      return;
    }
    await handleSignedIn(user);
  });
}

async function handleSignedIn(user) {
  currentUser = user;
  updateState((s) => { s.ui.loading = true; return s; });

  const domains = await loadPersistedDomains({ userId: user.uid, db: getDb() });
  const initial = createInitialState();
  replaceState({
    ...initial,
    ...domains,
    user: { ...domains.user, id: user.uid, email: user.email || '' },
    ui:   { ...initial.ui, authReady: true },
  });

  navigate(resolveEntryRoute(getState()), handleRouteChange, true);
}

// Determine where to send an authenticated user on load.
function resolveEntryRoute(state) {
  const { track } = state;
  if (track.status === 'complete') return '/recap';
  if (!track.id || !track.days.length) return '/onboarding';
  // Honor the current URL if it is a valid authenticated route.
  const current = normalizeRoute(window.location.pathname);
  const anonOnly = new Set(['/landing', '/auth', '/', '/not-found']);
  return !anonOnly.has(current) ? current : '/today';
}

// Apply auth and track guards before committing a route change.
function guardRoute(route, state) {
  // Root redirect.
  if (route === '/') return currentUser ? resolveEntryRoute(state) : '/landing';

  // Unauthenticated: only landing and auth are accessible.
  if (!currentUser) {
    return new Set(['/landing', '/auth']).has(route) ? route : '/landing';
  }

  const { track } = state;
  const noTrack   = !track.id || !track.days.length;

  // Routes that don't require an active track.
  const freeRoutes = new Set(['/onboarding', '/confirm-track', '/plan-preview', '/settings', '/not-found']);

  if (noTrack && !freeRoutes.has(route)) return '/onboarding';
  if (track.status === 'complete' && route !== '/recap' && !freeRoutes.has(route)) return '/recap';
  return route;
}

// ── Onboarding handlers ────────────────────────────────────────────────────

async function handleGenerate(draft) {
  updateState((s) => { s.ui.trackGenerating = true; s.ui.loading = true; s.ui.error = ''; return s; });

  try {
    const state = getState();
    const aiData = await generateExecutionTrack({
      goal:             draft.goal,
      goalCategory:     draft.goalCategory,
      dailyHours:       draft.dailyHours,
      experienceLevel:  state.user.experienceLevel || 'intermediate',
      blockerHint:      draft.blocker,
    });

    const startDate = isoDateNow();
    const trackId   = `track-${Date.now()}`;
    const track = {
      id:               trackId,
      goal:             draft.goal,
      goalCategory:     draft.goalCategory,
      blockerHint:      draft.blocker,
      generatedAt:      new Date().toISOString(),
      startDate,
      status:           'active',
      currentDayNumber: 1,
      days:             aiData.days.map((d, i) => ({
        ...d,
        dayNumber:  i + 1,
        status:     'pending',
        date:       addDays(startDate, i),
      })),
      continuationOf: null,
    };

    const today   = createDefaultTodayV2(startDate, 1);
    const domains = {
      user:     { ...state.user, goalCategory: draft.goalCategory, dailyHours: draft.dailyHours },
      track,
      today,
      history:  state.history,
      telegram: state.telegram,
    };

    await saveDomains(domains, { userId: currentUser?.uid, db: getDb() });
    replaceState({ ...getState(), ...domains, ui: { ...getState().ui, loading: false, trackGenerating: false, error: '' } });

    if (state.telegram.connected && typeof draft.pingHour === 'number') {
      try {
        const token = await currentUser?.getIdToken();
        await fetch('/api/v2/telegram/schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pingHour: draft.pingHour, timezone: 'UTC', enabled: true }),
        });
      } catch (_e) { /* non-fatal */ }
    }

    navigate('/plan-preview', handleRouteChange, true);
  } catch (err) {
    updateState((s) => { s.ui.loading = false; s.ui.trackGenerating = false; s.ui.error = 'Failed to generate your plan — please try again.'; return s; });
  }
}

async function handleStartDay1() {
  const state = getState();
  if (state.telegram?.connected && typeof state.telegram.pingHour === 'number') {
    try {
      const token = await currentUser?.getIdToken();
      await fetch('/api/v2/telegram/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pingHour: state.telegram.pingHour, timezone: 'UTC', enabled: true }),
      });
    } catch (_e) { /* non-fatal */ }
  }
  navigate('/today', handleRouteChange, true);
}

async function handleTelegramLink() {
  const token = await currentUser?.getIdToken();
  const res = await fetch('/api/v2/telegram/link-token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 503) throw new Error('Telegram is not configured in this environment.');
    throw new Error(data.error || 'Could not get link token.');
  }
  const { connectUrl } = await res.json();
  window.open(connectUrl, '_blank');
}

async function handleTelegramRefresh() {
  try {
    const token = await currentUser?.getIdToken();
    const res = await fetch('/api/v2/telegram/status', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    updateState((s) => {
      s.telegram = { ...s.telegram, connected: Boolean(data.connected), username: data.username || '', chatId: data.chatId || '', connectedAt: data.connectedAt || '' };
      return s;
    });
    await saveDomain('telegram', getState().telegram, { userId: currentUser?.uid, db: getDb() });
  } catch (_e) { /* non-fatal */ }
}

function addDays(isoDate, n) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── Action Kit handler ─────────────────────────────────────────────────────

async function handleKitGenerate() {
  const state   = getState();
  const { track, today } = state;
  const dayNum  = track.currentDayNumber || today.dayNumber || 1;
  const dayPlan = track.days.find((d) => d.dayNumber === dayNum) ?? track.days[0] ?? {};

  updateState((s) => { s.ui.kitLoading = true; return s; });
  try {
    const items = await generateActionKit(dayPlan, track);
    updateState((s) => { s.today.actionKit = items; s.ui.kitLoading = false; return s; });
    await saveDomain('today', getState().today, { userId: currentUser?.uid, db: getDb() });
  } catch (_e) {
    updateState((s) => { s.ui.kitLoading = false; return s; });
  }
}

// ── Agent handlers ─────────────────────────────────────────────────────────

async function handleAgentInit() {
  const state  = getState();
  const { track, today, history } = state;
  const dayNum  = track.currentDayNumber || today.dayNumber || 1;
  const dayPlan = track.days.find((d) => d.dayNumber === dayNum) ?? track.days[0] ?? {};

  updateState((s) => { s.ui.agentLoading = true; return s; });
  try {
    const rawSteps = await generateAgentSteps(dayPlan, track, history.failurePatterns);
    const session  = {
      steps:            rawSteps.map((s, i) => ({ index: i, text: String(s.text || ''), status: 'pending', stuckNote: '', completedAt: '' })),
      currentStepIndex: 0,
      startedAt:        new Date().toISOString(),
      closedAt:         '',
      outcome:          '',
      proofNote:        '',
    };
    updateState((s) => { s.today.agentSession = session; s.ui.agentLoading = false; return s; });
    await saveDomain('today', getState().today, { userId: currentUser?.uid, db: getDb() });
  } catch (_e) {
    updateState((s) => { s.ui.agentLoading = false; return s; });
  }
}

async function handleAgentStepDone({ stepIndex, note }) {
  updateState((s) => {
    if (!s.today.agentSession) return s;
    const step = s.today.agentSession.steps[stepIndex];
    if (step) { step.status = 'done'; step.stuckNote = note || ''; step.completedAt = new Date().toISOString(); }
    s.today.agentSession.currentStepIndex = stepIndex + 1;
    return s;
  });
  await saveDomain('today', getState().today, { userId: currentUser?.uid, db: getDb() });
}

async function handleAgentProofSubmit({ type, value }) {
  const state   = getState();
  const { track, today } = state;
  const dayNum  = track.currentDayNumber || today.dayNumber || 1;
  const dayPlan = track.days.find((d) => d.dayNumber === dayNum) ?? track.days[0] ?? {};

  updateState((s) => { s.ui.agentLoading = true; return s; });
  try {
    const result = await checkProof(dayPlan, { type, value }, track);

    if (result.verdict === 'met') {
      await handleDayDone({ proofType: type, proofValue: value, fromAgent: true });
    } else {
      const outcome = result.verdict === 'not_enough' ? 'blocked' : 'partial';
      updateState((s) => {
        s.ui.agentLoading = false;
        if (s.today.agentSession) { s.today.agentSession.outcome = outcome; s.today.agentSession.proofNote = result.note || ''; }
        return s;
      });
      await saveDomain('today', getState().today, { userId: currentUser?.uid, db: getDb() });
    }
  } catch (_e) {
    updateState((s) => { s.ui.agentLoading = false; return s; });
  }
}

async function handleAgentRetry() {
  updateState((s) => {
    if (s.today.agentSession) { s.today.agentSession.outcome = ''; s.today.agentSession.proofNote = ''; }
    return s;
  });
  await saveDomain('today', getState().today, { userId: currentUser?.uid, db: getDb() });
}

// ── Standalone proof handlers (/proof route) ───────────────────────────────

async function handleProofSubmit({ type, value, isRescue }) {
  const state   = getState();
  const { track, today } = state;
  const dayNum  = track.currentDayNumber || today.dayNumber || 1;
  const dayPlan = track.days.find((d) => d.dayNumber === dayNum) ?? track.days[0] ?? {};

  updateState((s) => { s.ui.proofLoading = true; s.today.proofResult = null; return s; });
  try {
    const result = await checkProof(dayPlan, { type, value }, track);
    if (result.verdict === 'met') {
      resetProofState();
      await handleDayDone({ proofType: type, proofValue: value, fromRescue: Boolean(isRescue) });
    } else {
      updateState((s) => {
        s.ui.proofLoading  = false;
        s.today.proofResult = { verdict: result.verdict, note: result.note || '' };
        return s;
      });
      await saveDomain('today', getState().today, { userId: currentUser?.uid, db: getDb() });
    }
  } catch (_e) {
    updateState((s) => { s.ui.proofLoading = false; return s; });
  }
}

function handleProofReset() {
  updateState((s) => { s.today.proofResult = null; return s; });
}

async function handleDayDone({ proofType, proofValue, fromAgent, fromRescue }) {
  const state   = getState();
  const { track, today, history } = state;
  const dayNum  = track.currentDayNumber || today.dayNumber || 1;
  const dayPlan = track.days.find((d) => d.dayNumber === dayNum) ?? {};
  const now     = new Date().toISOString();
  const outcome = fromRescue ? 'rescued' : 'done';

  const entry = {
    date:            today.date,
    dayNumber:       dayNum,
    trackId:         track.id,
    outcome,
    taskTitle:       dayPlan.title || '',
    proofType:       proofType || 'text',
    agentUsed:       Boolean(fromAgent),
    rescueOffered:   Boolean(fromRescue),
    rescueCompleted: Boolean(fromRescue),
    createdAt:       now,
  };

  updateState((s) => {
    s.today.status    = outcome;
    s.today.outcomeAt = now;
    s.today.proof     = { type: proofType || 'text', value: proofValue || '', submittedAt: now };
    s.today.proofResult = null;
    if (s.today.agentSession) { s.today.agentSession.outcome = 'done'; s.today.agentSession.closedAt = now; }
    const day = s.track.days.find((d) => d.dayNumber === dayNum);
    if (day) day.status = outcome;
    s.history.entries         = [entry, ...(s.history.entries || [])].slice(0, 200);
    s.history.successStreak   = (s.history.successStreak || 0) + 1;
    s.history.currentDayStreak = (s.history.currentDayStreak || 0) + 1;
    s.ui.agentLoading  = false;
    s.ui.proofLoading  = false;
    return s;
  });

  const st = getState();
  await saveDomains({ user: st.user, track: st.track, today: st.today, history: st.history, telegram: st.telegram },
    { userId: currentUser?.uid, db: getDb() });
  navigate('/today', handleRouteChange, true);
}

// ── Route change ───────────────────────────────────────────────────────────

function handleRouteChange(route) {
  updateState((s) => {
    s.ui.activeRoute = guardRoute(route, s);
    return s;
  });
}

function renderApp(state) {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const route = state.ui.activeRoute || (currentUser ? '/today' : '/landing');
  renderRoute(root, route, state, {
    currentUser,
    onSignOut:  () => signOut(),
    onNavigate: (path) => navigate(path, handleRouteChange),
    onSignIn:   async ({ email, password }) => {
      try { await signIn(email, password); }
      catch (err) { throw new Error(authErrorMessage(err)); }
    },
    onSignUp:   async ({ email, password }) => {
      try { await signUp(email, password); }
      catch (err) { throw new Error(authErrorMessage(err)); }
    },
    onPasswordReset: async ({ email }) => {
      try { await sendPasswordReset(email); }
      catch (err) { throw new Error(authErrorMessage(err)); }
    },
    onGenerate:           handleGenerate,
    onStartDay1:          handleStartDay1,
    onTelegramLink:       handleTelegramLink,
    onTelegramRefresh:    handleTelegramRefresh,
    onKitGenerate:        handleKitGenerate,
    onAgentInit:          handleAgentInit,
    onAgentStepDone:      handleAgentStepDone,
    onAgentProofSubmit:   handleAgentProofSubmit,
    onAgentRetry:         handleAgentRetry,
    onProofSubmit:        handleProofSubmit,
    onProofReset:         handleProofReset,
  });
}
