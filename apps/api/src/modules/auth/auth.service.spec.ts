import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';

jest.mock('../../common/utils/hash.util', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
  comparePassword: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    passwordHash: 'hash',
    name: 'Test',
    role: 'USER' as const,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: {
            create: jest.fn(),
            findByEmail: jest.fn(),
            decryptUserPii: jest.fn((u: any) => u),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            refreshToken: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
            loginAttempt: { count: jest.fn(), create: jest.fn() },
            authAuditLog: { create: jest.fn() },
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('jwt-token') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('2h') },
        },
        {
          provide: CryptoService,
          useValue: {
            hashForLookup: jest.fn((e: string) => 'hash-' + e),
            encryptOptional: jest.fn((v: string) => (v ? `enc:${v}` : null)),
            decryptOptional: jest.fn((v: string | null) => (v ? v.replace(/^enc:/, '') : null)),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should register user and return tokens', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(usersService, 'create').mockResolvedValue(mockUser as any);
      jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({} as any);
      jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({} as any);

      const result = await service.register(
        { email: 'test@example.com', password: 'password123' },
        '127.0.0.1',
      );

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toEqual({ id: mockUser.id, email: mockUser.email, name: mockUser.name });
      expect(usersService.create).toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('should return null for unknown email', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(prisma.loginAttempt, 'create').mockResolvedValue({} as any);
      jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({} as any);

      const result = await service.login('unknown@x.com', 'pass', '1.2.3.4');

      expect(result).toBeNull();
    });

    it('should return null for wrong password', async () => {
      const { comparePassword } = require('../../common/utils/hash.util');
      (comparePassword as jest.Mock).mockResolvedValue(false);
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser as any);
      jest.spyOn(prisma.loginAttempt, 'create').mockResolvedValue({} as any);
      jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({} as any);

      const result = await service.login('test@example.com', 'wrong', '1.2.3.4');

      expect(result).toBeNull();
    });

    it('should return tokens for correct credentials', async () => {
      const { comparePassword } = require('../../common/utils/hash.util');
      (comparePassword as jest.Mock).mockResolvedValue(true);
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser as any);
      jest.spyOn(prisma.refreshToken, 'create').mockResolvedValue({} as any);
      jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({} as any);

      const result = await service.login('test@example.com', 'correct', '1.2.3.4');

      expect(result).not.toBeNull();
      expect(result!.accessToken).toBeDefined();
      expect(result!.refreshToken).toBeDefined();
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
      jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({} as any);

      await expect(service.logout('token', 'user-1')).resolves.not.toThrow();
    });
  });
});
