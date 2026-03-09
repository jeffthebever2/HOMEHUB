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
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtYWVmd2hxb3lraXR0cndpb2J3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDU2MzU4NCwiZXhwIjoyMDg2MTM5NTg0fQ.2c8VbnmTpZwoBY0hfqJOFkUhxgq3ji0MIl4yk2UtTCM',
    apiBase: '',

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
