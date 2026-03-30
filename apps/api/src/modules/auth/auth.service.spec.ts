import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { addDays } from 'date-fns';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { EmailService } from '../email/email.service';

jest.mock('../../common/utils/hash.util', () => ({
  hashPassword: jest.fn().mockResolvedValue('hashed'),
  comparePassword: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let emailService: EmailService;

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
            refreshToken: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              updateMany: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
            },
            loginAttempt: { count: jest.fn(), create: jest.fn() },
            authAuditLog: { create: jest.fn() },
            passwordResetToken: {
              updateMany: jest.fn(),
              create: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            user: { update: jest.fn() },
            $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
          },
        },
        {
          provide: EmailService,
          useValue: { sendPasswordResetLink: jest.fn().mockResolvedValue(undefined) },
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
    emailService = module.get<EmailService>(EmailService);
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

    it('should return null when refresh token is missing', async () => {
      const result = await service.refresh(undefined);
      expect(result).toBeNull();
    });

    it('should revoke token family on reuse of rotated refresh token', async () => {
      const revokedStored = {
        id: 'rt-1',
        userId: mockUser.id,
        tokenHash: 'x',
        familyId: 'family-z',
        expiresAt: addDays(new Date(), 1),
        revokedAt: new Date(),
        replacedByTokenHash: 'new-hash',
        user: mockUser,
      };
      jest.spyOn(prisma.refreshToken, 'findUnique').mockResolvedValue(revokedStored as any);
      jest.spyOn(prisma.refreshToken, 'updateMany').mockResolvedValue({ count: 2 } as any);
      jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({} as any);

      const result = await service.refresh('stolen-old-refresh');

      expect(result).toBeNull();
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'family-z', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.authAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'REFRESH_REUSE', success: false }),
        }),
      );
    });
  });

  describe('requestPasswordReset', () => {
    it('should return without error when user is unknown (anti-enumeration)', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(null);
      jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({} as any);

      await service.requestPasswordReset('noone@example.com', '1.1.1.1');

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('should create reset token and send email when user exists', async () => {
      jest.spyOn(usersService, 'findByEmail').mockResolvedValue(mockUser as any);
      jest.spyOn(prisma.passwordResetToken, 'updateMany').mockResolvedValue({ count: 0 } as any);
      jest.spyOn(prisma.passwordResetToken, 'create').mockResolvedValue({} as any);
      jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({} as any);

      await service.requestPasswordReset('test@example.com', '1.1.1.1');

      expect(prisma.passwordResetToken.create).toHaveBeenCalled();
      expect(emailService.sendPasswordResetLink).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should throw when token is invalid', async () => {
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue(null);

      await expect(service.resetPassword('bad', 'newPass123')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should update password and revoke refresh tokens on valid token', async () => {
      const resetRow = {
        id: 'pr-1',
        userId: mockUser.id,
        tokenHash: 'h',
        expiresAt: addDays(new Date(), 1),
        usedAt: null,
        user: mockUser,
      };
      jest.spyOn(prisma.passwordResetToken, 'findUnique').mockResolvedValue(resetRow as any);
      jest.spyOn(prisma.authAuditLog, 'create').mockResolvedValue({} as any);

      await service.resetPassword('raw-token', 'newSecurePass123');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.authAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'RESET_PASSWORD', success: true }),
        }),
      );
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
