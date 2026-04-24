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
  - Checks: lint, build, fast deterministic smoke (`tms-fast-smoke`, no carrier calls).
  - Result: auto deploy to `staging`.
  - Rule: this lane must stay independent from external carrier instability.

- **Release lane (`main`)**
  - Goal: safe production rollout.
  - Trigger: merge `dev -> main`.
  - Checks: build/lint, blocking `external-carrier-gate` on staging, deploy, post-deploy smoke, SLO gate.
  - Safety: automatic rollback on failed gates.

## Non-negotiable rules

1. No direct push to `main`.
2. Every change goes through `dev` first.
3. Every release uses immutable image tags by git SHA.
4. Production deployment must pass smoke and SLO checks.
5. Real carrier E2E is never a blocker for `dev`, but always a blocker for `main`.

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
- UI/API/business-logic changes that can be validated without real carrier booking.
- Bugfix iterations that require high speed and frequent redeploys.
- Any integration task where carrier behavior is not the acceptance criterion.

Use only release lane (`main` + external gate) for:
- Changes affecting booking/confirm flow with real carriers.
- Changes in carrier adapters/mappings/contracts.
- Production releases of any customer-facing functionality.

## Core/TMS boundary rules (v1)

- Core -> TMS order snapshot transformation must live in a dedicated ACL layer.
- `/tms/v1/*` endpoints are owned by `tms-api`.
- Core ownership for `/tms/*` is limited to OAuth/integration-client management and docs endpoints.

## Incident response

1. Capture workflow URL, request id, carrier code/fields.
2. Reproduce on `dev/staging`.
3. Ship fix through rapid lane.
4. Promote to `main` after staging green.
