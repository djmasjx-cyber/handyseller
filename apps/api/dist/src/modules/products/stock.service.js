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
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockService = void 0;
const common_1 = require("@nestjs/common");
const event_emitter_1 = require("@nestjs/event-emitter");
const prisma_service_1 = require("../../common/database/prisma.service");
const client_1 = require("@prisma/client");
const logger_service_1 = require("../../common/logger/logger.service");
const products_service_1 = require("./products.service");
let StockService = class StockService {
    constructor(prisma, logger, eventEmitter) {
        this.prisma = prisma;
        this.logger = logger;
        this.eventEmitter = eventEmitter;
    }
    async change(productId, userId, delta, options = {}) {
        if (delta === 0) {
            const p = await this.prisma.product.findUnique({
                where: { id: productId },
                select: { id: true, stock: true, title: true, article: true },
            });
            return p;
        }
        const { allowNegative = false, source = client_1.StockLogSource.MANUAL, note } = options;
        const result = await this.prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SELECT set_config('app.changed_by', $1, true), set_config('app.change_source', $2, true), set_config('app.change_note', $3, true)`, String(userId), String(source ?? 'MANUAL'), String(note ?? ''));
            const sql = allowNegative
                ? `UPDATE "Product" SET stock = stock + $1 WHERE id = $2 RETURNING id, stock, title, article`
                : `UPDATE "Product" SET stock = GREATEST(0, stock + $1) WHERE id = $2 RETURNING id, stock, title, article`;
            const rows = await tx.$queryRawUnsafe(sql, delta, productId);
            if (!rows || rows.length === 0) {
                throw new common_1.BadRequestException('Товар не найден.');
            }
            const row = rows[0];
            const quantityAfter = Number(row.stock);
            const quantityBefore = quantityAfter - delta;
            if (quantityAfter < 0 && allowNegative) {
                this.logger.warn('Отрицательный остаток товара', {
                    productId: row.id,
                    productTitle: row.title,
                    quantityAfter,
                    delta,
                    source,
                });
            }
            await tx.stockLog.create({
                data: {
                    productId: row.id,
                    userId,
                    delta,
                    quantityBefore,
                    quantityAfter,
                    source,
                    note: note ?? undefined,
                },
            });
        });
        const updated = await this.prisma.product.findUnique({
            where: { id: productId },
        });
        if (updated) {
            this.eventEmitter.emit(products_service_1.PRODUCT_SYNC_CHANGED_EVENT, { userId, productId });
        }
        return updated;
    }
    async reserve(productId, userId, quantity, options = {}) {
        if (quantity <= 0) {
            throw new common_1.BadRequestException('Количество для резервирования должно быть положительным.');
        }
        return this.change(productId, userId, -quantity, {
            ...options,
            source: options.source ?? client_1.StockLogSource.SALE,
            allowNegative: options.allowNegative ?? false,
        });
    }
    async release(productId, userId, quantity, options = {}) {
        if (quantity <= 0) {
            throw new common_1.BadRequestException('Количество для возврата должно быть положительным.');
        }
        return this.change(productId, userId, quantity, {
            ...options,
            source: options.source ?? client_1.StockLogSource.SALE,
        });
    }
};
exports.StockService = StockService;
exports.StockService = StockService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        logger_service_1.LoggerService,
        event_emitter_1.EventEmitter2])
], StockService);
//# sourceMappingURL=stock.service.js.map