# HandySeller Development Standards (Core/TMS/WMS)

## Why this document exists

As HandySeller scales across multiple domains, we need enforceable standards that keep production stable while preserving fast iteration on `dev`.

## Domain ownership model

- `apps/api` - Core Commerce domain.
- `apps/tms-api` + `packages/tms-*` - Transportation domain.
- `apps/wms` + `packages/wms-*` - Warehouse domain (reserved and enforced before rollout).
- `apps/web` - user-facing web and BFF layer.

Path ownership is enforced via `.github/CODEOWNERS`.

## Mandatory scripts per workspace

Every app/domain workspace must expose:

- `build`
- `lint` (or explicit documented exception)
- `test:unit` (for service and domain packages)

Optional by context:

- `test:integration`
- `test:e2e`

## CI gating model

- `dev` path:
  - context-aware quality jobs
  - deterministic smoke
  - fast staging deployment
- `main` path:
  - full release gates
  - external integration checks where applicable
  - production deployment with rollback

## WMS readiness rules

Before first WMS feature release, `apps/wms` and `packages/wms-*` must provide:

1. unit tests for domain invariants (`reserve/release`, idempotency),
2. integration tests for inventory state transitions,
3. contract tests for event/API compatibility,
4. migration safety checks for schema changes.

## Change safety rules

- Any schema-impacting release must include risk notes and rollback strategy.
- Cross-domain changes must include evidence in release artifacts.
- Breaking API changes require versioning and compatibility notes.
