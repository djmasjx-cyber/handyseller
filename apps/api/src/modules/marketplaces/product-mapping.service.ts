import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { MarketplaceType } from '@prisma/client';

@Injectable()
export class ProductMappingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Найти Product по системному ID маркетплейса */
  async findProductByExternalId(
    userId: string,
    marketplace: MarketplaceType,
    externalSystemId: string,
  ) {
    const mapping = await this.prisma.productMarketplaceMapping.findFirst({
      where: { userId, marketplace, externalSystemId: String(externalSystemId), isActive: true },
      include: { product: true },
    });
    return mapping?.product ?? null;
  }

  /** Найти Product по externalSystemId, проверяя несколько userId (для linked-аккаунтов) */
  async findProductByExternalIdForUserIds(
    userIds: string[],
    marketplace: MarketplaceType,
    externalSystemId: string,
  ) {
    const mapping = await this.prisma.productMarketplaceMapping.findFirst({
      where: {
        userId: { in: userIds },
        marketplace,
        externalSystemId: String(externalSystemId),
        isActive: true,
      },
      include: { product: true },
    });
    return mapping?.product ?? null;
  }

  /** Найти Product по externalArticle (offer_id) в маппинге — для импорта с Ozon, когда product_id не совпадает */
  async findProductByExternalArticle(
    userIds: string[],
    marketplace: MarketplaceType,
    externalArticle: string,
  ) {
    const art = String(externalArticle ?? '').trim();
    if (!art) return null;
    const mapping = await this.prisma.productMarketplaceMapping.findFirst({
      where: {
        userId: { in: userIds },
        marketplace,
        externalArticle: art,
        isActive: true,
      },
      include: { product: true },
    });
    return mapping?.product ?? null;
  }

  /** Получить все маппинги товара для синхронизации остатков */
  async getMappingsForProduct(productId: string, userId: string) {
    return this.prisma.productMarketplaceMapping.findMany({
      where: { productId, userId, isActive: true, syncStock: true },
    });
  }

  /** Получить externalSystemId для маркета по productId */
  async getExternalId(productId: string, userId: string, marketplace: MarketplaceType): Promise<string | null> {
    const m = await this.prisma.productMarketplaceMapping.findFirst({
      where: { productId, userId, marketplace, isActive: true },
    });
    return m?.externalSystemId ?? null;
  }

  /** Получить маппинг Ozon (product_id + offer_id) для загрузки штрих-кода */
  async getOzonMapping(productId: string, userId: string): Promise<{ externalSystemId: string; externalArticle?: string | null } | null> {
    const m = await this.prisma.productMarketplaceMapping.findFirst({
      where: { productId, userId, marketplace: 'OZON', isActive: true },
    });
    return m ? { externalSystemId: m.externalSystemId, externalArticle: m.externalArticle } : null;
  }

  /** Получить маппинг Ozon по productId, проверяя несколько userId (для linkedToUserId).
   * preferredArticle: при нескольких маппингах предпочитаем тот, где externalArticle совпадает с артикулом. */
  async getOzonMappingForUserIds(
    productId: string,
    userIds: string[],
    preferredArticle?: string,
  ): Promise<{ externalSystemId: string; externalArticle?: string | null } | null> {
    const all = await this.prisma.productMarketplaceMapping.findMany({
      where: { productId, userId: { in: userIds }, marketplace: 'OZON', isActive: true },
    });
    if (all.length === 0) return null;
    if (all.length === 1) return { externalSystemId: all[0].externalSystemId, externalArticle: all[0].externalArticle };
    const art = (preferredArticle ?? '').toString().trim();
    if (art) {
      const match = all.find((m) => (m.externalArticle ?? '').trim() === art);
      if (match) return { externalSystemId: match.externalSystemId, externalArticle: match.externalArticle };
    }
    return { externalSystemId: all[0].externalSystemId, externalArticle: all[0].externalArticle };
  }

  /** Получить externalSystemId, проверяя несколько userId */
  async getExternalIdForUserIds(productId: string, userIds: string[], marketplace: MarketplaceType): Promise<string | null> {
    const m = await this.prisma.productMarketplaceMapping.findFirst({
      where: { productId, userId: { in: userIds }, marketplace, isActive: true },
    });
    return m?.externalSystemId ?? null;
  }

  /** Получить маппинг WB по productId (для обратной совместимости) */
  async getWbNmId(productId: string, userId: string): Promise<number | null> {
    const m = await this.prisma.productMarketplaceMapping.findFirst({
      where: { productId, userId, marketplace: 'WILDBERRIES' },
    });
    if (!m) return null;
    const n = parseInt(m.externalSystemId, 10);
    return isNaN(n) ? null : n;
  }

  /**
   * Обновить externalSystemId маппинга (например, когда product_id оказался неверным, а поиск по offer_id нашёл правильный).
   */
  async updateExternalId(
    productId: string,
    userId: string,
    marketplace: MarketplaceType,
    newExternalSystemId: string,
    options?: { externalArticle?: string },
  ): Promise<void> {
    const existing = await this.prisma.productMarketplaceMapping.findFirst({
      where: { productId, userId, marketplace, isActive: true },
    });
    if (!existing) return;
    await this.doUpdateExternalId(existing, newExternalSystemId, options);
  }

  /**
   * Обновить маппинг Ozon при смене артикула. Ищет маппинг по productId и userId in userIds (для linked-аккаунтов).
   */
  async updateOzonMappingForUserIds(
    productId: string,
    userIds: string[],
    newExternalSystemId: string,
    newExternalArticle: string,
  ): Promise<boolean> {
    const existing = await this.prisma.productMarketplaceMapping.findFirst({
      where: { productId, userId: { in: userIds }, marketplace: 'OZON', isActive: true },
    });
    if (!existing) return false;
    await this.doUpdateExternalId(existing, newExternalSystemId, { externalArticle: newExternalArticle });
    return true;
  }

  private async doUpdateExternalId(
    existing: { id: string; productId: string; userId: string; marketplace: string; externalSystemId: string; externalArticle?: string | null; externalGroupId?: string | null; syncStock: boolean; isActive: boolean },
    newExternalSystemId: string,
    options?: { externalArticle?: string },
  ): Promise<void> {
    const newExtId = String(newExternalSystemId);
    const newArt = options?.externalArticle ?? existing.externalArticle;
    if (existing.externalSystemId === newExtId && (existing.externalArticle ?? '') === (newArt ?? '')) return;
    await this.prisma.$transaction([
      this.prisma.productMarketplaceMapping.delete({ where: { id: existing.id } }),
      this.prisma.productMarketplaceMapping.create({
        data: {
          id: crypto.randomUUID(),
          productId: existing.productId,
          userId: existing.userId,
          marketplace: existing.marketplace as MarketplaceType,
          externalSystemId: String(newExternalSystemId),
          externalArticle: options?.externalArticle ?? existing.externalArticle,
          externalGroupId: existing.externalGroupId,
          syncStock: existing.syncStock,
          isActive: existing.isActive,
        },
      }),
    ]);
  }

  /**
   * Удалить маппинг по productId, marketplace и externalSystemId.
   * Для удаления лишних связок (например, дубликат Ozon skull01 при правильном Ang002).
   */
  async deleteMapping(
    productId: string,
    userIds: string[],
    marketplace: MarketplaceType,
    externalSystemId: string,
  ): Promise<boolean> {
    const deleted = await this.prisma.productMarketplaceMapping.deleteMany({
      where: {
        productId,
        userId: { in: userIds },
        marketplace,
        externalSystemId: String(externalSystemId),
      },
    });
    return (deleted.count ?? 0) > 0;
  }

  /** Создать/обновить маппинг при импорте */
  async upsertMapping(
    productId: string,
    userId: string,
    marketplace: MarketplaceType,
    externalSystemId: string,
    options?: { externalArticle?: string; externalGroupId?: string },
  ) {
    return this.prisma.productMarketplaceMapping.upsert({
      where: {
        userId_marketplace_externalSystemId: {
          userId,
          marketplace,
          externalSystemId: String(externalSystemId),
        },
      },
      create: {
        id: crypto.randomUUID(),
        productId,
        userId,
        marketplace,
        externalSystemId: String(externalSystemId),
        externalArticle: options?.externalArticle,
        externalGroupId: options?.externalGroupId,
      },
      update: {
        productId,
        externalArticle: options?.externalArticle ?? undefined,
        externalGroupId: options?.externalGroupId ?? undefined,
      },
    });
  }
}
