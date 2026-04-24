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
  - Checks: lint, build, quick partner smoke.
  - Result: auto deploy to `staging`.

- **Release lane (`main`)**
  - Goal: safe production rollout.
  - Trigger: merge `dev -> main`.
  - Checks: build/lint, deploy, post-deploy smoke, SLO gate.
  - Safety: automatic rollback on failed gates.

## Non-negotiable rules

1. No direct push to `main`.
2. Every change goes through `dev` first.
3. Every release uses immutable image tags by git SHA.
4. Production deployment must pass smoke and SLO checks.

## Fast fix loop

1. Implement fix in `feature/*`.
2. PR to `dev`.
3. Wait for checks and staging deploy.
4. Validate scenario in staging.
5. Merge `dev -> main` only after green verification.

## Incident response

1. Capture workflow URL, request id, carrier code/fields.
2. Reproduce on `dev/staging`.
3. Ship fix through rapid lane.
4. Promote to `main` after staging green.
