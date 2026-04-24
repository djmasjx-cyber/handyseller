# Release and Incident Runbook

## Standard release flow

1. Feature/hotfix branch from `dev`.
2. PR -> `dev`.
3. Wait for required CI checks:
   - `build-lint-typecheck`
   - `quick-partner-smoke`
4. Merge -> auto `Deploy Staging`.
5. Validate staging:
   - core health endpoints
   - partner smoke flow
   - Dellin critical path (estimate/select/confirm/doc)
6. PR `dev -> main`.
7. Merge -> `Deploy Production`.
8. Verify post-deploy smoke and SLO gate.

## Production release checklist

- Required checks are green in `dev`.
- Staging deploy is green.
- Environment secrets are актуальны.
- Rollback target (previous image tags) available in `.env.production`.
- Known incidents reviewed.

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
