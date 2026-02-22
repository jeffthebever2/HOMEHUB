// HOME HUB CONFIGURATION
// Edit these values with your actual credentials before deploying.
// Weather API keys and AI keys are NOT stored here — they go in Vercel env vars.
window.HOME_HUB_CONFIG = {
  // === SUPABASE (Required) ===
  supabaseUrl: 'https://cmaefwhqoykittrwiobw.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNtYWVmd2hxb3lraXR0cndpb2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjM1ODQsImV4cCI6MjA4NjEzOTU4NH0.rUub2PIr60w9InuA1zygE7l0OK6li_Un8WjpdcVg3ko',

  // === HOUSEHOLD BRANDING ===
  householdDisplayName: 'Scott family',
  // Names shown in grocery "Requested by" dropdown — edit to match your household
  householdMembers: ['Will', 'Lauren', 'Mom', 'Dad'],

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

  // === API BASE (leave empty for same-origin) ===
  apiBase: '',

  // === MUSIC (Spotify) ===
  music: {
    // Spotify embed URL (you manage playlists in Spotify app)
    spotifyUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M'
  },

  // === RADIO STATIONS (23 stations: Lima, St. Marys, Columbus + National) ===
  radio: {
    stations: [
      // ===== LIMA / ST. MARYS AREA =====
      {
        name: '93.9 KISS FM Lima',
        streamUrl: 'https://stream.revma.ihrhls.com/zc5089',
        websiteUrl: 'https://kissfmlima.iheart.com',
        logo: '🎵'
      },
      {
        name: 'T102 Lima Country',
        streamUrl: 'https://stream.revma.ihrhls.com/zc5093',
        websiteUrl: 'https://t102.iheart.com',
        logo: '🤠'
      },
      {
        name: '104.9 The Eagle Lima',
        streamUrl: 'https://stream.revma.ihrhls.com/zc5091',
        websiteUrl: 'https://1049theeagle.com',
        logo: '🎸'
      },
      {
        name: '93.1 The Fan Lima Sports',
        streamUrl: 'https://stream.revma.ihrhls.com/zc5087',
        websiteUrl: 'https://931thefan.com',
        logo: '🏈'
      },
      {
        name: 'News Radio 1150 WIMA',
        streamUrl: 'https://stream.revma.ihrhls.com/zc5095',
        websiteUrl: 'https://wimalima.iheart.com',
        logo: '📰'
      },

      // ===== COLUMBUS AREA =====
      {
        name: '97.9 WNCI Columbus Hit Music',
        streamUrl: 'https://stream.revma.ihrhls.com/zc189',
        websiteUrl: 'https://wnci.iheart.com',
        logo: '🎶'
      },
      {
        name: 'CD 92.9 Alternative Columbus',
        streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/WWCDFM.mp3',
        websiteUrl: 'https://cd929.com',
        logo: '🎧'
      },
      {
        name: '99.7 The Blitz Columbus',
        streamUrl: 'https://stream.revma.ihrhls.com/zc177',
        websiteUrl: 'https://theblitz.com',
        logo: '⚡'
      },
      {
        name: 'QFM96 Columbus',
        streamUrl: 'https://stream.revma.ihrhls.com/zc181',
        websiteUrl: 'https://qfm96.iheart.com',
        logo: '🎸'
      },
      {
        name: 'Country 92.3 WCOL Columbus',
        streamUrl: 'https://stream.revma.ihrhls.com/zc173',
        websiteUrl: 'https://country923.iheart.com',
        logo: '🤠'
      },
      {
        name: 'Sunny 95 Columbus',
        streamUrl: 'https://stream.revma.ihrhls.com/zc185',
        websiteUrl: 'https://sunny95.iheart.com',
        logo: '☀️'
      },
      {
        name: 'Classical 101 WOSU',
        streamUrl: 'https://wosu-classical.streamguys1.com/classical-tunein',
        websiteUrl: 'https://classical101.com',
        logo: '🎻'
      },
      {
        name: '106.7 The Fan Columbus Sports',
        streamUrl: 'https://stream.revma.ihrhls.com/zc179',
        websiteUrl: 'https://1067thefan.iheart.com',
        logo: '🏈'
      },

      // ===== NATIONAL / BIG STATIONS =====
      {
        name: 'NPR News',
        streamUrl: 'https://npr-ice.streamguys1.com/live.mp3',
        websiteUrl: 'https://www.npr.org',
        logo: '📻'
      },
      {
        name: 'ESPN Radio',
        streamUrl: 'https://stream.revma.ihrhls.com/zc5345',
        websiteUrl: 'https://www.espn.com/radio',
        logo: '🏆'
      },
      {
        name: 'iHeartRadio Top 40',
        streamUrl: 'https://stream.revma.ihrhls.com/zc6972',
        websiteUrl: 'https://www.iheart.com',
        logo: '🎵'
      },
      {
        name: 'Classic Rock 24/7',
        streamUrl: 'https://stream.0nlineradio.com/classic-rock',
        websiteUrl: 'https://www.0nlineradio.com',
        logo: '🎸'
      },
      {
        name: 'Smooth Jazz 24.7',
        streamUrl: 'https://stream.srg-ssr.ch/m/rsj/mp3_128',
        websiteUrl: 'https://www.rts.ch/play/radio/topic/musique',
        logo: '🎷'
      },
      {
        name: 'Chill Lofi Radio',
        streamUrl: 'https://stream.zeno.fm/f3wvbbqmdg8uv',
        websiteUrl: 'https://zeno.fm',
        logo: '🎧'
      },
      {
        name: 'Electronic Dance Music',
        streamUrl: 'https://stream.0nlineradio.com/dance',
        websiteUrl: 'https://www.0nlineradio.com',
        logo: '💃'
      },
      {
        name: 'Classic Country Legends',
        streamUrl: 'https://stream.0nlineradio.com/classic-country',
        websiteUrl: 'https://www.0nlineradio.com',
        logo: '🤠'
      },
      {
        name: 'Hip-Hop 24/7',
        streamUrl: 'https://stream.0nlineradio.com/hiphop',
        websiteUrl: 'https://www.0nlineradio.com',
        logo: '🎤'
      },
      {
        name: 'Christmas Music 24/7',
        streamUrl: 'https://stream.0nlineradio.com/christmas',
        websiteUrl: 'https://www.0nlineradio.com',
        logo: '🎄'
      }
    ]
  }
};
