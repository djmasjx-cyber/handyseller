"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketplacesModule = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const axios_1 = require("@nestjs/axios");
const bullmq_1 = require("@nestjs/bullmq");
const crypto_module_1 = require("../../common/crypto/crypto.module");
const products_module_1 = require("../products/products.module");
const subscriptions_module_1 = require("../subscriptions/subscriptions.module");
const marketplaces_service_1 = require("./marketplaces.service");
const marketplaces_controller_1 = require("./marketplaces.controller");
const marketplace_adapter_factory_1 = require("./adapters/marketplace-adapter.factory");
const stock_sync_listener_1 = require("./stock-sync.listener");
const product_mapping_service_1 = require("./product-mapping.service");
const wb_supply_service_1 = require("./wb-supply.service");
const sync_queue_service_1 = require("./sync-queue/sync-queue.service");
const sync_queue_processor_1 = require("./sync-queue/sync-queue.processor");
const sync_queue_constants_1 = require("./sync-queue/sync-queue.constants");
let MarketplacesModule = class MarketplacesModule {
};
exports.MarketplacesModule = MarketplacesModule;
exports.MarketplacesModule = MarketplacesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            event_emitter_1.EventEmitterModule,
            axios_1.HttpModule,
            crypto_module_1.CryptoModule,
            products_module_1.ProductsModule,
            subscriptions_module_1.SubscriptionsModule,
            bullmq_1.BullModule.forRoot({
                connection: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT || '6379', 10),
                    password: process.env.REDIS_PASSWORD || undefined,
                },
            }),
            bullmq_1.BullModule.registerQueue({ name: sync_queue_constants_1.SYNC_QUEUE_NAME }),
        ],
        controllers: [marketplaces_controller_1.MarketplacesController],
        providers: [
            marketplaces_service_1.MarketplacesService,
            marketplace_adapter_factory_1.MarketplaceAdapterFactory,
            product_mapping_service_1.ProductMappingService,
            wb_supply_service_1.WbSupplyService,
            stock_sync_listener_1.StockSyncListener,
            sync_queue_service_1.SyncQueueService,
            sync_queue_processor_1.SyncQueueProcessor,
        ],
        exports: [marketplaces_service_1.MarketplacesService, marketplace_adapter_factory_1.MarketplaceAdapterFactory, product_mapping_service_1.ProductMappingService, sync_queue_service_1.SyncQueueService],
    })
], MarketplacesModule);
//# sourceMappingURL=marketplaces.module.js.map