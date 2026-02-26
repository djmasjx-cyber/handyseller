import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { RegisterDto } from './dto/register.dto';
export declare class AuthService {
    private usersService;
    private prisma;
    private jwtService;
    private config;
    private crypto;
    constructor(usersService: UsersService, prisma: PrismaService, jwtService: JwtService, config: ConfigService, crypto: CryptoService);
    register(dto: RegisterDto, ip?: string, userAgent?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            name: string | null;
        };
    }>;
    registerVerify(email: string, code: string, ip?: string, userAgent?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string;
            name: string | null;
        };
    }>;
    login(email: string, password: string, ip?: string, userAgent?: string): Promise<{
        accessToken: string;
        refreshToken: string;
        user: {
            id: string;
            email: string | null;
            name: string | null;
            role: import(".prisma/client").$Enums.Role;
        };
    } | null>;
    refresh(refreshToken: string, ip?: string, userAgent?: string): Promise<{
        accessToken: string;
        refreshToken: string;
    } | null>;
    logout(refreshToken: string | undefined, userId?: string, ip?: string, userAgent?: string): Promise<void>;
    private issueTokens;
    validateRefreshToken(token: string): Promise<{
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
    private checkLoginBlocked;
    private recordFailedAttempt;
    private auditLog;
}
