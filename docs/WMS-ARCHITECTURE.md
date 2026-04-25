# WMS Architecture

WMS is a detachable bounded context for warehouse execution. Core owns users, tenants, base product catalog and commercial orders. WMS stores operational warehouse truth: topology, item projections, unique unit barcodes, LPN containers, tasks, movement events, receiving, putaway, picking, packing, inventory and shipping.

## Service Boundaries

- `apps/wms-api` owns WMS execution APIs and WMS persistence.
- `packages/wms-sdk` owns public DTOs and shared WMS types.
- `packages/wms-domain` owns pure domain rules: barcode generation, topology path logic, cycle checks and future allocation/routing functions.
- `apps/web/app/api/wms/*` is the Next.js BFF proxy for dashboard calls.
- `apps/web/app/dashboard/wms/*` is the WMS UI surface.
- WMS may read Core/TMS snapshots, but Core/TMS must not mutate WMS inventory state directly.

## Source Of Truth

Do not build stock as a mutable "SKU quantity" table first. WMS stock is derived from:

- `wms_inventory_unit`: one physical unit with one unique internal barcode.
- `wms_container_lpn`: one container, tote, box or pallet with one unique LPN barcode.
- `wms_inventory_event`: immutable movement and scan history.

Aggregates by SKU, location, warehouse, order or LPN are projections. If a projection becomes inconsistent, rebuild it from units and events.

## Domain Model

- Warehouse: physical or virtual storage boundary.
- Location: versioned topology node. Levels are data, not hard-coded UI logic.
- Item projection: WMS copy of product attributes needed for warehouse operations.
- Barcode alias: GTIN, Data Matrix, marketplace barcodes and internal mappings.
- Receipt: inbound document with status and lines.
- Inventory unit: concrete sellable physical unit.
- Container LPN: receiving tote, operational tote, box, pallet or shipping batch.
- Task: receive, putaway, move, pick, pack, count, ship.
- Inventory event: append-only operational ledger.

## MVP Scope

The first implementation deliberately starts with a strong execution skeleton:

- WMS service, contracts and domain package.
- Warehouses and location topology.
- Item projections.
- Receipt creation.
- Internal unit barcode reservation.
- LPN creation for temporary receiving tare.
- Movement of unit barcodes or LPNs into addressed locations.
- Barcode lookup and recent movement history.

Picking, packing, auto-printing, cycle counts and shipping batches are built on top of this model, not as separate custom flows.

## Invariants

- Never delete units, LPNs, locations or documents that participated in events. Use status/archive/block.
- Any physical movement must create an event.
- Unit barcode and LPN barcode are globally unique per tenant.
- A unit is in one place at a time: location, container, order work or shipped state.
- Containers can contain units and nested containers, but cycles are forbidden.
- Manual adjustments require role, reason and an immutable event.

## Quality Gate

WMS has its own CI scope:

- `npm run quality:wms`
- `apps/wms-api/**`
- `packages/wms-sdk/**`
- `packages/wms-domain/**`

The deploy compose contains `wms-api` behind a `wms` profile until we explicitly enable runtime deployment. This keeps production stable while WMS evolves as a separate module.
