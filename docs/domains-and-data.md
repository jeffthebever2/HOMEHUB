# Domains and Data

## Environment

- External inputs: Open-Meteo forecast, NWS alerts
- Shared logic: severity mapping, dedupe, hazard-family suppression, recent-expired retention
- Outputs: summary risk state, current conditions, hourly/daily forecast, active and recently ended alerts

## Household

### Chores

- Source: Supabase `chores`
- Core rule: daily state is derived from `last_completed_at` and local timezone
- No scheduled reset route exists in the core model

### Treat Tracker

- Source: Firebase RTDB `dogs` and `treats/{dogId}`
- Core rule: treat day state is derived from event timestamps between local midnight and now
- Writes append a single event by id; they do not rewrite the entire day payload

## Media

- Source of truth today: browser-owned state bridged through request headers
- Music: embedded Spotify session
- Radio: browser audio element + configured presets
- Shared output: one now-playing summary used by Media, Dashboard, and Standby

## Photos

- Default source priority: `google_photos -> immich -> imgur -> local_fallback`
- Queue and current image are chosen server-side
- Last-known-good snapshots protect the slideshow from provider outages

## Settings

- Saved source: Supabase `user_settings`
- Runtime merge: defaults + persisted user settings
- Browser storage is not authoritative

## Agenda

- Input: Google Calendar provider token from the signed-in Supabase session
- Output: next-up schedule summary for Dashboard and Standby
- It is an internal integration, not a public route
