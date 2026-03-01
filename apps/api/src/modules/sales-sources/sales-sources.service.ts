import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

function normalizeSalesSource(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

@Injectable()
export class SalesSourcesService {
  constructor(private prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.salesSource.findMany({
      where: { userId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, createdAt: true },
    });
  }

  /** Upsert по имени: если есть — вернуть, иначе создать. Нормализация: "авито" → "Авито". */
  async upsert(userId: string, name: string) {
    const normalized = normalizeSalesSource(name);
    if (!normalized) {
      throw new BadRequestException('Название источника не может быть пустым.');
    }
    const existing = await this.prisma.salesSource.findUnique({
      where: { userId_name: { userId, name: normalized } },
    });
    if (existing) return existing;
    return this.prisma.salesSource.create({
      data: { userId, name: normalized },
      select: { id: true, name: true, createdAt: true },
    });
  }
}
