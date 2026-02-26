import { Queue } from 'bullmq';
import type { ProductData } from '../adapters/base-marketplace.adapter';
export interface SyncJobResult {
    jobId: string;
    message: string;
}
export declare class SyncQueueService {
    private readonly syncQueue;
    constructor(syncQueue: Queue);
    addSyncJob(userId: string, products: ProductData[], marketplace?: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO'): Promise<SyncJobResult>;
    getJobStatus(jobId: string): Promise<{
        id: string | undefined;
        state: "unknown" | import("bullmq").JobState;
        progress: import("bullmq").JobProgress;
        data: any;
        result: any;
        failedReason: string;
        finishedOn: number | undefined;
        processedOn: number | undefined;
    } | null>;
}
