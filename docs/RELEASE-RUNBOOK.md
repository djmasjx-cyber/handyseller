# Release and Incident Runbook

## Standard release flow

1. Feature/hotfix branch from `dev`.
2. PR -> `dev`.
3. Wait for required CI checks:
   - `build-lint-typecheck`
   - `quick-partner-smoke`
4. Merge -> auto `Deploy Staging` to `https://dev.handyseller.ru`.
5. Validate dev/staging before any production promotion:
   - core health endpoints
   - partner smoke flow
   - registry list/detail smoke
   - demo checkout smoke without real booking
   - carrier document smoke with original `LABEL` download
   - manual UI check for the changed scenario
6. PR `dev -> main`.
7. Wait for `Release Gate (PR -> main)`: build/lint and carrier e2e with original document downloads.
8. Merge -> `Deploy Production`.
9. Verify post-deploy smoke and SLO gate.

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
5. If the release touches carriers, run or wait for carrier e2e with `DOWNLOAD_DOC=true`.
6. If any dev check fails, fix in `dev`; do not promote to `main`.

## Environment contract

- `staging` GitHub environment must use `API_BASE_URL=https://dev.handyseller.ru/api`.
- `production` GitHub environment must use `API_BASE_URL=https://api.handyseller.ru/api`.
- `Deploy Staging` uses `/opt/handyseller/.env.staging`.
- `Deploy Production` uses `/opt/handyseller/.env.production`.
- `docker-compose.ci.yml` reads the active env file from `APP_ENV_FILE`; never rely on staging containers reading production env by accident.

## Required gates before production

- PR to `dev`: fast CI and quick partner smoke.
- Push to `dev`: staging deploy plus registry, demo checkout, and carrier document smoke.
- PR `dev -> main`: release gate with all critical carriers and `DOWNLOAD_DOC=true`.
- Push to `main`: production deploy, post-deploy partner smoke with document download, SLO check, and rollback guard.

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

4. Re-run smoke checks.

## Dellin-specific operational loop

1. Nightly job monitors Dellin scenario on staging.
2. If failed:
   - download workflow artifact `dellin-nightly-<run_id>`
   - inspect request/response diagnostics
3. Implement targeted fix in `dev`.
4. Verify in staging before promoting to prod.
