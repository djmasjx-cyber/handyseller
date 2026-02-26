"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncQueueService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const sync_queue_constants_1 = require("./sync-queue.constants");
let SyncQueueService = class SyncQueueService {
    constructor(syncQueue) {
        this.syncQueue = syncQueue;
    }
    async addSyncJob(userId, products, marketplace) {
        const job = await this.syncQueue.add('sync', { userId, products, marketplace }, { removeOnComplete: 100 });
        return {
            jobId: job.id ?? String(job),
            message: `Синхронизация запущена. jobId=${job.id}`,
        };
    }
    async getJobStatus(jobId) {
        const job = await this.syncQueue.getJob(jobId);
        if (!job)
            return null;
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
};
exports.SyncQueueService = SyncQueueService;
exports.SyncQueueService = SyncQueueService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(sync_queue_constants_1.SYNC_QUEUE_NAME)),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], SyncQueueService);
//# sourceMappingURL=sync-queue.service.js.map