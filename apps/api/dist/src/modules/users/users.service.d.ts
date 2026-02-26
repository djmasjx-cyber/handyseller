import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
export declare class UsersService {
    private prisma;
    private crypto;
    constructor(prisma: PrismaService, crypto: CryptoService);
    create(data: {
        email: string;
        passwordHash: string;
        name?: string;
        phone?: string;
    }): Promise<{
        id: string;
        createdAt: Date;
        email: string | null;
        emailHash: string | null;
        emailEncrypted: string | null;
        name: string | null;
        phone: string | null;
        role: import(".prisma/client").$Enums.Role;
    }>;
    findByEmail(email: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        email: string | null;
        emailHash: string | null;
        emailEncrypted: string | null;
        passwordHash: string;
        name: string | null;
        phone: string | null;
        role: import(".prisma/client").$Enums.Role;
        isActive: boolean;
        twoFactorSecret: string | null;
        linkedToUserId: string | null;
    } | null>;
    updateProfile(userId: string, data: {
        name?: string;
        phone?: string;
        linkedToUserEmail?: string;
    }): Promise<{
        linkedToUserEmail: string | null;
        id: string;
        createdAt: Date;
        email: string | null;
        name: string | null;
        phone: string | null;
        role: import(".prisma/client").$Enums.Role;
    } | {
        id: string;
        createdAt: Date;
        email: string | null;
        name: string | null;
        phone: string | null;
        role: import(".prisma/client").$Enums.Role;
        linkedToUserId: string | null;
    } | null>;
    findById(id: string): Promise<{
        linkedToUserEmail: string | null;
        id: string;
        createdAt: Date;
        email: string | null;
        name: string | null;
        phone: string | null;
        role: import(".prisma/client").$Enums.Role;
    } | null>;
    findAllForAdmin(opts?: {
        skip?: number;
        take?: number;
    }): Promise<{
        users: {
            ordersCount: number;
            productsCount: number;
            plan: import(".prisma/client").$Enums.SubscriptionPlan;
            subscriptionExpiresAt: Date | null;
            id: string;
            createdAt: Date;
            email: string | null;
            name: string | null;
            role: import(".prisma/client").$Enums.Role;
            isActive: boolean;
        }[];
        total: number;
    }>;
    decryptUserPii<T extends {
        email?: string | null;
        emailEncrypted?: string | null;
        name?: string | null;
        phone?: string | null;
    }>(row: T): T & {
        email?: string | null;
    };
    private decryptPii;
}
