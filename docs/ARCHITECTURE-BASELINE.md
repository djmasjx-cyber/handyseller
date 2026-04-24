# HandySeller Architecture Baseline (v1)

## Purpose

This document fixes the current architecture baseline and the target service-first direction for scalable growth of HandySeller (`core`, `tms`, upcoming `wms`) with production stability as a non-negotiable priority.

## Current Baseline

### Runtime Topology

- `apps/web` - Next.js web + BFF routes.
- `apps/api` - core commerce API (orders, catalog, finance, marketplace sync, auth).
- `apps/tms-api` - shipment lifecycle + carrier adapters.
- `packages/tms-sdk` and `packages/tms-domain` - shared transport contracts and domain helpers.

### Delivery Topology

- Fast lane: `dev` checks and staging deploy with deterministic smoke.
- Release lane: `main` with external-carrier gate and production deploy/rollback.

## Known Architectural Risks

1. Domain leakage between Core and TMS (`order` includes TMS-specific overrides).
2. Mixed ownership of TMS API surface between `apps/api` and `apps/tms-api`.
3. Governance and quality controls are only partially enforceable.
4. Limited automated test depth outside API happy-path checks.
5. TMS persistence fallback to in-memory mode is acceptable for local dev only.

## Target Architecture (Service-First, Phased)

### Bounded Contexts

- **Core Commerce Service**: orders, catalog, pricing, marketplace orchestration.
- **TMS Service**: shipment requests, quote selection, booking, tracking, carrier adapters.
- **WMS Service (next)**: inventory, reservation, warehouse operations, fulfillment execution.
- **Identity/Partner Access**: OAuth client-credentials and machine integrations.

### Integration Rules

1. Cross-context communication goes through explicit contracts (`packages/*-sdk`) and API ports.
2. External providers are isolated behind adapters + anti-corruption mapping.
3. No direct domain model sharing between Core/TMS/WMS persistence layers.
4. Production deploy path is always gated by deterministic checks + context-appropriate external checks.

## Migration Principles

1. **Strangler-first**: migrate ownership gradually without big-bang rewrites.
2. **Build once, promote safely**: same image lineage through environments.
3. **Backward compatibility first**: schema and API changes must be release-safe.
4. **Fast feedback for dev**: heavy external checks never block daily development.
5. **Policy as code**: every critical engineering rule should be enforced in CI/CD.

## 3-Phase Program

### Phase 1 - Stability Foundation

- Governance v1 (required checks, release evidence, change classes).
- Context-aware quality gates in CI.
- Documented and enforceable release rules.

### Phase 2 - Core/TMS Boundary Hardening

- Introduce explicit ACL for Core -> TMS snapshot mapping.
- Normalize BFF ownership: `/tms/v1/*` belongs to TMS service.
- Reduce Core domain leakage from transport-specific fields.

### Phase 3 - WMS Readiness

- Define WMS contracts and quality gates before heavy feature rollout.
- Path-based ownership and CODEOWNERS coverage for domain scaling.
- Compatibility rules for migrations/events in multi-domain releases.

## Acceptance Criteria

- `dev` lead time remains fast and deterministic.
- `main` requires measurable quality/release gates.
- Production rollback is tested and reproducible.
- New domains (WMS and beyond) can be added without coupling spikes.
