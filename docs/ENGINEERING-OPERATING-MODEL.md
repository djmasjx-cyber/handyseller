# Engineering Operating Model

Simple, reliable, modern development flow for HandySeller.

## Branch model

- `dev` — integration branch for all fixes and features.
- `main` — production branch only.
- `feature/*` and `hotfix/*` are always created from `dev`.

## Delivery lanes

- **Rapid lane (`dev`)**
  - Goal: validate fixes quickly.
  - Trigger: push/PR to `dev`.
  - Checks: lint, build (context-aware quality matrix; no automated TMS/carrier test orders in CI).
  - Result: auto deploy to `staging` (VM health only).
  - Rule: carrier integration is validated via real product usage and production traffic, not GitHub E2E.

- **Release lane (`main`)**
  - Goal: safe production rollout.
  - Trigger: merge `dev -> main`.
  - Checks: `Release Gate (PR -> main)`: build/lint; `Deploy Production`: health, SLO read-only gate, automatic rollback.
  - Safety: automatic rollback on failed gates.

## Non-negotiable rules

1. No direct push to `main`.
2. Every change goes through `dev` first.
3. Every release uses immutable image tags by git SHA.
4. Production deployment must pass health checks and the SLO gate.
5. Automated external-carrier E2E in GitHub is retired; do not reintroduce CI jobs that call carriers or create test bookings.

## Governance v1

- `change_class` is mandatory for manual production releases:
  - `standard`
  - `high-risk`
  - `schema-impact`
- `high-risk` and `schema-impact` require explicit `risk_notes`.
- Every production run generates a release evidence artifact:
  - release metadata (owner, class, actor, commit)
  - gate outcomes
  - rollback strategy reference

## Fast fix loop

1. Implement fix in `feature/*`.
2. PR to `dev`.
3. Wait for checks and staging deploy.
4. Validate scenario in staging.
5. Merge `dev -> main` only after green verification.

## When fast lane is allowed

Use `dev` fast lane for:
- UI/API/business-logic changes and rapid iteration.
- Bugfix iterations that require high speed and frequent redeploys.
- Scenarios you can verify on `dev` plus manual or production-adjacent checks as needed.

Promote to `main` (release lane) for:
- Any change you are ready to run in production, including booking/confirm with real carriers, adapter/contract work, and customer-facing releases.
- Migrations and high-risk changes per governance.

## Core/TMS boundary rules (v1)

- Core -> TMS order snapshot transformation must live in a dedicated ACL layer.
- `/tms/v1/*` endpoints are owned by `tms-api`.
- Core ownership for `/tms/*` is limited to OAuth/integration-client management and docs endpoints.

## Incident response

1. Capture workflow URL, request id, carrier code/fields.
2. Reproduce on `dev/staging`.
3. Ship fix through rapid lane.
4. Promote to `main` after staging green.
