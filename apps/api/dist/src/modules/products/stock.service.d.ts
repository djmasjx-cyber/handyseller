import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/database/prisma.service';
import { StockLogSource } from '@prisma/client';
import { LoggerService } from '../../common/logger/logger.service';
export interface StockChangeOptions {
    allowNegative?: boolean;
    source?: StockLogSource;
    note?: string;
}
export declare class StockService {
    private prisma;
    private logger;
    private eventEmitter;
    constructor(prisma: PrismaService, logger: LoggerService, eventEmitter: EventEmitter2);
    change(productId: string, userId: string, delta: number, options?: StockChangeOptions): Promise<{
        id: string;
        title: string;
        article: string | null;
        stock: number;
    } | null>;
    reserve(productId: string, userId: string, quantity: number, options?: Omit<StockChangeOptions, 'allowNegative'> & {
        allowNegative?: boolean;
    }): Promise<{
        id: string;
        title: string;
        article: string | null;
        stock: number;
    } | null>;
    release(productId: string, userId: string, quantity: number, options?: Omit<StockChangeOptions, 'allowNegative'>): Promise<{
        id: string;
        title: string;
        article: string | null;
        stock: number;
    } | null>;
}
