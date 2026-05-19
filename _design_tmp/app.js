const navItems = [...document.querySelectorAll('[data-view-target]')];
const views = [...document.querySelectorAll('.view')];
const titleEl = document.getElementById('topbar-title');
const eyebrowEl = document.getElementById('topbar-eyebrow');

function activateView(viewName) {
  views.forEach((view) => {
    view.classList.toggle('is-active', view.dataset.view === viewName);
  });

  navItems.forEach((item) => {
    const isActive = item.dataset.viewTarget === viewName && item.classList.contains('nav-item');
    item.classList.toggle('is-active', isActive);
  });

  document.body.dataset.activeView = viewName;

  const activeView = views.find((view) => view.dataset.view === viewName);
  if (activeView) {
    titleEl.textContent = activeView.dataset.title || 'StriveAI';
    eyebrowEl.textContent = activeView.dataset.eyebrow || 'Workspace';
    window.location.hash = viewName;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }
}

navItems.forEach((item) => {
  item.addEventListener('click', () => activateView(item.dataset.viewTarget));
});

const initial = window.location.hash.replace('#', '') || 'roadmap';
activateView(initial);
