import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async createPending(userId: string, dto: CreateReviewDto) {
    const text = dto.text?.trim();
    if (!text) throw new BadRequestException('Введите текст отзыва');

    const existing = await this.prisma.review.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const review = existing
      ? await this.prisma.review.update({
          where: { id: existing.id },
          data: {
            text,
            rating: dto.rating ?? existing.rating ?? 5,
            status: ReviewStatus.PENDING,
            adminNote: null,
            moderatedBy: null,
            moderatedAt: null,
            publishedAt: null,
          },
        })
      : await this.prisma.review.create({
          data: {
            userId,
            text,
            rating: dto.rating ?? 5,
            status: ReviewStatus.PENDING,
          },
        });

    return {
      id: review.id,
      status: review.status,
      createdAt: review.createdAt,
    };
  }

  async getPublished(limit = 6) {
    const safeLimit = Math.min(Math.max(limit, 1), 30);
    const rows = await this.prisma.review.findMany({
      where: { status: ReviewStatus.PUBLISHED },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      take: safeLimit,
      select: {
        id: true,
        text: true,
        rating: true,
        createdAt: true,
        publishedAt: true,
        user: { select: { name: true, email: true, emailEncrypted: true } },
      },
    });

    return rows.map((row) => {
      const user = this.usersService.decryptUserPii(row.user);
      const fallback = user.email ? user.email.split('@')[0] : 'Пользователь';
      return {
        id: row.id,
        text: row.text,
        rating: row.rating,
        createdAt: row.createdAt,
        publishedAt: row.publishedAt,
        authorName: user.name?.trim() || fallback,
      };
    });
  }

  async listForAdmin(status?: ReviewStatus) {
    const where = status ? { status } : {};
    const rows = await this.prisma.review.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        text: true,
        rating: true,
        status: true,
        adminNote: true,
        moderatedAt: true,
        publishedAt: true,
        createdAt: true,
        userId: true,
        user: { select: { email: true, emailEncrypted: true, name: true } },
      },
      take: 300,
    });

    return rows.map((row) => {
      const user = this.usersService.decryptUserPii(row.user);
      return {
        ...row,
        userEmail: user.email ?? '—',
        userName: user.name ?? null,
      };
    });
  }

  async publish(reviewId: string, adminUserId: string) {
    const exists = await this.prisma.review.findUnique({ where: { id: reviewId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Отзыв не найден');

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status: ReviewStatus.PUBLISHED,
        moderatedBy: adminUserId,
        moderatedAt: new Date(),
        publishedAt: new Date(),
        adminNote: null,
      },
      select: { id: true, status: true, publishedAt: true },
    });
  }

  async reject(reviewId: string, adminUserId: string, note?: string) {
    const exists = await this.prisma.review.findUnique({ where: { id: reviewId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Отзыв не найден');

    return this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status: ReviewStatus.REJECTED,
        moderatedBy: adminUserId,
        moderatedAt: new Date(),
        adminNote: note?.trim() || null,
      },
      select: { id: true, status: true, moderatedAt: true },
    });
  }
}
