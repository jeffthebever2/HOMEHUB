import { fetchJson } from './fetch.js';

function normalizeEnvValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function createSupabaseConfigError(message, details = {}) {
  const error = new Error(message);
  error.statusCode = 500;
  error.code = 'SUPABASE_CONFIG_ERROR';
  error.details = details;
  return error;
}

function createSupabaseRequestError(message, details = {}) {
  const error = new Error(message);
  error.statusCode = details.statusCode || 502;
  error.code = 'SUPABASE_REQUEST_ERROR';
  error.details = details;
  return error;
}

function getSupabaseEnvSnapshot() {
  return {
    url: normalizeEnvValue(process.env.SUPABASE_URL),
    serviceRoleKey: normalizeEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY),
    anonKey: normalizeEnvValue(process.env.SUPABASE_ANON_KEY),
  };
}

function validateSupabaseConfig({
  requireServiceRole = true,
  requireAnonKey = false,
} = {}) {
  const { url, serviceRoleKey, anonKey } = getSupabaseEnvSnapshot();
  const missing = [];

  if (!url) {
    missing.push('SUPABASE_URL');
  }
  if (requireServiceRole && !serviceRoleKey) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }
  if (requireAnonKey && !anonKey) {
    missing.push('SUPABASE_ANON_KEY');
  }

  if (missing.length) {
    throw createSupabaseConfigError(
      `Server Supabase configuration is incomplete: missing ${missing.join(', ')}.`,
      { missing }
    );
  }

  if (!isHttpUrl(url)) {
    throw createSupabaseConfigError(
      'Server Supabase configuration is invalid: SUPABASE_URL must be a full http(s) URL.',
      { invalid: ['SUPABASE_URL'] }
    );
  }

  return { url, serviceRoleKey, anonKey };
}

function getResponseMessage(data, fallback) {
  if (data && typeof data === 'object') {
    if (typeof data.message === 'string' && data.message) return data.message;
    if (typeof data.error?.message === 'string' && data.error.message) return data.error.message;
    if (typeof data.error_description === 'string' && data.error_description) return data.error_description;
    if (typeof data.hint === 'string' && data.hint) return data.hint;
    if (typeof data.details === 'string' && data.details) return data.details;
  }
  if (typeof data === 'string' && data.trim()) return data.trim();
  return fallback;
}

export function getServerSupabaseDiagnostics() {
  const { url, serviceRoleKey, anonKey } = getSupabaseEnvSnapshot();
  const issues = [];
  const warnings = [];

  if (!url) {
    issues.push('Missing SUPABASE_URL.');
  } else if (!isHttpUrl(url)) {
    issues.push('SUPABASE_URL must be a full http(s) URL.');
  }

  if (!serviceRoleKey) {
    issues.push('Missing SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (!anonKey) {
    warnings.push('SUPABASE_ANON_KEY is not set on the server. Browser auth can still work, but anon-key server fallbacks are unavailable.');
  }

  return {
    configured: issues.length === 0,
    urlConfigured: Boolean(url),
    serviceRoleConfigured: Boolean(serviceRoleKey),
    anonConfigured: Boolean(anonKey),
    issues,
    warnings,
  };
}

export async function getAuthUser(accessToken) {
  if (!accessToken) return null;
  const { url, serviceRoleKey } = validateSupabaseConfig();
  const response = await fetchJson(`${url}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    throw createSupabaseRequestError(
      `Supabase auth lookup failed (${response.status}): ${getResponseMessage(response.data, 'Could not validate the current session.')}`,
      {
        statusCode: response.status === 401 ? 401 : 502,
        operation: 'auth.getUser',
      }
    );
  }
  return response.data || null;
}

export async function restSelect(table, query, { accessToken, useServiceRole = true } = {}) {
  const { url, serviceRoleKey, anonKey } = validateSupabaseConfig({
    requireServiceRole: useServiceRole,
    requireAnonKey: !useServiceRole,
  });
  const key = useServiceRole ? serviceRoleKey : anonKey;
  const bearerToken = useServiceRole ? serviceRoleKey : (accessToken || anonKey);
  const response = await fetchJson(`${url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${bearerToken}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw createSupabaseRequestError(
      `Supabase GET ${table} failed (${response.status}): ${getResponseMessage(response.data, 'The requested data could not be loaded from Supabase.')}`,
      {
        statusCode: response.status,
        table,
        method: 'GET',
      }
    );
  }
  return response.data;
}

export async function restMutate(table, query, method, payload, { prefer = 'return=representation' } = {}) {
  const { url, serviceRoleKey } = validateSupabaseConfig();
  const response = await fetchJson(`${url}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw createSupabaseRequestError(
      `Supabase ${method} ${table} failed (${response.status}): ${getResponseMessage(response.data, 'The write operation could not be completed.')}`,
      {
        statusCode: response.status,
        table,
        method,
      }
    );
  }
  return response.data;
}
