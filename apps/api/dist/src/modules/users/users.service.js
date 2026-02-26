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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/database/prisma.service");
const crypto_service_1 = require("../../common/crypto/crypto.service");
let UsersService = class UsersService {
    constructor(prisma, crypto) {
        this.prisma = prisma;
        this.crypto = crypto;
    }
    async create(data) {
        const emailNorm = data.email.trim().toLowerCase();
        const emailHash = this.crypto.hashForLookup(data.email);
        const emailEncrypted = this.crypto.encrypt(emailNorm);
        const encryptedName = this.crypto.encryptOptional(data.name);
        const encryptedPhone = this.crypto.encryptOptional(data.phone);
        const user = await this.prisma.user.create({
            data: {
                emailHash,
                emailEncrypted,
                passwordHash: data.passwordHash,
                name: encryptedName,
                phone: encryptedPhone,
                subscription: {
                    create: { plan: 'FREE' },
                },
            },
            select: { id: true, email: true, emailHash: true, emailEncrypted: true, name: true, phone: true, role: true, createdAt: true },
        });
        return this.decryptPii(user);
    }
    async findByEmail(email) {
        const emailHash = this.crypto.hashForLookup(email);
        const byHash = await this.prisma.user.findUnique({
            where: { emailHash },
        });
        if (byHash)
            return byHash;
        return this.prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() },
        });
    }
    async updateProfile(userId, data) {
        const encryptedName = data.name !== undefined ? this.crypto.encryptOptional(data.name) : undefined;
        const encryptedPhone = data.phone !== undefined ? this.crypto.encryptOptional(data.phone) : undefined;
        let linkedToUserId = undefined;
        if (data.linkedToUserEmail !== undefined) {
            const email = data.linkedToUserEmail == null ? '' : String(data.linkedToUserEmail).trim();
            if (!email) {
                linkedToUserId = null;
            }
            else {
                const target = await this.findByEmail(email);
                if (!target) {
                    throw new common_1.BadRequestException('Пользователь с таким email не найден.');
                }
                if (target.id === userId) {
                    throw new common_1.BadRequestException('Нельзя привязать аккаунт к самому себе.');
                }
                if (target.linkedToUserId === userId) {
                    throw new common_1.BadRequestException('Циклическая привязка запрещена.');
                }
                linkedToUserId = target.id;
            }
        }
        const updateData = {};
        if (encryptedName !== undefined)
            updateData.name = encryptedName;
        if (encryptedPhone !== undefined)
            updateData.phone = encryptedPhone;
        if (linkedToUserId !== undefined)
            updateData.linkedToUserId = linkedToUserId;
        if (Object.keys(updateData).length === 0)
            return this.findById(userId);
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: updateData,
            select: { id: true, email: true, name: true, phone: true, role: true, linkedToUserId: true, createdAt: true },
        });
        return this.decryptPii(user);
    }
    async findById(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                name: true,
                phone: true,
                role: true,
                createdAt: true,
                linkedToUser: { select: { emailEncrypted: true } },
            },
        });
        if (!user)
            return null;
        const decrypted = this.decryptPii(user);
        const linkedToUserEmail = user.linkedToUser?.emailEncrypted
            ? this.crypto.decryptOptional(user.linkedToUser.emailEncrypted)
            : null;
        const { linkedToUser, ...out } = decrypted;
        return { ...out, linkedToUserEmail };
    }
    async findAllForAdmin(opts) {
        const [users, total] = await Promise.all([
            this.prisma.user.findMany({
                skip: opts?.skip ?? 0,
                take: opts?.take ?? 50,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    name: true,
                    role: true,
                    isActive: true,
                    createdAt: true,
                    _count: { select: { orders: true, products: true } },
                    subscription: { select: { plan: true, expiresAt: true } },
                },
            }),
            this.prisma.user.count(),
        ]);
        const usersOut = users.map((u) => {
            const { _count, subscription, ...base } = u;
            const decrypted = this.decryptPii(base);
            return {
                ...decrypted,
                ordersCount: _count.orders,
                productsCount: _count.products,
                plan: subscription?.plan ?? 'FREE',
                subscriptionExpiresAt: subscription?.expiresAt ?? null,
            };
        });
        return { users: usersOut, total };
    }
    decryptUserPii(row) {
        return this.decryptPii(row);
    }
    decryptPii(row) {
        const email = row.emailEncrypted
            ? this.crypto.decryptOptional(row.emailEncrypted)
            : row.email;
        return {
            ...row,
            email: email ?? row.email,
            name: this.crypto.decryptOptional(row.name),
            phone: row.phone
                ? this.crypto.decryptOptional(row.phone)
                : undefined,
        };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        crypto_service_1.CryptoService])
], UsersService);
//# sourceMappingURL=users.service.js.map