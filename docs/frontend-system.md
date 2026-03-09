# Frontend System

## Shell

- one persistent topbar
- one persistent primary nav
- one page mount
- one toast layer

Primary nav:

- Home
- Weather
- Household
- Media
- Photos
- Alerts
- Settings

Admin is entered from Settings. Standby is entered by timeout or explicit action.

## Shared UI Families

- page header
- summary card
- hero card
- badge
- banner
- state block
- form field
- list row
- table
- standby HUD

## Templates

- Dashboard: hero + summary grid
- Weather: hero + metrics + hourly/daily outlook
- Alerts: hero + active list + recent ended
- Household: tabbed chores/treats workspace
- Media: shared hero + music/radio tabs
- Photos: hero image + queue grid
- Settings: config form + integration health
- Admin: diagnostics + mocks + actions
- Standby: full-screen background + clock + summary widgets

## Tokens

Tokens live in:

- `public/assets/ui/tokens.css`
- `public/assets/ui/base.css`
- `public/assets/ui/components.css`

The token system is semantic, not utility-by-utility. State colors mean something and are not decorative.

## Accessibility

- minimum 44x44 interactive targets
- visible focus states must be preserved
- reduced motion should be respected by future animations
- standby overlays must keep text readable over imagery
