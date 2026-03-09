import { fetchJson } from './fetch.js';

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_ANON_KEY || '';
  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return { url, serviceRoleKey, anonKey };
}

export async function getAuthUser(accessToken) {
  if (!accessToken) return null;
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetchJson(`${url}/auth/v1/user`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return response.ok ? response.data : null;
}

export async function restSelect(table, query, { accessToken, useServiceRole = true } = {}) {
  const { url, serviceRoleKey, anonKey } = getSupabaseConfig();
  const key = useServiceRole ? serviceRoleKey : anonKey;
  const response = await fetchJson(`${url}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase GET ${table} failed (${response.status})`);
  }
  return response.data;
}

export async function restMutate(table, query, method, payload, { prefer = 'return=representation' } = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
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
    const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    throw new Error(`Supabase ${method} ${table} failed (${response.status}): ${detail}`);
  }
  return response.data;
}
