(function initHomeHubConfig(globalObject) {
  const current = globalObject.HOME_HUB_CONFIG && typeof globalObject.HOME_HUB_CONFIG === 'object'
    ? globalObject.HOME_HUB_CONFIG
    : {};
  const currentLocation = current.defaultLocation && typeof current.defaultLocation === 'object'
    ? current.defaultLocation
    : {};

  globalObject.HOME_HUB_CONFIG = {
    householdDisplayName: typeof current.householdDisplayName === 'string' ? current.householdDisplayName : 'HomeHub',

    // Browser-safe Supabase values only.
    // Paste your project URL and anon/public key here for local dev and Vercel deploys.
    // Never place SUPABASE_SERVICE_ROLE_KEY in this file.
    supabaseUrl: typeof current.supabaseUrl === 'string' ? current.supabaseUrl : '',
    supabaseAnonKey: typeof current.supabaseAnonKey === 'string' ? current.supabaseAnonKey : '',
    apiBase: typeof current.apiBase === 'string' ? current.apiBase : '',

    defaultLocation: {
      name: typeof currentLocation.name === 'string' ? currentLocation.name : 'Configured location',
      lat: 40.029059,
      lon: -82.863462,
      ...(currentLocation || {}),
    },
  };
}(window));
