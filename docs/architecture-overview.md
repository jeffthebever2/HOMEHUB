# Architecture Overview

HomeHub is organized around grouped domains instead of page-specific routes.

## Domain Boundaries

- `Environment`: forecast, risk summaries, alerts, and alert retention
- `Household`: chores and treat tracking
- `Media`: shared now-playing state, radio presets, and provider bridge
- `Photos`: queue selection, source priority, and fallback handling
- `Settings`: saved config plus integration state
- `Admin`: diagnostics, mocks, and guarded actions
- `Agenda`: internal calendar helper only

## Aggregates

- `Dashboard` composes summary slices for the Home page.
- `Standby` composes a smaller ambient payload from the same shared summaries.

## Why This Shape

- Weather and alerts are one operational system with one risk model.
- Chores and treats are one household-state domain with one timezone.
- Music and radio share now-playing state and transport semantics.
- Photos stays separate because token refresh and queue fallback differ from playback control.
- Agenda stays internal because it supports multiple views without justifying another public route.
