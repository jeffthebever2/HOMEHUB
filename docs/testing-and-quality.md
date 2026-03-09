# Testing and Quality

## Smoke Matrix

Verify these paths after major changes:

- Home dashboard
- Weather
- Alerts
- Household / chores
- Household / treats
- Media / music
- Media / radio
- Photos
- Settings
- Admin
- Standby

## Important Regression Checks

- settings saves do not duplicate rows
- mocks never appear in live mode without admin auth
- standby exits cleanly and survives long sessions
- photo fallbacks work when providers fail
- environment still shows degraded/stale state instead of blanking
- treat logging remains safe under repeated taps

## Helpful Scripts

- `node scripts/check-function-count.mjs`
- `node scripts/verify-env.mjs`
- `HOMEHUB_BASE_URL=http://localhost:3000 node scripts/smoke-contracts.mjs`
