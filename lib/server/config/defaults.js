const defaultRadioPresets = [
  { id: 't102_lima', name: 'T102 Lima Country', emoji: '🤠', streamUrl: 'https://stream.revma.ihrhls.com/zc5093' },
  { id: 'wnci_979', name: '97.9 WNCI Columbus', emoji: '🎶', streamUrl: 'https://stream.revma.ihrhls.com/zc189' },
  { id: 'wosu_101', name: 'Classical 101 WOSU', emoji: '🎻', streamUrl: 'https://wosu-classical.streamguys1.com/classical-tunein' },
  { id: 'npr_news', name: 'NPR News', emoji: '📰', streamUrl: 'https://npr-ice.streamguys1.com/live.mp3' },
];

export function getDefaultConfig() {
  return {
    system: {
      householdName: process.env.HOMEHUB_HOUSEHOLD_NAME || 'Scott family',
      timezone: process.env.HOMEHUB_TZ || 'America/New_York',
      standbyTimeoutMin: Number(process.env.HOMEHUB_STANDBY_TIMEOUT_MIN || 5),
      quietHoursStart: process.env.HOMEHUB_QUIET_HOURS_START || '22:00',
      quietHoursEnd: process.env.HOMEHUB_QUIET_HOURS_END || '06:00',
      minimalNightMode: process.env.HOMEHUB_MINIMAL_NIGHT_MODE === 'true',
    },
    environment: {
      locationName: process.env.HOMEHUB_LOCATION_NAME || 'Gahanna, Ohio',
      lat: Number(process.env.HOMEHUB_LAT || 40.029059),
      lon: Number(process.env.HOMEHUB_LON || -82.863462),
      forecastProvider: 'open_meteo',
      alertsProvider: 'nws',
    },
    display: {
      fullscreen: false,
      touchscreenMode: false,
      reducedMotion: false,
    },
    photos: {
      sourcePriority: ['google_photos', 'immich', 'imgur', 'local_fallback'],
      googleAlbumId: process.env.GOOGLE_PHOTOS_ALBUM_ID || '',
      imgurAlbumId: process.env.IMGUR_ALBUM_ID || 'kAG2MS3',
      immichBaseUrl: process.env.IMMICH_BASE_URL || '',
      immichAlbumId: process.env.IMMICH_ALBUM_ID || '',
    },
    media: {
      spotifyEmbedUrl: process.env.SPOTIFY_EMBED_URL || 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M',
      radioPresets: defaultRadioPresets,
    },
    household: {
      familyMembers: (process.env.HOMEHUB_FAMILY_MEMBERS || 'Will,Lyla,Mom,Dad,Scott')
        .split(',')
        .map((member) => member.trim())
        .filter(Boolean),
      treats: {
        petName: process.env.HOMEHUB_TREAT_PET_NAME || 'Barker',
        avatarEmoji: process.env.HOMEHUB_TREAT_PET_EMOJI || '🐕',
        dailyLimitTreats: Number(process.env.HOMEHUB_TREAT_DAILY_LIMIT || 6),
      },
    },
    agenda: {
      selectedCalendars: ['primary'],
      maxItems: 6,
    },
  };
}
