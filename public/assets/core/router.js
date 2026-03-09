import { setRoute, store } from './store.js';

export const DEFAULT_ROUTE = 'home';

const VALID_ROUTES = ['home', 'weather', 'alerts', 'household', 'media', 'photos', 'settings', 'admin', 'standby'];
const validRoutes = new Set(VALID_ROUTES);

function normalizeRoute(route) {
  const raw = String(route || '')
    .replace(/^#\/?/, '')
    .trim()
    .toLowerCase();
  return validRoutes.has(raw) ? raw : DEFAULT_ROUTE;
}

function routeHash(route) {
  return `#/${normalizeRoute(route)}`;
}

export function getRoute() {
  return normalizeRoute(window.location.hash);
}

export function go(route) {
  const nextHash = routeHash(route);
  if (window.location.hash === nextHash) {
    setRoute(normalizeRoute(route));
    return store.route;
  }
  window.location.hash = nextHash;
  return normalizeRoute(route);
}

export function initRouter(onRouteChange) {
  const update = () => {
    setRoute(getRoute());
    const nextHash = routeHash(store.route);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
    onRouteChange(store.route);
  };
  window.addEventListener('hashchange', update);
  update();
}
