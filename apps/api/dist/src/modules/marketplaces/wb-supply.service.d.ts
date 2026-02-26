import { PrismaService } from '../../common/database/prisma.service';
import { WildberriesAdapter } from './adapters/wildberries.adapter';
export declare class WbSupplyService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    getActiveSupply(userId: string): Promise<{
        id: string;
        userId: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        name: string | null;
        warehouseId: string | null;
        wbSupplyId: string;
    } | null>;
    getOrCreateActiveSupply(userId: string, adapter: WildberriesAdapter): Promise<{
        id: string;
        userId: string;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        name: string | null;
        warehouseId: string | null;
        wbSupplyId: string;
    }>;
}
