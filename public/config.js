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

  // === API BASE (leave empty for same-origin Cloudflare Pages Functions) ===
  apiBase: '',

  // === MUSIC (YouTube Music / YouTube Playlists) ===
  music: {
    // Primary: YouTube Music (may be blocked in iframe)
    youtubeMusic: 'https://music.youtube.com',
    // Fallback: YouTube playlist embed
    youtubePlaylistId: 'PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf', // Example: Top Hits
    // Set to true to use playlist fallback instead of YouTube Music
    usePlaylistFallback: false
  },

  // === RADIO STATIONS ===
  radio: {
    stations: [
      {
        name: 'NPR News',
        streamUrl: 'https://npr-ice.streamguys1.com/live.mp3',
        websiteUrl: 'https://www.npr.org',
        logo: '📻'
      },
      {
        name: 'Classical Music',
        streamUrl: 'https://stream.wfmt.com/wfmt-hi',
        websiteUrl: 'https://www.wfmt.com',
        logo: '🎻'
      },
      {
        name: 'Jazz 24',
        streamUrl: 'https://live.wostreaming.net/direct/ppm-jazz24mp3-ibc1',
        websiteUrl: 'https://jazz24.org',
        logo: '🎷'
      },
      {
        name: 'BBC World Service',
        streamUrl: 'http://stream.live.vc.bbcmedia.co.uk/bbc_world_service',
        websiteUrl: 'https://www.bbc.co.uk/sounds/play/live:bbc_world_service',
        logo: '🌍'
      }
    ]
  }
};
