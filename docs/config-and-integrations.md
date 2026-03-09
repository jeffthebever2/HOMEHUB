# Config and Integrations

## Source of Truth

Settings is the authoritative config source for the app.

- Server defaults come from environment variables.
- User overrides come from Supabase `user_settings`.
- Runtime config is `defaults + persisted overrides`.
- Browser storage is only for session-scoped UI behavior like admin token or active tabs.

## Saved User Settings Today

Persisted today:

- location name / coordinates
- standby timeout
- quiet hours
- photo provider priority head
- Google Photos album id
- Imgur album id
- Immich base URL and album id
- selected calendars

## Integration Registry

The settings page reports:

- Google Calendar
- Google Photos
- Immich
- Imgur
- Treat Tracker bridge

## Provider Notes

- Google Calendar is internal-only and powers agenda summaries.
- Google Photos is the default primary slideshow source.
- Media is currently client-bridged while the browser-owned playback model remains in place.
