import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SYNC_QUEUE_NAME } from './sync-queue.constants';
import type { ProductData } from '../adapters/base-marketplace.adapter';

export interface SyncJobResult {
  jobId: string;
  message: string;
}

export interface ImportJobResult {
  jobId: string;
  message: string;
}

@Injectable()
export class SyncQueueService {
  constructor(
    @InjectQueue(SYNC_QUEUE_NAME)
    private readonly syncQueue: Queue,
  ) {}

  async addSyncJob(
    userId: string,
    products: ProductData[],
    marketplace?: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
  ): Promise<SyncJobResult> {
    const job = await this.syncQueue.add('sync', { userId, products, marketplace }, { removeOnComplete: 100 });
    return {
      jobId: job.id ?? String(job),
      message: `Синхронизация запущена. jobId=${job.id}`,
    };
  }

  async addImportJob(
    userId: string,
    marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO',
  ): Promise<ImportJobResult> {
    const job = await this.syncQueue.add('import', { userId, marketplace }, { removeOnComplete: 100 });
    return {
      jobId: job.id ?? String(job),
      message: `Импорт запущен в фоне. jobId=${job.id}`,
    };
  }

  async getJobStatus(jobId: string) {
    const job = await this.syncQueue.getJob(jobId);
    if (!job) return null;
    const state = await job.getState();
    return {
      id: job.id,
      state,
      progress: job.progress,
      data: job.data,
      result: job.returnvalue,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn,
      processedOn: job.processedOn,
    };
  }
}
