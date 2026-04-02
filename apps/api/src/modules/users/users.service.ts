import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private crypto: CryptoService,
  ) {}

  async create(data: { email: string; passwordHash: string; name?: string; phone?: string }) {
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

  async findByEmail(email: string) {
    const emailHash = this.crypto.hashForLookup(email);
    const byHash = await this.prisma.user.findUnique({
      where: { emailHash },
    });
    if (byHash) return byHash;
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
  }

  async updateProfile(userId: string, data: { name?: string; phone?: string; linkedToUserEmail?: string }) {
    const encryptedName = data.name !== undefined ? this.crypto.encryptOptional(data.name) : undefined;
    const encryptedPhone = data.phone !== undefined ? this.crypto.encryptOptional(data.phone) : undefined;
    let linkedToUserId: string | null | undefined = undefined;
    if (data.linkedToUserEmail !== undefined) {
      const email = data.linkedToUserEmail == null ? '' : String(data.linkedToUserEmail).trim();
      if (!email) {
        linkedToUserId = null;
      } else {
        const target = await this.findByEmail(email);
        if (!target) {
          throw new BadRequestException('Пользователь с таким email не найден.');
        }
        if (target.id === userId) {
          throw new BadRequestException('Нельзя привязать аккаунт к самому себе.');
        }
        if (target.linkedToUserId === userId) {
          throw new BadRequestException('Циклическая привязка запрещена.');
        }
        linkedToUserId = target.id;
      }
    }
    const updateData: Record<string, unknown> = {};
    if (encryptedName !== undefined) updateData.name = encryptedName;
    if (encryptedPhone !== undefined) updateData.phone = encryptedPhone;
    if (linkedToUserId !== undefined) updateData.linkedToUserId = linkedToUserId;
    if (Object.keys(updateData).length === 0) return this.findById(userId);

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: { id: true, email: true, name: true, phone: true, role: true, linkedToUserId: true, createdAt: true },
    });
    return this.decryptPii(user);
  }

  async findById(id: string) {
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
    if (!user) return null;
    const decrypted = this.decryptPii(user);
    const linkedToUserEmail = user.linkedToUser?.emailEncrypted
      ? this.crypto.decryptOptional(user.linkedToUser.emailEncrypted)
      : null;
    const { linkedToUser, ...out } = decrypted as typeof decrypted & { linkedToUser?: unknown };
    return { ...out, linkedToUserEmail };
  }

  // ---------------------------------------------------------------------------
  // Organization profile
  // ---------------------------------------------------------------------------

  async getOrganization(userId: string) {
    return this.prisma.organizationProfile.findUnique({ where: { userId } });
  }

  async upsertOrganization(userId: string, data: {
    entityType?: string; taxSystem?: string; vatRate?: string;
    inn?: string; kpp?: string; ogrn?: string; okpo?: string; okved?: string;
    fullName?: string; shortName?: string;
    legalAddress?: string; actualAddress?: string;
    bik?: string; bankName?: string; settlementAccount?: string; corrAccount?: string;
    orgPhone?: string; directorName?: string; chiefAccountant?: string;
  }) {
    return this.prisma.organizationProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: { ...data, updatedAt: new Date() },
    });
  }

  /** Для админа: список всех пользователей с агрегатами */
  async findAllForAdmin(opts?: { skip?: number; take?: number }) {
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

  /** Расшифровать PII для ответа клиенту (email, name, phone) */
  decryptUserPii<T extends { email?: string | null; emailEncrypted?: string | null; name?: string | null; phone?: string | null }>(row: T): T & { email?: string | null } {
    return this.decryptPii(row) as T & { email?: string | null };
  }

  private decryptPii<T extends { email?: string | null; emailEncrypted?: string | null; name?: string | null; phone?: string | null }>(row: T): T {
    const email = row.emailEncrypted
      ? this.crypto.decryptOptional(row.emailEncrypted)
      : row.email;
    return {
      ...row,
      email: email ?? row.email,
      name: this.crypto.decryptOptional((row as { name?: string | null }).name),
      phone: (row as { phone?: string | null }).phone
        ? this.crypto.decryptOptional((row as { phone?: string | null }).phone)
        : undefined,
    } as T;
  }
}
