const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
];

const recommended = [
  'SUPABASE_ANON_KEY',
  'ADMIN_TOKEN',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'FIREBASE_DATABASE_URL',
];

const optional = [
  'GOOGLE_PHOTOS_ALBUM_ID',
  'IMGUR_ALBUM_ID',
  'IMGUR_CLIENT_ID',
  'IMMICH_BASE_URL',
  'IMMICH_ALBUM_ID',
  'IMMICH_SHARED_ALBUM_TOKEN',
  'SPOTIFY_EMBED_URL',
  'HOMEHUB_HOUSEHOLD_NAME',
  'HOMEHUB_LOCATION_NAME',
  'HOMEHUB_LAT',
  'HOMEHUB_LON',
  'HOMEHUB_TZ',
  'HOMEHUB_STANDBY_TIMEOUT_MIN',
  'HOMEHUB_QUIET_HOURS_START',
  'HOMEHUB_QUIET_HOURS_END',
  'HOMEHUB_MINIMAL_NIGHT_MODE',
  'HOMEHUB_FAMILY_MEMBERS',
  'HOMEHUB_TREAT_PET_NAME',
  'HOMEHUB_TREAT_PET_EMOJI',
  'HOMEHUB_TREAT_DAILY_LIMIT',
];

const localOnly = [
  'HOMEHUB_BASE_URL',
  'HOMEHUB_BEARER_TOKEN',
  'HOMEHUB_ADMIN_TOKEN',
];

let failed = false;

console.log('Required environment variables:');
for (const key of required) {
  if (!process.env[key]) {
    console.error(`- missing ${key}`);
    failed = true;
  } else {
    console.log(`- ok ${key}`);
  }
}

console.log('\nRecommended environment variables:');
for (const key of recommended) {
  console.log(`- ${process.env[key] ? 'ok' : 'warn'} ${key}`);
}

console.log('\nOptional environment variables:');
for (const key of optional) {
  console.log(`- ${process.env[key] ? 'ok' : 'info'} ${key}`);
}

console.log('\nLocal smoke-test variables:');
for (const key of localOnly) {
  console.log(`- ${process.env[key] ? 'ok' : 'info'} ${key}`);
}

if (failed) {
  process.exit(1);
}
