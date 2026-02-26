import { WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MarketplacesService } from '../marketplaces.service';
import type { ProductData } from '../adapters/base-marketplace.adapter';
export interface SyncJobPayload {
    userId: string;
    products: ProductData[];
    marketplace?: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO';
}
export declare class SyncQueueProcessor extends WorkerHost {
    private readonly marketplacesService;
    private readonly logger;
    constructor(marketplacesService: MarketplacesService);
    process(job: Job<SyncJobPayload>): Promise<unknown>;
}
