const DEFAULT_CLIENT_CONFIG = {
  householdDisplayName: 'HomeHub',
  supabaseUrl: '',
  supabaseAnonKey: '',
  apiBase: '',
  defaultLocation: {
    name: 'Configured location',
    lat: 40.029059,
    lon: -82.863462,
  },
};

const PUBLIC_CONFIG_PREFIX = '[HomeHub config]';
const warnedMessages = new Set();

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function warnOnce(key, message) {
  const warningKey = `${key}:${message}`;
  if (warnedMessages.has(warningKey)) return;
  warnedMessages.add(warningKey);
  console.warn(`${PUBLIC_CONFIG_PREFIX} ${message}`);
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

function looksLikeJwt(value) {
  return typeof value === 'string' && value.split('.').length === 3;
}

function getUnexpectedSecretKeys(rawConfig) {
  return [
    'supabaseServiceRoleKey',
    'serviceRoleKey',
    'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((key) => typeof rawConfig[key] === 'string' && rawConfig[key].trim());
}

export function getClientConfig() {
  const rawConfig = asRecord(window.HOME_HUB_CONFIG);
  const rawLocation = asRecord(rawConfig.defaultLocation);
  const unexpectedSecretKeys = getUnexpectedSecretKeys(rawConfig);
  if (unexpectedSecretKeys.length) {
    warnOnce(
      'unexpected-secret-key',
      `Do not place ${unexpectedSecretKeys.join(', ')} in public/config.js. Browser config must only contain supabaseUrl and supabaseAnonKey.`
    );
  }

  return {
    householdDisplayName: asString(rawConfig.householdDisplayName, DEFAULT_CLIENT_CONFIG.householdDisplayName),
    supabaseUrl: asString(rawConfig.supabaseUrl, DEFAULT_CLIENT_CONFIG.supabaseUrl),
    supabaseAnonKey: asString(rawConfig.supabaseAnonKey, DEFAULT_CLIENT_CONFIG.supabaseAnonKey),
    apiBase: asString(rawConfig.apiBase, DEFAULT_CLIENT_CONFIG.apiBase),
    defaultLocation: {
      ...DEFAULT_CLIENT_CONFIG.defaultLocation,
      ...rawLocation,
      name: asString(rawLocation.name, DEFAULT_CLIENT_CONFIG.defaultLocation.name),
      lat: asNumber(rawLocation.lat, DEFAULT_CLIENT_CONFIG.defaultLocation.lat),
      lon: asNumber(rawLocation.lon, DEFAULT_CLIENT_CONFIG.defaultLocation.lon),
    },
  };
}

export function getSupabaseClientConfig() {
  const config = getClientConfig();
  return {
    supabaseUrl: config.supabaseUrl,
    supabaseAnonKey: config.supabaseAnonKey,
  };
}

export function getSupabaseClientDiagnostics() {
  const { supabaseUrl, supabaseAnonKey } = getSupabaseClientConfig();
  const errors = [];
  const warnings = [];

  if (!supabaseUrl) {
    errors.push('Missing supabaseUrl in public/config.js.');
  } else if (!isHttpUrl(supabaseUrl)) {
    errors.push('Invalid supabaseUrl in public/config.js. Expected a full https:// project URL.');
  }

  if (!supabaseAnonKey) {
    errors.push('Missing supabaseAnonKey in public/config.js.');
  } else if (!looksLikeJwt(supabaseAnonKey)) {
    warnings.push('supabaseAnonKey does not look like a Supabase anon JWT.');
  }

  if (!window.supabase?.createClient) {
    errors.push('The Supabase client library did not load.');
  }

  [...errors, ...warnings].forEach((message, index) => {
    warnOnce(`client-diagnostic-${index}`, message);
  });

  return {
    available: errors.length === 0,
    status: errors.length ? 'unavailable' : warnings.length ? 'degraded' : 'ready',
    reason: errors[0] || warnings[0] || '',
    errors,
    warnings,
  };
}

export function getAuthSupportState() {
  const diagnostics = getSupabaseClientDiagnostics();
  return {
    available: diagnostics.available,
    status: diagnostics.status,
    reason: diagnostics.reason,
    warnings: diagnostics.warnings,
    errors: diagnostics.errors,
  };
}
