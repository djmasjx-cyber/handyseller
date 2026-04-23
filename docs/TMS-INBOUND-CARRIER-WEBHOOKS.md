# TMS Inbound Carrier Webhooks

## Purpose
Unified ingestion endpoint for carrier push-events (`carrier -> TMS`) with signature verification, idempotent queueing, and async processing.

## Endpoint
- `POST /api/tms/carrier-webhooks?carrier=<carrier>&eventType=<eventType>&eventId=<eventId>`

Query params:
- `carrier` (required): lowercase carrier code (example: `dellin`, `major-express`, `cdek`)
- `eventType` (optional): defaults to `carrier.updated`
- `eventId` (optional): if omitted, server generates one

Headers:
- `x-handyseller-carrier-signature` (required): `sha256=<hex>`

Body:
- arbitrary JSON payload from carrier

## Signature model
HMAC-SHA256 over raw JSON string with secret:
1. `TMS_CARRIER_WEBHOOK_SECRET_<CARRIER>` (carrier-specific)
2. fallback `TMS_CARRIER_WEBHOOK_SHARED_SECRET`

If neither secret is configured, endpoint rejects requests (`401`).

## Example
```bash
BODY='{"userId":"u_123","shipmentId":"shp_123","status":"IN_TRANSIT"}'
SECRET='replace-me'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')

curl -X POST "https://app.handyseller.ru/api/tms/carrier-webhooks?carrier=dellin&eventType=status.updated&eventId=evt-123" \
  -H "Content-Type: application/json" \
  -H "x-handyseller-carrier-signature: sha256=$SIG" \
  -d "$BODY"
```

## Processing lifecycle
1. Verify signature
2. Dedup by scope key `carrier-webhook:<carrier>:<eventId>`
3. Enqueue job `ingest_carrier_webhook`
4. Worker processes payload asynchronously
5. If payload contains `userId + shipmentId`, worker schedules `refresh_shipment`

## Notes
- This is a payload-agnostic scaffold: per-carrier mapping can be added incrementally.
- For monitoring, use:
  - `GET /api/tms/slo/metrics`
  - failed jobs list/replay endpoints in TMS sync API.
