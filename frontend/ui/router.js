// v2 router — clean route list, no STEM/billing/notes/analytics routes.
// Unknown paths → /not-found (never silently show Today for dead routes).

export const V2_ROUTES = new Set([
  '/landing',
  '/auth',
  '/onboarding',
  '/confirm-track',
  '/plan-preview',
  '/today',
  '/agent',
  '/action-kit',
  '/proof',
  '/blocked',
  '/progress',
  '/recap',
  '/settings',
  '/not-found',
]);

export function initRouter(onRouteChange) {
  document.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => {
      navigate(el.getAttribute('data-route') || '/', onRouteChange);
    });
  });
  window.addEventListener('popstate', () => {
    onRouteChange(normalizeRoute(window.location.pathname));
  });
  // Global helper for inline onclick attributes in the legacy HTML shell.
  window.gp = (path) => navigate(path.startsWith('/') ? path : `/${path}`, onRouteChange);
}

export function navigate(path, onRouteChange, replace = false) {
  const route = normalizeRoute(path);
  // Preserve query string when the base path is a valid route.
  const hasQuery    = String(path).includes('?');
  const historyPath = (hasQuery && route !== '/not-found') ? path : route;
  if (replace) {
    window.history.replaceState({}, '', historyPath);
  } else if (window.location.pathname !== route) {
    window.history.pushState({}, '', historyPath);
  }
  onRouteChange(route);
}

// Strip query string before matching; '/' is a redirect sentinel, not a view.
// Anything not in V2_ROUTES → '/not-found'.
export function normalizeRoute(pathname) {
  const base = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (base === '/') return '/';
  if (V2_ROUTES.has(base)) return base;
  return '/not-found';
}
