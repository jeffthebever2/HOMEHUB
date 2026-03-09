import { getAccessToken, getGoogleProviderToken } from './session.js';
import { store } from './store.js';

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const apiBase = window.HOME_HUB_CONFIG?.apiBase || '';
  const accessToken = getAccessToken();
  const googleProviderToken = getGoogleProviderToken();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (googleProviderToken) headers.set('X-HomeHub-Google-Token', googleProviderToken);
  if (store.mediaState) headers.set('X-HomeHub-Media-State', JSON.stringify(store.mediaState));
  const adminToken = sessionStorage.getItem('hh_admin_token');
  if (adminToken) headers.set('X-HomeHub-Admin-Token', adminToken);
  const mock = sessionStorage.getItem('hh_mock');
  const hasAdminSession = store.membership?.role === 'admin' || Boolean(adminToken);
  if (mock && hasAdminSession) headers.set('X-HomeHub-Mock', mock);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
