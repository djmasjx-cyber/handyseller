import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ShipmentsService } from '../shipments.service';
import { TmsStoreService } from './tms-store.service';

@Injectable()
export class CarrierSyncWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CarrierSyncWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private lastStalePollAt = 0;

  constructor(
    private readonly store: TmsStoreService,
    private readonly shipmentsService: ShipmentsService,
  ) {}

  onModuleInit(): void {
    if (!this.store.isEnabled()) return;
    this.timer = setInterval(() => void this.tick(), 5000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.enqueueStaleRefreshJobs();
      const jobs = await this.store.claimDueSyncJobs(20);
      for (const job of jobs) {
        await this.execute(job).catch(async (error) => {
          const message = error instanceof Error ? error.message : 'Unknown worker error';
          if (job.attempt >= 8) {
            await this.store.markSyncJobFailed(job.id, message);
            this.logger.error(`[sync-worker] failed jobId=${job.id} kind=${job.kind} reason=${message}`);
          } else {
            const backoff = Math.min(300, Math.max(10, job.attempt * 15));
            await this.store.markSyncJobRetry(job.id, message, backoff);
            this.logger.warn(`[sync-worker] retry jobId=${job.id} kind=${job.kind} reason=${message}`);
          }
        });
      }
    } finally {
      this.busy = false;
    }
  }

  private async enqueueStaleRefreshJobs(): Promise<void> {
    const pollEverySeconds = Math.max(30, Number.parseInt(process.env.TMS_STALE_POLL_EVERY_SECONDS ?? '120', 10) || 120);
    const staleMinutes = Math.max(
      5,
      Number.parseInt(process.env.TMS_STALE_SHIPMENT_MINUTES ?? '30', 10) || 30,
    );
    const maxJobs = Math.max(1, Number.parseInt(process.env.TMS_STALE_POLL_MAX_JOBS ?? '30', 10) || 30);
    const now = Date.now();
    if (now - this.lastStalePollAt < pollEverySeconds * 1000) return;
    this.lastStalePollAt = now;

    const candidates = await this.store.listStaleShipmentCandidates(staleMinutes, maxJobs);
    if (!candidates.length) return;
    const bucket = Math.floor(now / (pollEverySeconds * 1000));
    for (const candidate of candidates) {
      await this.store.enqueueSyncJob({
        id: `job_refresh_stale_${candidate.shipmentId}_${bucket}`,
        kind: 'refresh_shipment',
        carrier: candidate.carrier,
        idempotencyKey: `refresh:auto:${candidate.shipmentId}:${bucket}`,
        payload: { userId: candidate.userId, shipmentId: candidate.shipmentId },
      });
    }
    this.logger.log(`[sync-worker] queued stale refresh jobs=${candidates.length} staleMinutes=${staleMinutes}`);
  }

  private async execute(job: { id: string; kind: string; payload: unknown; attempt: number }): Promise<void> {
    if (job.kind === 'refresh_shipment') {
      const payload = (job.payload ?? {}) as { userId?: string; shipmentId?: string };
      if (!payload.userId || !payload.shipmentId) {
        await this.store.markSyncJobDone(job.id);
        return;
      }
      await this.shipmentsService.refreshShipment(payload.userId, payload.shipmentId, null);
      await this.store.markSyncJobDone(job.id);
      return;
    }
    if (job.kind === 'deliver_partner_webhook') {
      const payload = (job.payload ?? {}) as {
        subscriptionId?: string;
        eventType?: string;
        eventId?: string;
        occurredAt?: string;
        updatedAt?: string;
        data?: unknown;
      };
      if (!payload.subscriptionId || !payload.eventType || !payload.eventId || !payload.occurredAt) {
        await this.store.markSyncJobDone(job.id);
        return;
      }
      await this.shipmentsService.deliverWebhookEvent({
        subscriptionId: payload.subscriptionId,
        eventType: payload.eventType,
        eventId: payload.eventId,
        occurredAt: payload.occurredAt,
        updatedAt: payload.updatedAt ?? payload.occurredAt,
        attempt: job.attempt,
        data: payload.data,
      });
      await this.store.markSyncJobDone(job.id);
      return;
    }
    if (job.kind === 'ingest_carrier_webhook') {
      const payload = (job.payload ?? {}) as {
        carrier?: string;
        eventType?: string;
        eventId?: string;
        receivedAt?: string;
        payload?: unknown;
      };
      if (!payload.carrier || !payload.eventType || !payload.eventId || !payload.receivedAt) {
        await this.store.markSyncJobDone(job.id);
        return;
      }
      await this.shipmentsService.processInboundCarrierWebhook({
        carrier: payload.carrier,
        eventType: payload.eventType,
        eventId: payload.eventId,
        receivedAt: payload.receivedAt,
        payload: payload.payload,
      });
      await this.store.markSyncJobDone(job.id);
      return;
    }
    await this.store.markSyncJobDone(job.id);
  }
}

