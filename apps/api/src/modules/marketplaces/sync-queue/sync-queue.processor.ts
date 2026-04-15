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

export interface ImportJobPayload {
  userId: string;
  marketplace: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO';
}

@Processor(SYNC_QUEUE_NAME, { concurrency: 2 })
export class SyncQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(SyncQueueProcessor.name);

  constructor(private readonly marketplacesService: MarketplacesService) {
    super();
  }

  async process(job: Job<SyncJobPayload | ImportJobPayload>): Promise<unknown> {
    if (job.name === 'import') {
      const { userId, marketplace } = job.data as ImportJobPayload;
      this.logger.log(`[${job.id}] Импорт для user=${userId}, маркет=${marketplace}`);
      try {
        await job.updateProgress({ phase: 'start', processed: 0, total: 0, percent: 0 });
        const result = await this.marketplacesService.importProductsFromMarketplace(userId, marketplace, {
          onProgress: async ({ processed, total, percent }) => {
            await job.updateProgress({ phase: 'import', processed, total, percent });
          },
        });
        await job.updateProgress({ phase: 'done', percent: 100 });
        return result;
      } catch (error) {
        this.logger.error(`[${job.id}] Ошибка импорта:`, error);
        throw error;
      }
    }

    const { userId, products, marketplace } = job.data as SyncJobPayload;
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
