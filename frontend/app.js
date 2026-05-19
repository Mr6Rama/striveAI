// v2 boot — mounts into #app-v2 (not yet in index.html; exits silently until HTML is updated).
// No v1 dependencies: no plan-engine, no ai.js v1 actions, no today-engine.

import { createInitialState } from './core/state-model.js';
import { getState, replaceState, subscribe, updateState } from './core/store.js';
import { initAuth, onAuthChanged, signOut, getDb } from './services/auth.js';
import { loadPersistedDomains } from './services/persistence.js';
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
    onSignOut: () => signOut(),
    onNavigate: (path) => navigate(path, handleRouteChange),
  });
}
