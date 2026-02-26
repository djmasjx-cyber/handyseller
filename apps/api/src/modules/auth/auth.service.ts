import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { addMinutes, addDays } from 'date-fns';
import { randomBytes } from 'crypto';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { hashPassword, comparePassword } from '../../common/utils/hash.util';
import { RegisterDto } from './dto/register.dto';

const REFRESH_EXPIRES_DAYS = 7;
const ACCESS_EXPIRES_DEFAULT = '2h';
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
    await this.checkLoginBlocked(ip);

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      await this.recordFailedAttempt(ip, email);
      await this.auditLog(null, 'LOGIN', ip, userAgent, false, { email });
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

  async refresh(refreshToken: string, ip?: string, userAgent?: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) await this.prisma.refreshToken.delete({ where: { id: stored.id } }).catch(() => {});
      await this.auditLog(stored?.userId ?? null, 'REFRESH', ip, userAgent, false);
      return null;
    }

    await this.prisma.refreshToken.delete({ where: { id: stored.id } });
    const userDto = this.usersService.decryptUserPii(stored.user);
    const { accessToken, refreshToken: newRefresh } = await this.issueTokens(stored.userId, userDto.email!, stored.user.role);
    await this.auditLog(stored.userId, 'REFRESH', ip, userAgent, true);
    return { accessToken, refreshToken: newRefresh };
  }

  async logout(refreshToken: string | undefined, userId?: string, ip?: string, userAgent?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    await this.auditLog(userId ?? null, 'LOGOUT', ip, userAgent, true);
  }

  private async issueTokens(userId: string, email: string, role?: string) {
    const payload = { sub: userId, email, role: role ?? 'USER' };
    const expiresIn = this.config.get('JWT_EXPIRES_IN') ?? ACCESS_EXPIRES_DEFAULT;
    const accessToken = this.jwtService.sign(payload, { expiresIn });
    const token = randomBytes(32).toString('hex');
    const expiresAt = addDays(new Date(), REFRESH_EXPIRES_DAYS);

    await this.prisma.refreshToken.create({
      data: { userId, token, expiresAt },
    });

    const refreshToken = this.jwtService.sign(
      { sub: userId, jti: token },
      { expiresIn: `${REFRESH_EXPIRES_DAYS}d` },
    );

    return { accessToken, refreshToken: token };
  }

  async validateRefreshToken(token: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!stored || stored.expiresAt < new Date()) return null;
    return stored.user;
  }

  private async checkLoginBlocked(ip?: string) {
    if (!ip) return;
    const since = addMinutes(new Date(), -BLOCK_DURATION_MINUTES);
    const failed = await this.prisma.loginAttempt.count({
      where: { ip, success: false, createdAt: { gte: since } },
    });
    if (failed >= BLOCK_AFTER_FAILURES) {
      throw new Error('BLOCKED');
    }
  }

  private async recordFailedAttempt(ip?: string, email?: string) {
    if (!ip) return;
    const emailEncrypted = email ? this.crypto.encryptOptional(email.trim()) : null;
    await this.prisma.loginAttempt.create({
      data: { ip, emailEncrypted, success: false },
    });
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
