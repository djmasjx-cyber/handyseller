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
var SyncQueueProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncQueueProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const sync_queue_constants_1 = require("./sync-queue.constants");
const marketplaces_service_1 = require("../marketplaces.service");
let SyncQueueProcessor = SyncQueueProcessor_1 = class SyncQueueProcessor extends bullmq_1.WorkerHost {
    constructor(marketplacesService) {
        super();
        this.marketplacesService = marketplacesService;
        this.logger = new common_1.Logger(SyncQueueProcessor_1.name);
    }
    async process(job) {
        const { userId, products, marketplace } = job.data;
        this.logger.log(`[${job.id}] Синхронизация для user=${userId}, товаров=${products.length}${marketplace ? `, маркет=${marketplace}` : ''}`);
        try {
            const results = await this.marketplacesService.syncProducts(userId, products, marketplace);
            return results;
        }
        catch (error) {
            this.logger.error(`[${job.id}] Ошибка синхронизации:`, error);
            throw error;
        }
    }
};
exports.SyncQueueProcessor = SyncQueueProcessor;
exports.SyncQueueProcessor = SyncQueueProcessor = SyncQueueProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(sync_queue_constants_1.SYNC_QUEUE_NAME, { concurrency: 2 }),
    __metadata("design:paramtypes", [marketplaces_service_1.MarketplacesService])
], SyncQueueProcessor);
//# sourceMappingURL=sync-queue.processor.js.map