import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertArticle(params: {
    sourceUrl?: string;
    title: string;
    content: string;
    category?: string;
  }): Promise<void> {
    const hash = createHash('sha256').update(params.content).digest('hex');

    const existing = await this.prisma.assistantKnowledge.findUnique({ where: { hash } });
    if (existing) {
      this.logger.debug(`Knowledge article already exists: "${params.title}"`);
      return;
    }

    await this.prisma.assistantKnowledge.create({
      data: {
        sourceUrl: params.sourceUrl ?? null,
        title: params.title,
        content: params.content,
        category: params.category ?? null,
        hash,
      },
    });
    this.logger.log(`Knowledge article saved: "${params.title}"`);
  }

  async searchRelevant(query: string, limit = 5): Promise<Array<{ title: string; content: string }>> {
    const words = query
      .toLowerCase()
      .replace(/[^а-яёa-z0-9\s]/gi, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (words.length === 0) {
      return this.prisma.assistantKnowledge.findMany({
        where: { isActive: true },
        select: { title: true, content: true },
        take: limit,
        orderBy: { updatedAt: 'desc' },
      });
    }

    const orConditions = words.flatMap((word) => [
      { title: { contains: word, mode: 'insensitive' as const } },
      { content: { contains: word, mode: 'insensitive' as const } },
    ]);

    return this.prisma.assistantKnowledge.findMany({
      where: {
        isActive: true,
        OR: orConditions,
      },
      select: { title: true, content: true },
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getAll(): Promise<Array<{ id: string; title: string; category: string | null; createdAt: Date }>> {
    return this.prisma.assistantKnowledge.findMany({
      where: { isActive: true },
      select: { id: true, title: true, category: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getStats(): Promise<{ total: number; categories: Record<string, number> }> {
    const all = await this.prisma.assistantKnowledge.findMany({
      where: { isActive: true },
      select: { category: true },
    });
    const categories: Record<string, number> = {};
    for (const a of all) {
      const cat = a.category || 'uncategorized';
      categories[cat] = (categories[cat] || 0) + 1;
    }
    return { total: all.length, categories };
  }
}
