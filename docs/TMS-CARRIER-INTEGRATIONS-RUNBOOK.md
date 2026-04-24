# TMS Carrier Integrations Runbook

## Purpose
Operational playbook for diagnosing and resolving carrier integration issues (CDEK, Major, Dellin) in production.

## Scope
- Quote flow (`refresh quotes`)
- Booking flow (`confirm shipment`)
- Documents flow (`waybill/label download`)
- Tracking refresh flow
- Carrier inbound webhooks (`carrier -> TMS`)

## Fast triage (5 minutes)
1. Confirm API entrypoint currently used by partner/client:
   - canonical: `https://api.handyseller.ru/api`
2. Reproduce once with the same request and capture:
   - carrier
   - requestId / shipmentId
   - exact error text
3. Classify by error family:
   - `400` validation/schema (payload mismatch)
   - `401/403` auth/credentials
   - `404` resource timing or wrong identifiers
   - `5xx` carrier outage / transport failure
   - timeout/network

## Standard checks by layer

### 1) Credentials and connectivity
- In TMS settings, run "check connection" for the carrier.
- Verify carrier-specific credentials:
  - CDEK: `client_id/client_secret`
  - Major: login/password and service type routing (EXPRESS/LTL)
  - Dellin: appKey + login/password session auth

### 2) Request payload validity
- For `HTTP 400`, inspect parsed carrier errors with `code/detail/fields`.
- Patch payload by required fields instead of guessing.
- Re-run single request and verify next blocking field.

### 3) Booking status and idempotency
- Ensure write requests include `Idempotency-Key`.
- On repeated confirms, verify no duplicate shipment side effects.

### 4) Documents
- Confirm booking produced carrier order reference.
- Verify document marker exists and resolves to PDF on download.
- If PDF is delayed, retry according to carrier-specific readiness windows.

### 5) Inbound carrier webhooks
- Endpoint: `POST /api/tms/carrier-webhooks?carrier=<code>&eventType=<type>&eventId=<id>`
- Signature header: `x-handyseller-carrier-signature: sha256=<hex>`
- Secret source (priority):
  - `TMS_CARRIER_WEBHOOK_SECRET_<CARRIER>`
  - `TMS_CARRIER_WEBHOOK_SHARED_SECRET`
- If no secret is configured, endpoint denies requests by design.
- Incoming events are queued via `ingest_carrier_webhook` and processed asynchronously.
- Worker resolves shipment by:
  - explicit `shipmentId + userId`,
  - or by `trackingNumber` / `carrierOrderReference` fallback.

## Carrier-specific notes

### Dellin
- `v2/request` is strict on payload typing and required nested fields.
- Proven booking path as of 2026-04-24:
  - Auth is `POST /v3/auth/login` with `appkey`, `login`, `password`; a valid account returns `sessionID`.
  - Sender profile is resolved from `POST /v2/counteragents` with `fullInfo=true`.
  - `members.sender.counteragent` must include `uid`, `name`, `inn`, and a valid `customForm`.
  - `members.receiver.counteragent` must not reuse sender UID for a physical recipient; use recipient name, `customForm`, and `document`.
  - `customForm` shape accepted by Dellin: `{ formName, countryUID, juridical }`.
  - Russia `countryUID`: `0x8f51001438c4d49511dbd774581edb7a` (from `/v1/references/countries`).
  - Dellin can return successful `requestID` as a number; convert it to string before storing/returning tracking data.
- Current defaults and overrides:
  - Sender form defaults from counteragent name prefix (`АО`, `ООО`, etc.) or `DELLIN_SENDER_CUSTOM_FORM_NAME`.
  - Receiver form defaults to `Физическое лицо` or `DELLIN_RECEIVER_CUSTOM_FORM_NAME`.
  - Receiver document defaults are test-safe placeholders and can be overridden with `DELLIN_RECEIVER_DOCUMENT_TYPE`, `DELLIN_RECEIVER_DOCUMENT_SERIAL`, `DELLIN_RECEIVER_DOCUMENT_NUMBER`.
  - Do not treat receiver document placeholders as the final production data policy. For real B2C Dellin bookings, agree whether partner checkout must collect recipient document data, whether orders are B2B-only, or whether a business-approved carrier policy allows a shared/default document value.
- Typical blockers:
  - `members.*` structure typing
  - invalid `counteragent.form` guesses such as `juridical`, `person`, `individual`
  - missing `members.*.counteragent.customForm.formName`
  - missing `members.*.counteragent.customForm.countryUID`
  - missing `members.sender.counteragent.inn`
  - missing `members.receiver.counteragent.document`
  - phone format (`7XXXXXXXXXX`)
  - `delivery` date/time and requester/payment blocks
- For temporary continuity, draft fallback may be used if configured.
- Booking readiness checklist (before go-live):
  - `DELLIN_DRAFT_ONLY=false` for real order placement.
  - Optional strict mode: `DELLIN_ENFORCE_REAL_BOOKING=true` (blocks silent fallback to draft on `inOrder` validation errors).
  - Valid sender UID is resolvable (`DELLIN_REQUESTER_UID` or auth/counteragents response).
  - Sender/recipient contacts and cargo title are filled in order snapshot.
  - Observe logs for retry diagnostics:
    - `auth retry ...` (session acquisition)
    - `retry ... op=request:create ...` (booking transport/rate-limit retries)
- Verified dev result:
  - PR #22 fixed Dellin counteragent/customForm/document payload.
  - PR #23 fixed numeric `requestID` parsing.
  - Staging real confirm via `/tms-demo` returned `status=CONFIRMED`, `trackingNumber=DELLIN-REQ-62267026`, `carrierOrderReference=62267026`, `carrierId=dellin`.

### Major
- EXPRESS and LTL use different SOAP routing/namespaces.
- Ensure quotes are generated from the correct service channel.
- Pickup date must be a business day. Use selected `draft.pickupDate` when present, otherwise resolve the next business day before `CreateOrder`.

### CDEK
- Print/doc generation can lag behind booking acceptance.
- Use retry polling before treating doc generation as failed.

## Production Promotion Checklist
- Confirm latest `dev` deploy completed successfully and staging fast smoke passed.
- Run one controlled real confirm on staging for the carrier being promoted.
- Capture the returned `shipmentId`, `trackingNumber`, `carrierOrderReference`, and `requestId`.
- Confirm no unexpected `5xx`, auth, or validation errors in the carrier logs during the test window.
- Promote the same code path through `main`/production CI rather than hotpatching production.
- After production deploy, run non-destructive health/list smoke first, then run a single controlled real booking only if the business owner approves carrier side effects.
- For Dellin specifically, do not enable broad real booking traffic until the recipient document policy is approved and reflected in partner API requirements/configuration.

## Escalation matrix
- L1 Support: reproduce, classify, gather requestId + exact error.
- L2 Integration engineer: payload mapping fix, credential/session flow, adapter logic.
- L3 Platform owner: DNS, ingress, TLS, global endpoint/certificate issues.

## First-line support checklist
- Confirm tenant/user and carrier (`cdek` / `major-express` / `dellin`).
- Capture minimal case: order id, shipment id, request id, event time, endpoint used.
- Reproduce once only, avoid repeated retries without config changes.
- Classify and route:
  - `400 validation/schema` -> L2 (payload mapping)
  - `401/403 auth` -> L2 (credentials/session)
  - `timeout/5xx` -> L2 first, L3 if systemic
  - `doc not ready` -> wait/retry by carrier readiness window
- Add incident note with exact raw error and last successful step (`estimate/select/confirm/refresh/docs`).

## Escalation payload template
- `carrier`: `<carrier-id>`
- `requestId`: `<x-request-id>`
- `shipmentId`: `<shipment-id>`
- `step`: `<estimate|confirm|refresh|documents>`
- `errorClass`: `<validation|auth|timeout|doc_not_ready|carrier|unknown>`
- `errorText`: `<verbatim>`
- `firstSeenAt`: `<UTC timestamp>`
- `lastSeenAt`: `<UTC timestamp>`

## Definition of healthy state
- Quote success rate > 95% by carrier.
- Confirm success rate > 95% by carrier.
- Document download success rate > 95% for confirmed shipments.
- No unresolved stale shipments beyond agreed SLA window.

## Daily operations
- Run nightly smoke manually when needed:
  - `npm run smoke:tms:nightly`
  - with carrier scenarios:
    - `CLIENT_ID=... CLIENT_SECRET=... NIGHTLY_CARRIERS=cdek,major-express npm run smoke:tms:nightly`
- Read aggregate SLO metrics:
  - `GET /api/tms/slo/metrics?staleHours=24&webhookWindowHours=24`
- Run SLO alert gate:
  - `ACCESS_TOKEN=... npm run slo:tms:check`
- Pull fallback tuning (stale shipment refresh worker):
  - `TMS_STALE_POLL_EVERY_SECONDS` (default `120`)
  - `TMS_STALE_SHIPMENT_MINUTES` (default `30`)
  - `TMS_STALE_POLL_MAX_JOBS` (default `30`)
- Smoke output format:
  - success: `PASS carrier=<id> requestId=<requestId> shipmentId=<shipmentId>`
  - fail-fast: `FAIL step=<step> reason=<auth|validation|timeout|doc_not_ready|carrier|unknown>`

## Alert thresholds (recommended)
- `staleShipments` > `50` for `24h` window.
- `webhookDelivery.successRate` < `0.95` for `24h` window.
- `syncJobs.failed` > `20`.
- `latency.quoteMs.p95` > `120000`.
- `latency.confirmMs.p95` > `180000`.
- dominant `carrierErrors.byCarrier[0].rate` > `0.70`.

## Automation tip
- Add cron or CI schedule:
  - `*/15 * * * * ACCESS_TOKEN=... API_BASE_URL=https://api.handyseller.ru/api npm run slo:tms:check`
- Any non-zero exit code from the check should open/raise an incident.
