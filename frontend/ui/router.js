const ROUTES = new Set([
  '/', 
  '/dashboard', 
  '/work', 
  '/goals', 
  '/notes', 
  '/roadmap', 
  '/analytics', 
  '/settings', 
  '/billing', 
  '/onboarding'
]);
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
  window.gp = (path) => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    navigate(cleanPath, onRouteChange);
  };
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
  if (pathname === '/' || pathname === '') return '/';
  if (ROUTES.has(pathname)) return pathname;
  const withSlash = `/${pathname}`;
  if (ROUTES.has(withSlash)) return withSlash;
  return '/'; 
}
