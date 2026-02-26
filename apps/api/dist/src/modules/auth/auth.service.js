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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const date_fns_1 = require("date-fns");
const crypto_1 = require("crypto");
const users_service_1 = require("../users/users.service");
const prisma_service_1 = require("../../common/database/prisma.service");
const crypto_service_1 = require("../../common/crypto/crypto.service");
const hash_util_1 = require("../../common/utils/hash.util");
const REFRESH_EXPIRES_DAYS = 7;
const ACCESS_EXPIRES_DEFAULT = '2h';
const BLOCK_AFTER_FAILURES = 5;
const BLOCK_DURATION_MINUTES = 15;
let AuthService = class AuthService {
    constructor(usersService, prisma, jwtService, config, crypto) {
        this.usersService = usersService;
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.config = config;
        this.crypto = crypto;
    }
    async register(dto, ip, userAgent) {
        const existing = await this.usersService.findByEmail(dto.email);
        if (existing) {
            throw new common_1.ConflictException('Пользователь с таким email уже зарегистрирован');
        }
        const passwordHash = await (0, hash_util_1.hashPassword)(dto.password);
        const user = await this.usersService.create({
            ...dto,
            passwordHash,
        });
        const email = user.email ?? '';
        const { accessToken, refreshToken } = await this.issueTokens(user.id, email, 'USER');
        await this.auditLog(user.id, 'REGISTER', ip, userAgent, true);
        return { accessToken, refreshToken, user: { id: user.id, email, name: user.name } };
    }
    async registerVerify(email, code, ip, userAgent) {
        const emailHash = this.crypto.hashForLookup(email);
        const verification = await this.prisma.emailVerification.findUnique({
            where: { emailHash },
        });
        if (!verification || verification.code !== code) {
            throw new common_1.BadRequestException('Неверный или истёкший код подтверждения');
        }
        if (verification.expiresAt < new Date()) {
            await this.prisma.emailVerification.delete({ where: { id: verification.id } });
            throw new common_1.BadRequestException('Код истёк. Запросите новый код.');
        }
        const emailNorm = email.trim().toLowerCase();
        const name = this.crypto.decryptOptional(verification.nameEncrypted) ?? undefined;
        const phone = this.crypto.decryptOptional(verification.phoneEncrypted) ?? undefined;
        const user = await this.usersService.create({
            email: emailNorm,
            passwordHash: verification.passwordHash,
            name,
            phone,
        });
        await this.prisma.emailVerification.delete({ where: { id: verification.id } });
        const userEmail = user.email ?? emailNorm;
        const { accessToken, refreshToken } = await this.issueTokens(user.id, userEmail, 'USER');
        await this.auditLog(user.id, 'REGISTER', ip, userAgent, true);
        return { accessToken, refreshToken, user: { id: user.id, email: userEmail, name: user.name } };
    }
    async login(email, password, ip, userAgent) {
        await this.checkLoginBlocked(ip);
        const user = await this.usersService.findByEmail(email);
        if (!user) {
            await this.recordFailedAttempt(ip, email);
            await this.auditLog(null, 'LOGIN', ip, userAgent, false, { email });
            return null;
        }
        const ok = await (0, hash_util_1.comparePassword)(password, user.passwordHash);
        if (!ok) {
            await this.recordFailedAttempt(ip, email);
            await this.auditLog(user.id, 'LOGIN', ip, userAgent, false);
            return null;
        }
        const userDto = this.usersService.decryptUserPii(user);
        const { accessToken, refreshToken } = await this.issueTokens(user.id, userDto.email, user.role);
        await this.auditLog(user.id, 'LOGIN', ip, userAgent, true);
        return {
            accessToken,
            refreshToken,
            user: { id: userDto.id, email: userDto.email, name: userDto.name, role: userDto.role },
        };
    }
    async refresh(refreshToken, ip, userAgent) {
        const stored = await this.prisma.refreshToken.findUnique({
            where: { token: refreshToken },
            include: { user: true },
        });
        if (!stored || stored.expiresAt < new Date()) {
            if (stored)
                await this.prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => { });
            await this.auditLog(stored?.userId ?? null, 'REFRESH', ip, userAgent, false);
            return null;
        }
        await this.prisma.refreshToken.delete({ where: { id: stored.id } });
        const userDto = this.usersService.decryptUserPii(stored.user);
        const { accessToken, refreshToken: newRefresh } = await this.issueTokens(stored.userId, userDto.email, stored.user.role);
        await this.auditLog(stored.userId, 'REFRESH', ip, userAgent, true);
        return { accessToken, refreshToken: newRefresh };
    }
    async logout(refreshToken, userId, ip, userAgent) {
        if (refreshToken) {
            await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
        }
        await this.auditLog(userId ?? null, 'LOGOUT', ip, userAgent, true);
    }
    async issueTokens(userId, email, role) {
        const payload = { sub: userId, email, role: role ?? 'USER' };
        const expiresIn = this.config.get('JWT_EXPIRES_IN') ?? ACCESS_EXPIRES_DEFAULT;
        const accessToken = this.jwtService.sign(payload, { expiresIn });
        const token = (0, crypto_1.randomBytes)(32).toString('hex');
        const expiresAt = (0, date_fns_1.addDays)(new Date(), REFRESH_EXPIRES_DAYS);
        await this.prisma.refreshToken.create({
            data: { userId, token, expiresAt },
        });
        const refreshToken = this.jwtService.sign({ sub: userId, jti: token }, { expiresIn: `${REFRESH_EXPIRES_DAYS}d` });
        return { accessToken, refreshToken: token };
    }
    async validateRefreshToken(token) {
        const stored = await this.prisma.refreshToken.findUnique({
            where: { token },
            include: { user: true },
        });
        if (!stored || stored.expiresAt < new Date())
            return null;
        return stored.user;
    }
    async checkLoginBlocked(ip) {
        if (!ip)
            return;
        const since = (0, date_fns_1.addMinutes)(new Date(), -BLOCK_DURATION_MINUTES);
        const failed = await this.prisma.loginAttempt.count({
            where: { ip, success: false, createdAt: { gte: since } },
        });
        if (failed >= BLOCK_AFTER_FAILURES) {
            throw new Error('BLOCKED');
        }
    }
    async recordFailedAttempt(ip, email) {
        if (!ip)
            return;
        const emailEncrypted = email ? this.crypto.encryptOptional(email.trim()) : null;
        await this.prisma.loginAttempt.create({
            data: { ip, emailEncrypted, success: false },
        });
    }
    async auditLog(userId, action, ip, userAgent, success, metadata) {
        await this.prisma.authAuditLog.create({
            data: {
                userId,
                action,
                ip,
                userAgent,
                success: success ?? false,
                metadata: JSON.parse(JSON.stringify(metadata ?? {})),
            },
        });
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [users_service_1.UsersService,
        prisma_service_1.PrismaService,
        jwt_1.JwtService,
        config_1.ConfigService,
        crypto_service_1.CryptoService])
], AuthService);
//# sourceMappingURL=auth.service.js.map