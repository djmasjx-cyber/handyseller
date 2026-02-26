import { PrismaService } from './common/database/prisma.service';
export declare class AppService {
    private prisma;
    constructor(prisma: PrismaService);
    getHealth(): {
        status: string;
        service: string;
        timestamp: string;
    };
    getHealthDetailed(): Promise<{
        status: string;
        service: string;
        timestamp: string;
        checks: {
            database: string;
        };
    }>;
}
