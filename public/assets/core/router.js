import { setRoute, store } from './store.js';

const validRoutes = new Set(['home', 'weather', 'alerts', 'household', 'media', 'photos', 'settings', 'admin', 'standby']);

export function getRoute() {
  const raw = window.location.hash.replace(/^#\/?/, '') || 'home';
  return validRoutes.has(raw) ? raw : 'home';
}

export function go(route) {
  window.location.hash = `#/${route}`;
}

export function initRouter(onRouteChange) {
  const update = () => {
    setRoute(getRoute());
    onRouteChange(store.route);
  };
  window.addEventListener('hashchange', update);
  update();
}
