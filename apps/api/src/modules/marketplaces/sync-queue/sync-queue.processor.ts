import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SYNC_QUEUE_NAME } from './sync-queue.constants';
import { MarketplacesService } from '../marketplaces.service';
import type { ProductData } from '../adapters/base-marketplace.adapter';

export interface SyncJobPayload {
  userId: string;
  products: ProductData[];
  marketplace?: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO';
}

@Processor(SYNC_QUEUE_NAME, { concurrency: 2 })
export class SyncQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncQueueProcessor.name);

  constructor(private readonly marketplacesService: MarketplacesService) {
    super();
  }

  async process(job: Job<SyncJobPayload>): Promise<unknown> {
    const { userId, products, marketplace } = job.data;
    this.logger.log(`[${job.id}] Синхронизация для user=${userId}, товаров=${products.length}${marketplace ? `, маркет=${marketplace}` : ''}`);
    try {
      const results = await this.marketplacesService.syncProducts(userId, products, marketplace);
      return results;
    } catch (error) {
      this.logger.error(`[${job.id}] Ошибка синхронизации:`, error);
      throw error;
    }
  }
}
