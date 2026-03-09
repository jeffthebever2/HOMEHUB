# Admin and Operations

## Separation Rules

- Admin actions live only under `/api/admin`.
- Mock scenarios are injected only when admin auth is valid.
- Mock responses must surface `meta.isMock = true`.
- Family pages must never expose hidden test controls.

## Auth Model

Admin requires:

- household role `admin`
- and, if `ADMIN_TOKEN` is configured, a matching `X-HomeHub-Admin-Token`

The browser stores the admin token only in `sessionStorage`.

## Current Admin Actions

- `CLEAR_SNAPSHOTS`

## Current Mock Scenarios

- `TORNADO_5`
- `PHOTOS_AUTH_EXPIRED`
