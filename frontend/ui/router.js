const ROUTES = new Set(['/', '/roadmap', '/settings', '/onboarding']);

export function initRouter(onRouteChange) {
  document.querySelectorAll('[data-route]').forEach((button) => {
    button.addEventListener('click', () => {
      const route = button.getAttribute('data-route') || '/';
      navigate(route, onRouteChange);
    });
  });

  window.addEventListener('popstate', () => {
    const route = normalizeRoute(window.location.pathname);
    onRouteChange(route);
  });
}

export function navigate(path, onRouteChange, replace = false) {
  const route = normalizeRoute(path);
  if (replace) {
    window.history.replaceState({}, '', route);
  } else if (window.location.pathname !== route) {
    window.history.pushState({}, '', route);
  }
  onRouteChange(route);
}

export function normalizeRoute(pathname) {
  if (ROUTES.has(pathname)) return pathname;
  if (pathname === '/today') return '/';
  return '/';
}

