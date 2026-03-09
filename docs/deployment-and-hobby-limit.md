# Deployment and Hobby Limit

## Function Limit

This project targets Vercel Hobby and must stay under `12` serverless functions.

Current intended count: `8`.

## Guardrails

- one grouped route per domain
- no route-per-widget
- no provider-specific public routes
- no mock-only routes
- no compatibility routes that keep the project above the limit

## Cache Profiles

- `dashboard`: private, no-store because the payload is auth-scoped
- `environment`: CDN-friendly only for anonymous/default-config requests; private, no-store when auth or mock headers personalize the payload
- `household`: no-store
- `media`: no-store
- `photos`: CDN-friendly only for anonymous/default-config requests; private, no-store when auth or mock headers personalize the payload
- `settings`: no-store
- `standby`: private, no-store because the payload is auth-scoped
- `admin`: no-store

## Verification

Run:

```bash
node scripts/check-function-count.mjs
node scripts/verify-env.mjs
```
