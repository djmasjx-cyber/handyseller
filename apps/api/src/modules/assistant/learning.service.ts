import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/database/prisma.service';
import { KnowledgeService } from './knowledge.service';

@Injectable()
export class LearningService {
  private readonly logger = new Logger(LearningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async processResolvedQuestions(): Promise<void> {
    this.logger.log('Running self-learning pipeline...');

    const resolved = await this.prisma.assistantUnanswered.findMany({
      where: { resolved: true, answer: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });

    if (resolved.length === 0) {
      this.logger.log('No resolved questions to process');
      return;
    }

    const grouped = this.groupSimilarQuestions(resolved);
    let articlesCreated = 0;

    for (const group of grouped) {
      if (group.length < 2) continue;

      const representative = group[0];
      const allAnswers = group
        .map((q) => q.answer)
        .filter((a): a is string => a !== null);

      if (allAnswers.length === 0) continue;

      const bestAnswer = allAnswers.reduce((a, b) =>
        a.length > b.length ? a : b,
      );

      const content = [
        `Часто задаваемый вопрос: ${representative.question}`,
        '',
        `Ответ: ${bestAnswer}`,
        '',
        `Похожие формулировки (${group.length}):`,
        ...group.map((q) => `- ${q.question}`),
      ].join('\n');

      await this.knowledgeService.upsertArticle({
        title: `FAQ: ${representative.question.slice(0, 100)}`,
        content,
        category: 'auto_faq',
      });
      articlesCreated++;
    }

    this.logger.log(
      `Self-learning complete: ${resolved.length} resolved, ${grouped.length} groups, ${articlesCreated} articles created`,
    );
  }

  private groupSimilarQuestions(
    items: Array<{ id: string; question: string; answer: string | null }>,
  ): Array<Array<{ id: string; question: string; answer: string | null }>> {
    const groups: Array<Array<typeof items[number]>> = [];
    const used = new Set<string>();

    for (const item of items) {
      if (used.has(item.id)) continue;

      const group = [item];
      used.add(item.id);

      const wordsA = this.extractKeywords(item.question);

      for (const other of items) {
        if (used.has(other.id)) continue;
        const wordsB = this.extractKeywords(other.question);
        if (this.jaccardSimilarity(wordsA, wordsB) > 0.4) {
          group.push(other);
          used.add(other.id);
        }
      }

      groups.push(group);
    }

    return groups;
  }

  private extractKeywords(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^а-яёa-z0-9\s]/gi, '')
        .split(/\s+/)
        .filter((w) => w.length > 2),
    );
  }

  private jaccardSimilarity(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let intersection = 0;
    for (const word of a) {
      if (b.has(word)) intersection++;
    }
    const union = a.size + b.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
