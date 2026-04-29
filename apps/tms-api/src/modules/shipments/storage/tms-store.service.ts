import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type {
  ShipmentDocumentRecord,
  ShipmentRecord,
  ShipmentRequestRecord,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';
import { Pool } from 'pg';

type JsonRow = { payload: unknown };
type JobRow = {
  id: string;
  kind: string;
  payload: unknown;
  attempt: number;
};
type FailedJobRow = {
  id: string;
  kind: string;
  carrier: string | null;
  attempt: number;
  last_error: string | null;
  payload: unknown;
  next_run_at: string;
};
type IdempotencyRow = {
  response_payload: unknown;
};
type WebhookSubRow = { payload: unknown };
type StatusCountRow = { status: string; count: string };
type WebhookDeliveryCountRow = { status: string; count: string };
type CarrierFailedCountRow = { carrier: string | null; count: string };
type WebhookDeliveryReplayRow = {
  event_type: string;
  payload: unknown;
  created_at: string;
};
type StaleShipmentCandidateRow = {
  id: string;
  user_id: string;
  carrier: string | null;
  status: string;
  updated_at: string;
};

@Injectable()
export class TmsStoreService implements OnModuleInit {
  private readonly logger = new Logger(TmsStoreService.name);
  private readonly pool: Pool | null;
  private schemaInitPromise: Promise<void> | null = null;

  constructor() {
    const conn = process.env.TMS_DATABASE_URL?.trim() || '';
    this.pool = conn ? new Pool({ connectionString: conn }) : null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      this.logger.warn('TMS_DATABASE_URL is not set; tms-api runs with in-memory state only.');
      return;
    }
    await this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    if (!this.pool) return;
    if (this.schemaInitPromise) {
      await this.schemaInitPromise;
      return;
    }
    this.schemaInitPromise = this.pool
      .query(`
      CREATE TABLE IF NOT EXISTS tms_shipment_request (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tms_shipment (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tms_tracking_event (
        id TEXT PRIMARY KEY,
        shipment_id TEXT NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE TABLE IF NOT EXISTS tms_shipment_state (
        shipment_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        tracking_number TEXT,
        carrier_order_number TEXT,
        carrier_order_reference TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS tms_document_asset (
        id TEXT PRIMARY KEY,
        shipment_id TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'READY',
        mime_type TEXT,
        size_bytes INTEGER,
        checksum TEXT,
        object_key TEXT,
        carrier_ref TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tms_document_asset_shipment_type_version
        ON tms_document_asset(shipment_id, type, version);
      CREATE TABLE IF NOT EXISTS tms_sync_job (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        carrier TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        attempt INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        idempotency_key TEXT,
        payload JSONB NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS ux_tms_sync_job_idempotency
        ON tms_sync_job(idempotency_key)
        WHERE idempotency_key IS NOT NULL;
      CREATE TABLE IF NOT EXISTS tms_raw_exchange_log (
        id BIGSERIAL PRIMARY KEY,
        carrier TEXT NOT NULL,
        flow TEXT NOT NULL,
        reference_id TEXT,
        request_payload JSONB,
        response_payload JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS tms_api_idempotency (
        scope_key TEXT PRIMARY KEY,
        response_payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS tms_partner_webhook_subscription (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT NOT NULL,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS tms_partner_webhook_delivery (
        id BIGSERIAL PRIMARY KEY,
        subscription_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1,
        response_code INTEGER,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB
      );
      CREATE INDEX IF NOT EXISTS ix_tms_shipment_request_user_updated
        ON tms_shipment_request(user_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS ix_tms_shipment_request_external_order
        ON tms_shipment_request(user_id, ((payload -> 'integration' ->> 'externalOrderId')));
      CREATE INDEX IF NOT EXISTS ix_tms_shipment_request_order_type
        ON tms_shipment_request(user_id, ((payload -> 'integration' ->> 'orderType')));
      CREATE INDEX IF NOT EXISTS ix_tms_shipment_user_request_created
        ON tms_shipment(user_id, request_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_tms_shipment_user_status_updated
        ON tms_shipment(user_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS ix_tms_shipment_state_tracking
        ON tms_shipment_state(tracking_number)
        WHERE tracking_number IS NOT NULL;
      CREATE INDEX IF NOT EXISTS ix_tms_tracking_event_shipment_occurred
        ON tms_tracking_event(shipment_id, occurred_at DESC);
      CREATE INDEX IF NOT EXISTS ix_tms_document_asset_shipment_updated
        ON tms_document_asset(shipment_id, updated_at DESC);
    `)
      .then(() => undefined)
      .finally(() => {
        this.schemaInitPromise = null;
      });
    await this.schemaInitPromise;
  }

  private isMissingRelationError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const code = (error as { code?: string }).code;
    return code === '42P01';
  }

  isEnabled(): boolean {
    return Boolean(this.pool);
  }

  async loadRequests(): Promise<ShipmentRequestRecord[]> {
    if (!this.pool) return [];
    try {
      const rows = await this.pool.query<JsonRow>('SELECT payload FROM tms_shipment_request');
      return rows.rows.map((r) => r.payload as ShipmentRequestRecord);
    } catch (error) {
      if (!this.isMissingRelationError(error)) throw error;
      await this.ensureSchema();
      const rows = await this.pool.query<JsonRow>('SELECT payload FROM tms_shipment_request');
      return rows.rows.map((r) => r.payload as ShipmentRequestRecord);
    }
  }

  async loadShipments(): Promise<ShipmentRecord[]> {
    if (!this.pool) return [];
    try {
      const rows = await this.pool.query<JsonRow>('SELECT payload FROM tms_shipment');
      return rows.rows.map((r) => r.payload as ShipmentRecord);
    } catch (error) {
      if (!this.isMissingRelationError(error)) throw error;
      await this.ensureSchema();
      const rows = await this.pool.query<JsonRow>('SELECT payload FROM tms_shipment');
      return rows.rows.map((r) => r.payload as ShipmentRecord);
    }
  }

  async loadTracking(): Promise<TrackingEventRecord[]> {
    if (!this.pool) return [];
    try {
      const rows = await this.pool.query<JsonRow>('SELECT payload FROM tms_tracking_event');
      return rows.rows.map((r) => r.payload as TrackingEventRecord);
    } catch (error) {
      if (!this.isMissingRelationError(error)) throw error;
      await this.ensureSchema();
      const rows = await this.pool.query<JsonRow>('SELECT payload FROM tms_tracking_event');
      return rows.rows.map((r) => r.payload as TrackingEventRecord);
    }
  }

  async loadDocuments(): Promise<ShipmentDocumentRecord[]> {
    if (!this.pool) return [];
    try {
      const rows = await this.pool.query<JsonRow>('SELECT payload FROM tms_document_asset');
      return rows.rows.map((r) => r.payload as ShipmentDocumentRecord);
    } catch (error) {
      if (!this.isMissingRelationError(error)) throw error;
      await this.ensureSchema();
      const rows = await this.pool.query<JsonRow>('SELECT payload FROM tms_document_asset');
      return rows.rows.map((r) => r.payload as ShipmentDocumentRecord);
    }
  }

  async saveRequest(record: ShipmentRequestRecord): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO tms_shipment_request(id, user_id, status, payload, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status, payload = EXCLUDED.payload, updated_at = NOW()`,
      [record.id, record.userId, record.status, JSON.stringify(record)],
    );
  }

  async saveShipment(record: ShipmentRecord): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO tms_shipment(id, user_id, request_id, status, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, NOW())
       ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status, payload = EXCLUDED.payload, updated_at = NOW()`,
      [record.id, record.userId, record.requestId, record.status, JSON.stringify(record), record.createdAt],
    );
    await this.pool.query(
      `INSERT INTO tms_shipment_state(shipment_id, status, tracking_number, carrier_order_number, carrier_order_reference, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (shipment_id) DO UPDATE SET
         status = EXCLUDED.status,
         tracking_number = EXCLUDED.tracking_number,
         carrier_order_number = EXCLUDED.carrier_order_number,
         carrier_order_reference = EXCLUDED.carrier_order_reference,
         updated_at = NOW()`,
      [
        record.id,
        record.status,
        record.trackingNumber,
        record.carrierOrderNumber ?? null,
        record.carrierOrderReference ?? null,
      ],
    );
  }

  async deleteShipment(shipmentId: string): Promise<void> {
    if (!this.pool) return;
    await this.pool.query('DELETE FROM tms_tracking_event WHERE shipment_id = $1', [shipmentId]);
    await this.pool.query('DELETE FROM tms_document_asset WHERE shipment_id = $1', [shipmentId]);
    await this.pool.query('DELETE FROM tms_shipment_state WHERE shipment_id = $1', [shipmentId]);
    await this.pool.query('DELETE FROM tms_shipment WHERE id = $1', [shipmentId]);
  }

  async replaceTracking(shipmentId: string, events: TrackingEventRecord[]): Promise<void> {
    if (!this.pool) return;
    await this.pool.query('DELETE FROM tms_tracking_event WHERE shipment_id = $1', [shipmentId]);
    for (const event of events) {
      await this.pool.query(
        `INSERT INTO tms_tracking_event(id, shipment_id, occurred_at, payload)
         VALUES ($1, $2, $3::timestamptz, $4::jsonb)
         ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, occurred_at = EXCLUDED.occurred_at`,
        [event.id, shipmentId, event.occurredAt, JSON.stringify(event)],
      );
    }
  }

  async replaceDocuments(shipmentId: string, documents: ShipmentDocumentRecord[]): Promise<void> {
    if (!this.pool) return;
    await this.pool.query('DELETE FROM tms_document_asset WHERE shipment_id = $1', [shipmentId]);
    for (const doc of documents) {
      await this.pool.query(
        `INSERT INTO tms_document_asset(
          id, shipment_id, type, status, mime_type, payload, updated_at
         ) VALUES ($1, $2, $3, 'READY', $4, $5::jsonb, NOW())
         ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
        [
          doc.id,
          shipmentId,
          doc.type,
          doc.content.startsWith('major-pdf:') || doc.content.startsWith('cdek-pdf:')
            ? 'application/pdf'
            : 'text/plain',
          JSON.stringify(doc),
        ],
      );
    }
  }

  async appendRawExchangeLog(params: {
    carrier: string;
    flow: string;
    referenceId?: string | null;
    requestPayload?: unknown;
    responsePayload?: unknown;
  }): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO tms_raw_exchange_log(carrier, flow, reference_id, request_payload, response_payload)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)`,
      [
        params.carrier,
        params.flow,
        params.referenceId ?? null,
        params.requestPayload ? JSON.stringify(params.requestPayload) : null,
        params.responsePayload ? JSON.stringify(params.responsePayload) : null,
      ],
    );
  }

  async enqueueSyncJob(params: {
    id: string;
    kind: string;
    carrier?: string | null;
    idempotencyKey?: string | null;
    payload: unknown;
    nextRunAt?: string;
  }): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO tms_sync_job(id, kind, carrier, status, next_run_at, attempt, idempotency_key, payload)
       VALUES ($1, $2, $3, 'PENDING', COALESCE($4::timestamptz, NOW()), 0, $5, $6::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [
        params.id,
        params.kind,
        params.carrier ?? null,
        params.nextRunAt ?? null,
        params.idempotencyKey ?? null,
        JSON.stringify(params.payload),
      ],
    );
  }

  async claimDueSyncJobs(limit = 25): Promise<Array<{ id: string; kind: string; payload: unknown; attempt: number }>> {
    if (!this.pool) return [];
    const rows = await this.pool.query<JobRow>(
      `WITH picked AS (
         SELECT id
         FROM tms_sync_job
         WHERE status = 'PENDING' AND next_run_at <= NOW()
         ORDER BY next_run_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE tms_sync_job j
       SET status = 'RUNNING', attempt = attempt + 1, next_run_at = NOW() + INTERVAL '10 minutes'
       FROM picked
       WHERE j.id = picked.id
       RETURNING j.id, j.kind, j.payload, j.attempt`,
      [limit],
    );
    return rows.rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      payload: r.payload,
      attempt: r.attempt,
    }));
  }

  async markSyncJobDone(jobId: string): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(`UPDATE tms_sync_job SET status = 'DONE' WHERE id = $1`, [jobId]);
  }

  async markSyncJobRetry(jobId: string, errorMessage: string, delaySeconds: number): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `UPDATE tms_sync_job
       SET status = 'PENDING',
           last_error = $2,
           next_run_at = NOW() + make_interval(secs => $3::int)
       WHERE id = $1`,
      [jobId, errorMessage.slice(0, 800), Math.max(5, delaySeconds)],
    );
  }

  async markSyncJobFailed(jobId: string, errorMessage: string): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `UPDATE tms_sync_job
       SET status = 'FAILED',
           last_error = $2
       WHERE id = $1`,
      [jobId, errorMessage.slice(0, 800)],
    );
  }

  async listFailedSyncJobs(limit = 100): Promise<
    Array<{
      id: string;
      kind: string;
      carrier: string | null;
      attempt: number;
      lastError: string | null;
      payload: unknown;
      nextRunAt: string;
    }>
  > {
    if (!this.pool) return [];
    const rows = await this.pool.query<FailedJobRow>(
      `SELECT id, kind, carrier, attempt, last_error, payload, next_run_at::text
       FROM tms_sync_job
       WHERE status = 'FAILED'
       ORDER BY next_run_at ASC
       LIMIT $1`,
      [limit],
    );
    return rows.rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      carrier: r.carrier,
      attempt: r.attempt,
      lastError: r.last_error,
      payload: r.payload,
      nextRunAt: r.next_run_at,
    }));
  }

  async replayFailedSyncJob(jobId: string): Promise<boolean> {
    if (!this.pool) return false;
    const res = await this.pool.query(
      `UPDATE tms_sync_job
       SET status = 'PENDING', next_run_at = NOW(), last_error = NULL
       WHERE id = $1 AND status = 'FAILED'`,
      [jobId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async loadIdempotencyResponse(scopeKey: string): Promise<unknown | null> {
    if (!this.pool) return null;
    const rows = await this.pool.query<IdempotencyRow>(
      `SELECT response_payload
       FROM tms_api_idempotency
       WHERE scope_key = $1
       LIMIT 1`,
      [scopeKey],
    );
    if ((rows.rowCount ?? 0) < 1) return null;
    return rows.rows[0]?.response_payload ?? null;
  }

  async saveIdempotencyResponse(scopeKey: string, responsePayload: unknown): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO tms_api_idempotency(scope_key, response_payload, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (scope_key) DO UPDATE
       SET response_payload = EXCLUDED.response_payload,
           updated_at = NOW()`,
      [scopeKey, JSON.stringify(responsePayload)],
    );
  }

  async loadWebhookSubscriptions(): Promise<
    Array<{
      id: string;
      userId: string;
      callbackUrl: string;
      status: 'ACTIVE' | 'DISABLED';
      createdAt: string;
      updatedAt: string;
      secretMasked: string;
      signingSecret: string;
    }>
  > {
    if (!this.pool) return [];
    const rows = await this.pool.query<WebhookSubRow>('SELECT payload FROM tms_partner_webhook_subscription');
    return rows.rows.map(
      (r) =>
        r.payload as {
          id: string;
          userId: string;
          callbackUrl: string;
          status: 'ACTIVE' | 'DISABLED';
          createdAt: string;
          updatedAt: string;
          secretMasked: string;
          signingSecret: string;
        },
    );
  }

  async saveWebhookSubscription(record: {
    id: string;
    userId: string;
    callbackUrl: string;
    status: 'ACTIVE' | 'DISABLED';
    createdAt: string;
    updatedAt: string;
    secretMasked: string;
    signingSecret: string;
  }): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO tms_partner_webhook_subscription(id, user_id, status, payload, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE
       SET status = EXCLUDED.status,
           payload = EXCLUDED.payload,
           updated_at = NOW()`,
      [record.id, record.userId, record.status, JSON.stringify(record)],
    );
  }

  async deleteWebhookSubscription(id: string): Promise<void> {
    if (!this.pool) return;
    await this.pool.query('DELETE FROM tms_partner_webhook_subscription WHERE id = $1', [id]);
  }

  async appendWebhookDeliveryLog(record: {
    subscriptionId: string;
    eventId: string;
    eventType: string;
    status: 'SUCCESS' | 'FAILED';
    attempt: number;
    responseCode?: number | null;
    errorMessage?: string | null;
    payload?: unknown;
  }): Promise<void> {
    if (!this.pool) return;
    await this.pool.query(
      `INSERT INTO tms_partner_webhook_delivery(
        subscription_id, event_id, event_type, status, attempt, response_code, error_message, payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        record.subscriptionId,
        record.eventId,
        record.eventType,
        record.status,
        Math.max(1, record.attempt),
        record.responseCode ?? null,
        record.errorMessage?.slice(0, 800) ?? null,
        record.payload ? JSON.stringify(record.payload) : null,
      ],
    );
  }

  async getWebhookDeliveryReplayPayload(
    subscriptionId: string,
    eventId: string,
  ): Promise<{ eventType: string; payload: unknown; occurredAt: string } | null> {
    if (!this.pool) return null;
    const rows = await this.pool.query<WebhookDeliveryReplayRow>(
      `SELECT event_type, payload, created_at::text
       FROM tms_partner_webhook_delivery
       WHERE subscription_id = $1 AND event_id = $2
       ORDER BY id DESC
       LIMIT 1`,
      [subscriptionId, eventId],
    );
    if ((rows.rowCount ?? 0) < 1) return null;
    const row = rows.rows[0];
    return {
      eventType: row.event_type,
      payload: row.payload ?? null,
      occurredAt: row.created_at,
    };
  }

  async getSyncJobStats(): Promise<{ pending: number; running: number; failed: number }> {
    if (!this.pool) return { pending: 0, running: 0, failed: 0 };
    const rows = await this.pool.query<StatusCountRow>(
      `SELECT status, COUNT(*)::text AS count
       FROM tms_sync_job
       GROUP BY status`,
    );
    const out = { pending: 0, running: 0, failed: 0 };
    for (const row of rows.rows) {
      const value = Number.parseInt(row.count, 10) || 0;
      const status = row.status.toUpperCase();
      if (status === 'PENDING') out.pending = value;
      if (status === 'RUNNING') out.running = value;
      if (status === 'FAILED') out.failed = value;
    }
    return out;
  }

  async getWebhookDeliveryStats(hours = 24): Promise<{ success: number; failed: number }> {
    if (!this.pool) return { success: 0, failed: 0 };
    const safeHours = Math.max(1, Math.min(24 * 30, Math.floor(hours)));
    const rows = await this.pool.query<WebhookDeliveryCountRow>(
      `SELECT status, COUNT(*)::text AS count
       FROM tms_partner_webhook_delivery
       WHERE created_at >= NOW() - make_interval(hours => $1::int)
       GROUP BY status`,
      [safeHours],
    );
    const out = { success: 0, failed: 0 };
    for (const row of rows.rows) {
      const value = Number.parseInt(row.count, 10) || 0;
      const status = row.status.toUpperCase();
      if (status === 'SUCCESS') out.success = value;
      if (status === 'FAILED') out.failed = value;
    }
    return out;
  }

  async getCarrierFailedJobStats(hours = 24): Promise<Array<{ carrier: string; failed: number }>> {
    if (!this.pool) return [];
    const safeHours = Math.max(1, Math.min(24 * 30, Math.floor(hours)));
    const rows = await this.pool.query<CarrierFailedCountRow>(
      `SELECT COALESCE(NULLIF(carrier, ''), 'unknown') AS carrier, COUNT(*)::text AS count
       FROM tms_sync_job
       WHERE status = 'FAILED'
         AND next_run_at >= NOW() - make_interval(hours => $1::int)
       GROUP BY COALESCE(NULLIF(carrier, ''), 'unknown')
       ORDER BY COUNT(*) DESC`,
      [safeHours],
    );
    return rows.rows.map((row) => ({
      carrier: row.carrier || 'unknown',
      failed: Number.parseInt(row.count, 10) || 0,
    }));
  }

  async listStaleShipmentCandidates(staleMinutes = 30, limit = 50): Promise<
    Array<{ shipmentId: string; userId: string; carrier: string | null; status: string; updatedAt: string }>
  > {
    if (!this.pool) return [];
    const safeMinutes = Math.max(5, Math.min(24 * 60, Math.floor(staleMinutes)));
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const rows = await this.pool.query<StaleShipmentCandidateRow>(
      `SELECT id, user_id, carrier, status, updated_at::text
       FROM tms_shipment
       WHERE status NOT IN ('DELIVERED', 'CANCELLED', 'SUPERSEDED', 'DELETED_EXTERNAL')
         AND updated_at <= NOW() - make_interval(mins => $1::int)
       ORDER BY updated_at ASC
       LIMIT $2`,
      [safeMinutes, safeLimit],
    );
    return rows.rows.map((row) => ({
      shipmentId: row.id,
      userId: row.user_id,
      carrier: row.carrier,
      status: row.status,
      updatedAt: row.updated_at,
    }));
  }
}

