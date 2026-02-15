// HOME HUB CONFIGURATION
// Edit these values with your actual credentials before deploying.
// Weather API keys and AI keys are NOT stored here — they go in Cloudflare env vars.

window.HOME_HUB_CONFIG = {
  // === SUPABASE (Required) ===
  supabaseUrl: 'https://cmaefwhqoykittrwiobw.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtYWVmd2hxb3lraXR0cndpb2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjM1ODQsImV4cCI6MjA4NjEzOTU4NH0.rUub2PIr60w9InuA1zygE7l0OK6li_Un8WjpdcVg3ko',

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


  // === MEDIA (Music + Radio) ===
  // YouTube Music embedding can be restricted; we default to YouTube playlist/video embed (reliable),
  // and provide an optional YouTube Music iframe fallback.
  youtubeMusic: {
    mode: 'playlist',           // 'playlist' | 'video'
    playlistId: '',             // e.g. 'PLxxxxxxxxxxxx'
    videoId: '',                // e.g. 'dQw4w9WgXcQ' (only used if mode='video')
    musicIframeUrl: 'https://music.youtube.com/' // optional fallback
  },

  // Preferred: use real audio stream URLs for best performance + best Bluetooth support.
  // Example stream URLs are not included here—add your own stations.
  radioStations: [
    // { id: 'station1', name: 'Example FM', url: 'https://example.com/stream.mp3', tagline: 'Pop / Hits' }
  ],

  // Optional iframe-based live radio page (only used if you set a URL)
  radioIframeUrl: '',

  // === API BASE (leave empty for same-origin Cloudflare Pages Functions) ===
  apiBase: ''
};
