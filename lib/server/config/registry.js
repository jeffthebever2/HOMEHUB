export function buildIntegrationRegistry(config) {
  return [
    {
      providerId: 'google_calendar',
      category: 'agenda',
      displayName: 'Google Calendar',
      enabled: true,
      selectedCalendars: config.agenda.selectedCalendars,
    },
    {
      providerId: 'google_photos',
      category: 'photos',
      displayName: 'Google Photos',
      enabled: true,
    },
    {
      providerId: 'immich',
      category: 'photos',
      displayName: 'Immich',
      enabled: Boolean(config.photos.immichBaseUrl),
    },
    {
      providerId: 'imgur',
      category: 'photos',
      displayName: 'Imgur',
      enabled: Boolean(config.photos.imgurAlbumId),
    },
    {
      providerId: 'firebase_treats',
      category: 'household',
      displayName: 'Treat Tracker',
      enabled: Boolean(process.env.FIREBASE_DATABASE_URL || 'https://dog-calorie-counter-default-rtdb.firebaseio.com'),
    },
  ];
}
