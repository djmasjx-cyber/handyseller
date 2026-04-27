# Release and Incident Runbook

## Standard release flow

1. Feature/hotfix branch from `dev`.
2. PR -> `dev`.
3. Wait for required CI checks:
   - `build-lint-typecheck`
4. Merge -> auto `Deploy Staging` to `https://dev.handyseller.ru` (VM health; no automated TMS/carrier test orders in CI).
5. Validate dev/staging before any production promotion:
   - core health endpoints (and manual UI check for the changed scenario)
   - for carrier-related releases: spot-check waybills/labels in UI and, if needed, a real client or internal path to the carrier (CI no longer runs carrier E2E)
6. PR `dev -> main`.
7. Wait for `Release Gate (PR -> main)`: `verify-build-and-lint` (build + lint on full tree).
8. Merge -> `Deploy Production`.
9. Verify post-deploy health and SLO gate; optional manual checks on app endpoints.

## Production release checklist

- Required checks are green in `dev`.
- Dev/staging deploy is green on `https://dev.handyseller.ru`.
- The changed UI flow has been checked on dev before merging to `main`.
- TMS carrier documents open from both shipment pages and registry cards as original carrier files, not generated placeholders.
- Environment secrets are актуальны.
- Rollback target (previous image tags) available in `.env.production`.
- Known incidents reviewed.

## Dev/staging validation checklist

Use this checklist after every `dev` deploy and before opening/merging `dev -> main`:

1. Open `https://dev.handyseller.ru/dashboard/tms/requests`.
2. Verify the page loads without 500/502 and the relevant filters work.
3. Open `https://dev.handyseller.ru/dashboard/tms/registry`.
4. Open a real order card and check:
   - history is visible and sorted newest first when required by product behavior
   - shipments and documents are present
   - waybill opens from the backend document endpoint
   - label opens as the original carrier label from the carrier document endpoint
5. If the release touches carriers, do extra manual or production validation of booking and documents; GitHub no longer runs automated carrier E2E.
6. If any dev check fails, fix in `dev`; do not promote to `main`.

## Environment contract

- `staging` GitHub environment must use `API_BASE_URL=https://dev.handyseller.ru/api`.
- `production` GitHub environment must use `API_BASE_URL=https://api.handyseller.ru/api`.
- `Deploy Staging` uses `/opt/handyseller/.env.staging`.
- `Deploy Production` uses `/opt/handyseller/.env.production`.
- Production: `docker-compose.ci.yml` + `.env.production`. Staging: `docker-compose.staging.yml` + проект `handyseller-staging` + `.env.staging` — отдельные контейнеры и порты; prod-стек при деплое в `dev` не перезаписывается.

## Required gates before production

- PR to `dev`: `CI Checks` (lint/build per scope).
- Push to `dev`: `Deploy Staging` (health on VM; no automated TMS/ТК smokes).
- PR `dev -> main`: `Release Gate (PR -> main)` — `verify-build-and-lint` only.
- Push to `main`: `Deploy Production` — health checks, SLO read-only check, and rollback guard.

## Incident triage

When smoke fails:

1. Capture:
   - workflow URL
   - `x-request-id` from logs
   - Dellin `code` and `fields`
2. Classify:
   - validation (`4xx`)
   - auth/credentials
   - transport timeout/network
   - carrier-side failure
3. Decide:
   - quick fix on `dev` + redeploy staging
   - rollback if production degradation exists

## CI stability note (2026-04-24)

`CI Checks` on `dev` must evaluate only the current push delta, not full `main...dev` drift.

- In `.github/workflows/ci.yml` (`detect-context`), `dorny/paths-filter` uses:
  - PRs: `base = github.base_ref`
  - Pushes: `base = github.event.before`
- This prevents false-red runs from legacy lint debt in unrelated domains.
- If CI starts failing unexpectedly across unrelated scopes, first verify the `detect-context` diff base in workflow logs.

## Rollback procedure

`Deploy Production` already has auto rollback.
If manual rollback is needed:

1. SSH to prod VM.
2. Restore previous `IMAGE_API`, `IMAGE_WEB`, `IMAGE_TMS_API` in `/opt/handyseller/.env.production`.
3. Run:

```bash
cd /opt/handyseller
docker compose -f docker-compose.ci.yml --env-file .env.production pull api web tms-api
docker compose -f docker-compose.ci.yml --env-file .env.production up -d --no-deps api tms-api web
```

4. Re-run health and product checks on prod as needed.

## Carrier / TMS debugging

There is no automated external-carrier E2E in GitHub anymore. For incidents, use service logs, `x-request-id`, and reproduction through the product or manual local scripts (see `docs/TMS-PARTNER-API-QUICKSTART.md`).
