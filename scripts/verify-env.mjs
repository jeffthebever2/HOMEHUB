import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function readPublicConfigStatus() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const configPath = path.resolve(currentDir, '../public/config.js');
  const source = fs.readFileSync(configPath, 'utf8');
  const urlMatch = source.match(/supabaseUrl:\s*'([^']*)'/);
  const anonMatch = source.match(/supabaseAnonKey:\s*'([^']*)'/);
  const hasServiceRoleLeak = /(SUPABASE_SERVICE_ROLE_KEY|supabaseServiceRoleKey|serviceRoleKey)\s*:/.test(source);

  return {
    supabaseUrl: urlMatch?.[1] || '',
    supabaseAnonKey: anonMatch?.[1] || '',
    hasServiceRoleLeak,
  };
}

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

const publicConfig = readPublicConfigStatus();
console.log('\nBrowser-safe public/config.js values:');
console.log(`- ${publicConfig.supabaseUrl ? 'ok' : 'warn'} supabaseUrl`);
console.log(`- ${publicConfig.supabaseAnonKey ? 'ok' : 'warn'} supabaseAnonKey`);
console.log(`- ${publicConfig.hasServiceRoleLeak ? 'warn' : 'ok'} no service-role key in public/config.js`);

if (publicConfig.hasServiceRoleLeak) {
  console.warn('\npublic/config.js appears to reference a service-role key name. Remove it before deploying.');
}

if (failed) {
  process.exit(1);
}
