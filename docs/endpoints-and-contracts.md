# Endpoints and Contracts

## Common Meta Fields

All frontend payloads include:

- `schemaVersion`
- `fetchedAt`
- `stale`
- `degraded`
- `isMock`
- `warnings`

## Aggregate Endpoints

### `GET /api/dashboard`

```json
{
  "meta": {},
  "hero": {},
  "modules": {
    "environment": {},
    "agenda": {},
    "household": {},
    "media": {},
    "photos": {}
  }
}
```

### `GET /api/standby`

```json
{
  "meta": {},
  "ambientState": "day",
  "urgentOverride": false,
  "backgroundPhoto": {},
  "primaryAlert": null,
  "widgets": {
    "agenda": {},
    "household": {},
    "weather": {},
    "media": {}
  }
}
```

## Domain Endpoints

### `GET /api/environment`

```json
{
  "meta": {},
  "summary": {},
  "detail": {
    "current": {},
    "hourly": [],
    "daily": [],
    "radar": {},
    "risk": {},
    "alerts": {
      "active": [],
      "recentlyEnded": []
    }
  }
}
```

### `GET /api/household`

```json
{
  "meta": {},
  "summary": {
    "chores": {},
    "treats": {}
  },
  "detail": {
    "chores": {},
    "treats": {}
  }
}
```

### `POST /api/household`

Supported actions:

- `toggle_chore`
- `create_chore`
- `delete_chore`
- `log_treat`

### `GET /api/media`

```json
{
  "meta": {},
  "summary": {
    "nowPlaying": {}
  },
  "detail": {
    "nowPlaying": {},
    "availableControls": {},
    "radioPresets": [],
    "musicContext": {}
  }
}
```

### `POST /api/media`

Supported actions:

- `play`
- `pause`
- `stop`

### `GET /api/photos`

```json
{
  "meta": {},
  "summary": {},
  "detail": {
    "source": "google_photos",
    "fallbackInUse": false,
    "currentPhoto": {},
    "queue": []
  }
}
```

## System Endpoints

### `GET /api/settings`

Returns:

- `meta`
- `config`
- `integrations`
- `systemHealth`

### `POST /api/settings`

Supported actions:

- `save_config`
- `test_integration`
- `disconnect_provider`

### `GET /api/admin`

Returns:

- `meta`
- `system`
- `recentActions`
- `availableActions`
- `mockSupport`

### `POST /api/admin`

Supported actions:

- `CLEAR_SNAPSHOTS`
