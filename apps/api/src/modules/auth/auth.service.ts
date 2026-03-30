import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { addMinutes, addDays } from 'date-fns';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { hashPassword, comparePassword } from '../../common/utils/hash.util';
import { RegisterDto } from './dto/register.dto';
import { EmailService } from '../email/email.service';

const REFRESH_EXPIRES_DAYS = 7;
const ACCESS_EXPIRES_DEFAULT = '2h';
const PASSWORD_RESET_EXPIRES_MINUTES = 30;
const BLOCK_AFTER_FAILURES = 5;
const BLOCK_DURATION_MINUTES = 15;
@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private crypto: CryptoService,
    private emailService: EmailService,
  ) {}

  /** Регистрация без подтверждения email (пока почтовый сервис не настроен) */
  async register(dto: RegisterDto, ip?: string, userAgent?: string) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Пользователь с таким email уже зарегистрирован');
    }
    const passwordHash = await hashPassword(dto.password);
    const user = await this.usersService.create({
      ...dto,
      passwordHash,
    });
    const email = user.email ?? '';
    const { accessToken, refreshToken } = await this.issueTokens(user.id, email, 'USER');
    await this.auditLog(user.id, 'REGISTER', ip, userAgent, true);
    return { accessToken, refreshToken, user: { id: user.id, email, name: user.name } };
  }

  /** [Не используется] Шаг 2: проверка кода и завершение регистрации — включить после настройки SMTP */
  async registerVerify(email: string, code: string, ip?: string, userAgent?: string) {
    const emailHash = this.crypto.hashForLookup(email);
    const verification = await this.prisma.emailVerification.findUnique({
      where: { emailHash },
    });

    if (!verification || verification.code !== code) {
      throw new BadRequestException('Неверный или истёкший код подтверждения');
    }
    if (verification.expiresAt < new Date()) {
      await this.prisma.emailVerification.delete({ where: { id: verification.id } });
      throw new BadRequestException('Код истёк. Запросите новый код.');
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

  async login(email: string, password: string, ip?: string, userAgent?: string) {
    await this.checkLoginBlocked(ip, email);

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      await this.recordFailedAttempt(ip, email);
      await this.auditLog(null, 'LOGIN', ip, userAgent, false);
      return null;
    }

    const ok = await comparePassword(password, user.passwordHash);
    if (!ok) {
      await this.recordFailedAttempt(ip, email);
      await this.auditLog(user.id, 'LOGIN', ip, userAgent, false);
      return null;
    }

    const userDto = this.usersService.decryptUserPii(user);
    const { accessToken, refreshToken } = await this.issueTokens(user.id, userDto.email!, user.role);
    await this.auditLog(user.id, 'LOGIN', ip, userAgent, true);
    return {
      accessToken,
      refreshToken,
      user: { id: userDto.id, email: userDto.email, name: userDto.name, role: userDto.role },
    };
  }

  async refresh(refreshToken: string | undefined, ip?: string, userAgent?: string) {
    if (!refreshToken) {
      await this.auditLog(null, 'REFRESH', ip, userAgent, false);
      return null;
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored) {
      await this.auditLog(null, 'REFRESH', ip, userAgent, false);
      return null;
    }

    const now = new Date();
    if (stored.expiresAt < now) {
      if (!stored.revokedAt) {
        await this.prisma.refreshToken
          .update({
            where: { id: stored.id },
            data: { revokedAt: now },
          })
          .catch(() => {});
      }
      await this.auditLog(stored.userId, 'REFRESH', ip, userAgent, false);
      return null;
    }

    if (stored.revokedAt) {
      await this.revokeRefreshTokenFamily(stored.familyId);
      await this.auditLog(stored.userId, 'REFRESH_REUSE', ip, userAgent, false, {
        familyId: stored.familyId,
      });
      return null;
    }

    const { accessToken, refreshToken: newRefresh, refreshTokenHash } = await this.issueTokens(
      stored.userId,
      this.usersService.decryptUserPii(stored.user).email!,
      stored.user.role,
      stored.familyId,
    );

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        replacedByTokenHash: refreshTokenHash,
      },
    });
    const userDto = this.usersService.decryptUserPii(stored.user);
    await this.auditLog(stored.userId, 'REFRESH', ip, userAgent, true);
    return { accessToken, refreshToken: newRefresh };
  }

  async logout(refreshToken: string | undefined, userId?: string, ip?: string, userAgent?: string) {
    if (refreshToken) await this.revokeRefreshToken(refreshToken);
    if (userId) await this.prisma.refreshToken.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
    await this.auditLog(userId ?? null, 'LOGOUT', ip, userAgent, true);
  }

  async requestPasswordReset(email: string, ip?: string, userAgent?: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      await this.auditLog(null, 'FORGOT_PASSWORD', ip, userAgent, true);
      return;
    }

    const emailValue = this.usersService.decryptUserPii(user).email;
    if (!emailValue) {
      await this.auditLog(user.id, 'FORGOT_PASSWORD', ip, userAgent, false);
      return;
    }

    const rawToken = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = addMinutes(new Date(), PASSWORD_RESET_EXPIRES_MINUTES);

    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const baseUrl = this.config.get<string>('WEB_APP_URL') ?? this.config.get<string>('APP_URL') ?? 'https://app.handyseller.ru';
    const resetUrl = `${baseUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await this.emailService.sendPasswordResetLink(emailValue, resetUrl);

    await this.auditLog(user.id, 'FORGOT_PASSWORD', ip, userAgent, true);
  }

  async resetPassword(token: string, newPassword: string, ip?: string, userAgent?: string) {
    const tokenHash = this.hashToken(token);
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      await this.auditLog(resetToken?.userId ?? null, 'RESET_PASSWORD', ip, userAgent, false);
      throw new BadRequestException('Ссылка недействительна или истекла.');
    }

    const passwordHash = await hashPassword(newPassword);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: resetToken.userId, usedAt: null, id: { not: resetToken.id } },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.auditLog(resetToken.userId, 'RESET_PASSWORD', ip, userAgent, true);
  }

  private async issueTokens(userId: string, email: string, role?: string, familyId?: string) {
    const payload = { sub: userId, email, role: role ?? 'USER' };
    const expiresIn = this.config.get('JWT_EXPIRES_IN') ?? ACCESS_EXPIRES_DEFAULT;
    const accessToken = this.jwtService.sign(payload, { expiresIn });
    const refreshToken = randomBytes(48).toString('hex');
    const refreshTokenHash = this.hashToken(refreshToken);
    const expiresAt = addDays(new Date(), REFRESH_EXPIRES_DAYS);
    const tokenFamily = familyId ?? randomBytes(16).toString('hex');

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: refreshTokenHash, familyId: tokenFamily, expiresAt },
    });

    return { accessToken, refreshToken, refreshTokenHash };
  }

  async validateRefreshToken(token: string) {
    const tokenHash = this.hashToken(token);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!stored || stored.expiresAt < new Date() || stored.revokedAt) return null;
    return stored.user;
  }

  private async checkLoginBlocked(ip?: string, email?: string) {
    const since = addMinutes(new Date(), -BLOCK_DURATION_MINUTES);
    const emailHash = email ? this.crypto.hashForLookup(email) : undefined;
    const [byIp, byEmail] = await Promise.all([
      ip
        ? this.prisma.loginAttempt.count({
            where: { ip, success: false, createdAt: { gte: since } },
          })
        : Promise.resolve(0),
      emailHash
        ? this.prisma.loginAttempt.count({
            where: { emailHash, success: false, createdAt: { gte: since } },
          })
        : Promise.resolve(0),
    ]);
    if (Math.max(byIp, byEmail) >= BLOCK_AFTER_FAILURES) {
      throw new Error('BLOCKED');
    }
  }

  private async recordFailedAttempt(ip?: string, email?: string) {
    if (!ip && !email) return;
    const emailEncrypted = email ? this.crypto.encryptOptional(email.trim()) : null;
    const emailHash = email ? this.crypto.hashForLookup(email) : null;
    await this.prisma.loginAttempt.create({
      data: { ip: ip ?? 'unknown', emailHash, emailEncrypted, success: false },
    });
  }

  private async revokeRefreshToken(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt) return;
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
  }

  /** При reuse уже отозванного refresh (OAuth BCP): отзываем все активные токены семейства. */
  private async revokeRefreshTokenFamily(familyId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async auditLog(
    userId: string | null,
    action: string,
    ip?: string,
    userAgent?: string,
    success?: boolean,
    metadata?: Record<string, unknown>,
  ) {
    await this.prisma.authAuditLog.create({
      data: {
        userId,
        action,
        ip,
        userAgent,
        success: success ?? false,
        metadata: JSON.parse(JSON.stringify(metadata ?? {})) as Prisma.InputJsonValue,
      },
    });
  }
}
