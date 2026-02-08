// HOME HUB CONFIGURATION
// Edit these values with your actual credentials before deploying.
// Weather API keys and AI keys are NOT stored here — they go in Cloudflare env vars.

window.HOME_HUB_CONFIG = {
  // === SUPABASE (Required) ===
  supabaseUrl: 'PASTE_YOUR_SUPABASE_URL_HERE',        // e.g. https://xxxxx.supabase.co
  supabaseAnonKey: 'PASTE_YOUR_SUPABASE_ANON_KEY_HERE',

  // === FIREBASE (Do not change — existing dog treat tracker) ===
  firebase: {
    apiKey: "AIzaSyBISAQF9xw2ifb9HllNj4LniyMLD6OhclU",
    authDomain: "dog-calorie-counter.firebaseapp.com",
    databaseURL: "https://dog-calorie-counter-default-rtdb.firebaseio.com",
    projectId: "dog-calorie-counter",
    storageBucket: "dog-calorie-counter.firebasestorage.app",
    messagingSenderId: "835874316228",
    appId: "1:835874316228:web:cbebd7e0ad3b071352ce91"
  },

  // === DEFAULT LOCATION ===
  defaultLocation: {
    name: 'Gahanna, Ohio',
    lat: 40.029059,
    lon: -82.863462
  },

  // === IMMICH (Optional — for standby photo collage) ===
  immichBaseUrl: '',                    // e.g. http://192.168.1.100:2283
  immichSharedAlbumKeyOrToken: '',      // shared link key or API token

  // === API BASE (leave empty for same-origin Cloudflare Pages Functions) ===
  apiBase: ''
};
