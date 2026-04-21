import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ShipmentsService } from '../shipments.service';
import { TmsStoreService } from './tms-store.service';

@Injectable()
export class CarrierSyncWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CarrierSyncWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

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
    await this.store.markSyncJobDone(job.id);
  }
}

