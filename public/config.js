(function initHomeHubConfig(globalObject) {
  const current = globalObject.HOME_HUB_CONFIG && typeof globalObject.HOME_HUB_CONFIG === 'object'
    ? globalObject.HOME_HUB_CONFIG
    : {};
  const currentLocation = current.defaultLocation && typeof current.defaultLocation === 'object'
    ? current.defaultLocation
    : {};

  globalObject.HOME_HUB_CONFIG = {
    householdDisplayName: 'Scott family',

    // Browser-safe Supabase values only.
    // Hard-coded browser config for this deployment.
    // Never place SUPABASE_SERVICE_ROLE_KEY in this file.
    supabaseUrl: 'https://cmaefwhqoykittrwiobw.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtYWVmd2hxb3lraXR0cndpb2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjM1ODQsImV4cCI6MjA4NjEzOTU4NH0.rUub2PIr60w9InuA1zygE7l0OK6li_Un8WjpdcVg3ko',
    apiBase: 'sb_publishable_XpO2k1opVlUS3BiqO7jM9g_Bpjfvu_Y',

    defaultLocation: {
      name: 'Gahanna, Ohio',
      lat: 40.029059,
      lon: -82.863462,
    },
    ...current,
    defaultLocation: {
      name: 'Gahanna, Ohio',
      lat: 40.029059,
      lon: -82.863462,
      ...currentLocation,
    },
  };
}(window));
