import { getClientConfig } from './config.js';
import { getAccessToken, getGoogleProviderToken } from './session.js';
import { store } from './store.js';

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getSessionValue(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function buildRequestBody(body, headers) {
  if (body == null) return undefined;
  if (typeof body === 'string'
    || body instanceof FormData
    || body instanceof URLSearchParams
    || body instanceof Blob
    || body instanceof ArrayBuffer
    || ArrayBuffer.isView(body)) {
    return body;
  }
  if (Array.isArray(body) || isPlainObject(body)) {
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return JSON.stringify(body);
  }
  return body;
}

async function parseResponseBody(response) {
  const text = await response.text();
  if (!text) {
    return {
      data: null,
      text: '',
    };
  }

  const contentType = String(response.headers.get('content-type') || '');
  const looksJson = contentType.includes('application/json')
    || contentType.includes('+json')
    || /^[\s\n\r]*[{[]/.test(text);

  if (looksJson) {
    try {
      return {
        data: JSON.parse(text),
        text,
      };
    } catch {
      return {
        data: null,
        text,
      };
    }
  }

  return {
    data: text,
    text,
  };
}

function getErrorMessage(data, text, status) {
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  const normalizedStringData = typeof data === 'string' ? data.trim() : '';
  const notFoundBody = normalizedStringData || normalizedText;

  if (status === 404 && /The page could not be found/i.test(notFoundBody) && /NOT_FOUND/i.test(notFoundBody)) {
    return 'HomeHub API route was not found on this deployment. Check that Vercel is deploying the repo root with both public/ and api/.';
  }
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string' && data.error) return data.error;
    if (typeof data.error?.message === 'string' && data.error.message) return data.error.message;
    if (typeof data.message === 'string' && data.message) return data.message;
  }
  if (typeof data === 'string' && data.trim()) return data.trim();
  if (text && text.trim()) return text.trim();
  return `Request failed with status ${status}`;
}

export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const apiBase = getClientConfig().apiBase || '';
  const accessToken = getAccessToken();
  const googleProviderToken = getGoogleProviderToken();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  if (googleProviderToken) headers.set('X-HomeHub-Google-Token', googleProviderToken);
  if (store.mediaState) headers.set('X-HomeHub-Media-State', JSON.stringify(store.mediaState));
  const adminToken = getSessionValue('hh_admin_token');
  if (adminToken) headers.set('X-HomeHub-Admin-Token', adminToken);
  const mock = getSessionValue('hh_mock');
  const hasAdminSession = store.membership?.role === 'admin' || Boolean(adminToken);
  if (mock && hasAdminSession) headers.set('X-HomeHub-Mock', mock);

  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      ...options,
      headers,
      body: buildRequestBody(options.body, headers),
    });
  } catch (error) {
    const networkError = new Error(`Network request failed for ${path}`);
    networkError.status = 0;
    networkError.cause = error;
    throw networkError;
  }

  const { data, text } = await parseResponseBody(response);

  if (!response.ok) {
    const error = new Error(getErrorMessage(data, text, response.status));
    error.status = response.status;
    error.data = data;
    error.bodyText = text;
    throw error;
  }
  return data;
}
