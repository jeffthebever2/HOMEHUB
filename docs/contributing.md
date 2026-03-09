# Contributing

## Hard Rules

- Do not add new public API routes unless one is being replaced.
- Do not fetch providers directly from browser page modules.
- Do not duplicate business logic across Dashboard, Domain pages, and Standby.
- Do not add permanent `legacy`, `temp`, or `misc` directories.
- Do not let browser storage override server config.
- Do not expose admin tools in family-facing UI.

## PR Checklist

- function count still valid
- docs updated if contracts or env expectations changed
- no new page-local design-system fork
- no provider-specific route sprawl
- stale/degraded behavior still explicit
