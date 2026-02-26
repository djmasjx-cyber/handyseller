"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const jwt_1 = require("@nestjs/jwt");
const config_1 = require("@nestjs/config");
const auth_service_1 = require("./auth.service");
const users_service_1 = require("../users/users.service");
const prisma_service_1 = require("../../common/database/prisma.service");
const crypto_service_1 = require("../../common/crypto/crypto.service");
jest.mock('../../common/utils/hash.util', () => ({
    hashPassword: jest.fn().mockResolvedValue('hashed'),
    comparePassword: jest.fn(),
}));
describe('AuthService', () => {
    let service;
    let usersService;
    let prisma;
    let jwtService;
    const mockUser = {
        id: 'user-1',
        email: 'test@example.com',
        passwordHash: 'hash',
        name: 'Test',
        role: 'USER',
    };
    beforeEach(async () => {
        const module = await testing_1.Test.createTestingModule({
            providers: [
                auth_service_1.AuthService,
                {
                    provide: users_service_1.UsersService,
                    useValue: {
                        create: jest.fn(),
                        findByEmail: jest.fn(),
                        decryptUserPii: jest.fn((u) => u),
                    },
                },
                {
                    provide: prisma_service_1.PrismaService,
                    useValue: {
                        refreshToken: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
                        loginAttempt: { count: jest.fn(), create: jest.fn() },
                        authAuditLog: { create: jest.fn() },
                    },
                },
                {
                    provide: jwt_1.JwtService,
                    useValue: { sign: jest.fn().mockReturnValue('jwt-token') },
                },
                {
                    provide: config_1.ConfigService,
                    useValue: { get: jest.fn().mockReturnValue('2h') },
                },
                {
                    provide: crypto_service_1.CryptoService,
                    useValue: {
                        hashForLookup: jest.fn((e) => 'hash-' + e),
                        encryptOptional: jest.fn((v) => (v ? `enc:${v}` : null)),
                        decryptOptional: jest.fn((v) => (v ? v.replace(/^enc:/, '') : null)),
                    },
                },
            ],
        }).compile();
        service = module.get(auth_service_1.AuthService);
        usersService = module.get(users_service_1.UsersService);
        prisma = module.get(prisma_service_1.PrismaService);
        jwtService = module.get(jwt_1.JwtService);
        jest.clearAllMocks();
    });
    it('should be defined', () => {
        expect(service).toBeDefined();
    });
    describe('register', () => {
        it('should register user and return tokens', async () => {
            jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);
            jest.spyOn(usersService, 'create').mockResolvedValue(mockUser);
            jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({});
            jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({});
            const result = await service.register({ email: 'test@example.com', password: 'password123' }, '127.0.0.1');
            expect(result.accessToken).toBeDefined();
            expect(result.refreshToken).toBeDefined();
            expect(result.user).toEqual({ id: mockUser.id, email: mockUser.email, name: mockUser.name });
            expect(usersService.create).toHaveBeenCalled();
        });
    });
    describe('login', () => {
        it('should return null for unknown email', async () => {
            jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);
            jest.spyOn(prisma.loginAttempt, 'create').mockResolvedValue({});
            jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({});
            const result = await service.login('unknown@x.com', 'pass', '1.2.3.4');
            expect(result).toBeNull();
        });
        it('should return null for wrong password', async () => {
            const { comparePassword } = require('../../common/utils/hash.util');
            comparePassword.mockResolvedValue(false);
            jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);
            jest.spyOn(prisma.loginAttempt, 'create').mockResolvedValue({});
            jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({});
            const result = await service.login('test@example.com', 'wrong', '1.2.3.4');
            expect(result).toBeNull();
        });
        it('should return tokens for correct credentials', async () => {
            const { comparePassword } = require('../../common/utils/hash.util');
            comparePassword.mockResolvedValue(true);
            jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser);
            jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({});
            jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({});
            const result = await service.login('test@example.com', 'correct', '1.2.3.4');
            expect(result).not.toBeNull();
            expect(result.accessToken).toBeDefined();
            expect(result.refreshToken).toBeDefined();
        });
    });
    describe('refresh', () => {
        it('should return null for invalid token', async () => {
            jest.spyOn(prisma.refreshToken, 'findUnique').mockResolvedValue(null);
            const result = await service.refresh('invalid');
            expect(result).toBeNull();
        });
    });
    describe('logout', () => {
        it('should not throw', async () => {
            jest.spyOn(prisma.refreshToken, 'deleteMany').mockResolvedValue({ count: 0 });
            jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({});
            await expect(service.logout('token', 'user-1')).resolves.not.toThrow();
        });
    });
});
//# sourceMappingURL=auth.service.spec.js.map