import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';

/** Поля комиссий из ответа Ozon POST /v5/product/info/prices. */
interface OzonV5Commissions {
  sales_percent_fbo?: number;
  sales_percent_fbs?: number;
  fbo_deliv_to_customer_amount?: number;
  fbo_direct_flow_trans_min_amount?: number;
  fbo_direct_flow_trans_max_amount?: number;
  fbo_return_flow_amount?: number;
  fbo_return_flow_trans_min_amount?: number;
  fbo_return_flow_trans_max_amount?: number;
  fbo_fulfillment_amount?: number;
  fbs_deliv_to_customer_amount?: number;
  fbs_first_mile_min_amount?: number;
  fbs_first_mile_max_amount?: number;
  fbs_return_flow_amount?: number;
  fbs_return_flow_trans_min_amount?: number;
  fbs_return_flow_trans_max_amount?: number;
  fbs_direct_flow_trans_min_amount?: number;
  fbs_direct_flow_trans_max_amount?: number;
}

interface OzonV5Item {
  offer_id: string;
  product_id: number;
  price?: { price?: string };
  commissions?: OzonV5Commissions;
}

/** Тарифы WB для логистики коробок — кешируются в рамках одной синхронизации. */
interface WbBoxTariff {
  warehouseName: string;
  boxDeliveryBase: number;
  boxDeliveryLiter: number;
  boxStorageBase: number;
  boxStorageLiter: number;
}

/** Комиссии по категориям WB. */
interface WbCategoryCommission {
  subjectID: number;
  kgvpMarketplace: number; // FBO %
  kgvpSupplier: number;    // FBS %
}

@Injectable()
export class CommissionSyncService {
  private readonly logger = new Logger(CommissionSyncService.name);
  private readonly WB_TARIFF_API = 'https://discounts-prices-api.wildberries.ru';

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly httpService: HttpService,
  ) {}

  /** Синхронизировать комиссии для всех подключённых маркетплейсов пользователя. */
  async syncForUser(userId: string): Promise<{ ozon: number; wb: number }> {
    const [ozonCount, wbCount] = await Promise.all([
      this.syncOzonCommissions(userId).catch((e) => {
        this.logger.warn(`[syncForUser] Ozon error for ${userId}: ${e instanceof Error ? e.message : String(e)}`);
        return 0;
      }),
      this.syncWbCommissions(userId).catch((e) => {
        this.logger.warn(`[syncForUser] WB error for ${userId}: ${e instanceof Error ? e.message : String(e)}`);
        return 0;
      }),
    ]);
    return { ozon: ozonCount, wb: wbCount };
  }

  // ---------------------------------------------------------------------------
  // OZON
  // ---------------------------------------------------------------------------

  /**
   * Получает комиссии из Ozon POST /v5/product/info/prices (актуальный эндпоинт) с пагинацией
   * через last_id. Для каждого товара с маппингом делает upsert в product_marketplace_commission.
   *
   * Маппинг полей v5 → DB:
   *  FBO: salesCommissionAmt = price × sales_percent_fbo
   *       logisticsAmt       = fbo_deliv_to_customer_amount   (последняя миля)
   *       firstMileAmt       = fbo_direct_flow_trans_min_amount (магистраль/транзит)
   *       acceptanceAmt      = fbo_fulfillment_amount         (фулфилмент/обработка на складе)
   *       returnAmt          = fbo_return_flow_amount + fbo_return_flow_trans_min_amount
   *  FBS: salesCommissionAmt = price × sales_percent_fbs
   *       logisticsAmt       = fbs_deliv_to_customer_amount
   *       firstMileAmt       = fbs_first_mile_min_amount
   *       acceptanceAmt      = 0  (нет размещения на складе Ozon)
   *       returnAmt          = fbs_return_flow_amount + fbs_return_flow_trans_min_amount
   */
  async syncOzonCommissions(userId: string): Promise<number> {
    const conn = await this.prisma.marketplaceConnection.findFirst({
      where: { userId, marketplace: 'OZON' },
    });
    if (!conn?.token) return 0;

    let apiKey: string;
    try {
      apiKey = this.crypto.decrypt(conn.token);
    } catch {
      this.logger.warn(`[syncOzonCommissions] Не удалось расшифровать токен Ozon для ${userId}`);
      return 0;
    }
    const clientId = conn.sellerId ?? '';

    // Строим индекс локальных маппингов по offer_id и product_id для O(1) поиска
    const mappings = await this.prisma.productMarketplaceMapping.findMany({
      where: { userId, marketplace: 'OZON', isActive: true },
      include: { product: { select: { id: true, price: true } } },
    });
    if (mappings.length === 0) return 0;

    const byOfferId = new Map<string, (typeof mappings)[0]>();
    const byProductId = new Map<string, (typeof mappings)[0]>();
    for (const m of mappings) {
      if (m.externalArticle) byOfferId.set(m.externalArticle, m);
      if (m.externalSystemId) byProductId.set(String(m.externalSystemId), m);
    }

    const LIMIT = 1000;
    let lastId = '';
    let synced = 0;

    // Пагинируем через last_id пока возвращаются товары
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let items: OzonV5Item[] = [];
      try {
        const { data } = await firstValueFrom(
          this.httpService.post<{ items?: OzonV5Item[]; last_id?: string; total?: number }>(
            'https://api-seller.ozon.ru/v5/product/info/prices',
            {
              filter: { visibility: 'ALL' },
              limit: LIMIT,
              ...(lastId ? { last_id: lastId } : {}),
            },
            {
              headers: {
                'Client-Id': clientId,
                'Api-Key': apiKey,
                'Content-Type': 'application/json',
              },
              timeout: 30000,
            },
          ),
        );
        items = data?.items ?? [];
        lastId = data?.last_id ?? '';
      } catch (e) {
        this.logger.warn(
          `[syncOzonCommissions] HTTP error for ${userId}: ${e instanceof Error ? e.message : String(e)}`,
        );
        break;
      }

      for (const item of items) {
        const c = item.commissions;
        if (!c) continue;

        const mapping =
          (item.offer_id ? byOfferId.get(item.offer_id) : undefined) ??
          (item.product_id ? byProductId.get(String(item.product_id)) : undefined);
        if (!mapping) continue;

        // Цена из маппинга (лок.), либо из ответа v5
        const productPrice =
          Number(mapping.product?.price ?? 0) ||
          Number(item.price?.price ?? 0);

        const fboSalesPct = Number(c.sales_percent_fbo ?? 0);
        const fbsSalesPct = Number(c.sales_percent_fbs ?? 0);

        const fboSalesAmt = productPrice > 0 ? Math.round((productPrice * fboSalesPct) / 100 * 100) / 100 : 0;
        const fbsSalesAmt = productPrice > 0 ? Math.round((productPrice * fbsSalesPct) / 100 * 100) / 100 : 0;

        const fboLogistics    = Number(c.fbo_deliv_to_customer_amount       ?? 0);
        const fboFirstMile    = Number(c.fbo_direct_flow_trans_min_amount   ?? 0);
        const fboFulfillment  = Number(c.fbo_fulfillment_amount             ?? 0);
        const fboReturn       = round2(
          Number(c.fbo_return_flow_amount               ?? 0) +
          Number(c.fbo_return_flow_trans_min_amount     ?? 0),
        );

        const fbsLogistics    = Number(c.fbs_deliv_to_customer_amount       ?? 0);
        const fbsFirstMile    = Number(c.fbs_first_mile_min_amount          ?? 0);
        const fbsReturn       = round2(
          Number(c.fbs_return_flow_amount               ?? 0) +
          Number(c.fbs_return_flow_trans_min_amount     ?? 0),
        );

        const upsertData = [
          {
            scheme: 'FBO',
            salesCommissionPct: fboSalesPct,
            salesCommissionAmt: fboSalesAmt,
            logisticsAmt:       fboLogistics,
            firstMileAmt:       fboFirstMile,
            acceptanceAmt:      fboFulfillment,
            returnAmt:          fboReturn,
            totalFeeAmt: round2(fboSalesAmt + fboLogistics + fboFirstMile + fboFulfillment + fboReturn),
            rawData: c as unknown as Prisma.InputJsonValue,
          },
          {
            scheme: 'FBS',
            salesCommissionPct: fbsSalesPct,
            salesCommissionAmt: fbsSalesAmt,
            logisticsAmt:       fbsLogistics,
            firstMileAmt:       fbsFirstMile,
            acceptanceAmt:      0,
            returnAmt:          fbsReturn,
            totalFeeAmt: round2(fbsSalesAmt + fbsLogistics + fbsFirstMile + fbsReturn),
            rawData: c as unknown as Prisma.InputJsonValue,
          },
        ];

        for (const d of upsertData) {
          await this.prisma.productMarketplaceCommission.upsert({
            where: {
              productId_marketplace_scheme: {
                productId: mapping.productId,
                marketplace: 'OZON',
                scheme: d.scheme,
              },
            },
            create: {
              productId: mapping.productId,
              marketplace: 'OZON',
              scheme: d.scheme,
              salesCommissionPct: d.salesCommissionPct,
              salesCommissionAmt: d.salesCommissionAmt,
                logisticsAmt: d.logisticsAmt,
                firstMileAmt: d.firstMileAmt,
                returnAmt: d.returnAmt,
                acceptanceAmt: d.acceptanceAmt,
                totalFeeAmt: d.totalFeeAmt,
                syncedAt: new Date(),
                rawData: d.rawData,
              },
              update: {
                salesCommissionPct: d.salesCommissionPct,
                salesCommissionAmt: d.salesCommissionAmt,
                logisticsAmt: d.logisticsAmt,
                firstMileAmt: d.firstMileAmt,
                returnAmt: d.returnAmt,
                acceptanceAmt: d.acceptanceAmt,
                totalFeeAmt: d.totalFeeAmt,
                syncedAt: new Date(),
                rawData: d.rawData,
              },
            });
            synced++;
          }
        }

      // Если страница неполная — это последняя страница
      if (items.length < LIMIT || !lastId) break;
    } // end while

    this.logger.log(`[syncOzonCommissions] userId=${userId} synced=${synced}`);
    return synced;
  }

  // ---------------------------------------------------------------------------
  // WILDBERRIES
  // ---------------------------------------------------------------------------

  /**
   * Синхронизирует тарифы WB для всех товаров пользователя.
   * - Глобальные тарифы (комиссия по категории, логистика по коробкам, возвраты) запрашиваются один раз.
   * - Стоимость логистики рассчитывается из габаритов товара.
   */
  async syncWbCommissions(userId: string): Promise<number> {
    const conn = await this.prisma.marketplaceConnection.findFirst({
      where: { userId, marketplace: 'WILDBERRIES' },
    });
    if (!conn?.token) return 0;

    let apiKey: string;
    try {
      apiKey = this.crypto.decrypt(conn.token);
    } catch {
      this.logger.warn(`[syncWbCommissions] Не удалось расшифровать токен WB для ${userId}`);
      return 0;
    }
    const authHeader = { Authorization: `Bearer ${apiKey}` };
    const today = new Date().toISOString().split('T')[0];

    // 1. Получаем тарифы комиссий по категориям
    const categoryCommissions = await this.fetchWbCategoryCommissions(authHeader);

    // 2. Получаем тарифы логистики коробок (берём первый склад как базовый)
    const boxTariff = await this.fetchWbBoxTariff(authHeader, today);

    // 3. Получаем тарифы возвратов (базовый тариф)
    const returnCostBase = await this.fetchWbReturnTariff(authHeader, today);

    // 4. Получаем коэффициент приёмки (FBO) — среднее по доступным складам
    const acceptanceCoef = await this.fetchWbAcceptanceCoef(authHeader);

    // 5. Товары пользователя с маппингом на WB
    const mappings = await this.prisma.productMarketplaceMapping.findMany({
      where: { userId, marketplace: 'WILDBERRIES', isActive: true },
      include: {
        product: {
          select: {
            id: true,
            price: true,
            weight: true,
            width: true,
            height: true,
            length: true,
            wbSubjectId: true,
          },
        },
      },
    });
    if (mappings.length === 0) return 0;

    let synced = 0;

    for (const mapping of mappings) {
      const p = mapping.product;
      const productPrice = Number(p.price ?? 0);
      const wbSubjectId = p.wbSubjectId ?? null;

      // Поиск комиссии по subjectId
      const catCommission = wbSubjectId
        ? categoryCommissions.find((c) => c.subjectID === wbSubjectId)
        : null;

      const fboCommissionPct = catCommission?.kgvpMarketplace ?? 15; // 15% — дефолт если нет данных
      const fbsCommissionPct = catCommission?.kgvpSupplier ?? 12;

      // Объём товара в литрах (WB минимум 1 л)
      const w = p.width ?? 0;
      const h = p.height ?? 0;
      const l = p.length ?? 0;
      const volumeLiters = w > 0 && h > 0 && l > 0
        ? Math.max((w * h * l) / 1_000_000, 1)
        : 1;

      // Стоимость доставки из тарифа коробок
      const deliveryCost = boxTariff
        ? Math.round((boxTariff.boxDeliveryBase + boxTariff.boxDeliveryLiter * Math.max(volumeLiters - 1, 0)) * 100) / 100
        : 0;

      // Стоимость хранения в день (примерно за 30 дней)
      const storageCostPerDay = boxTariff
        ? Math.round((boxTariff.boxStorageBase + boxTariff.boxStorageLiter * Math.max(volumeLiters - 1, 0)) * 100) / 100
        : 0;

      // Приёмка FBO — коэффициент * базовая стоимость за литр (примерно 50₽/л × коэф)
      const acceptanceAmt = Math.round(volumeLiters * 50 * acceptanceCoef * 100) / 100;

      const fboSalesAmt = productPrice > 0 ? Math.round((productPrice * fboCommissionPct) / 100 * 100) / 100 : 0;
      const fbsSalesAmt = productPrice > 0 ? Math.round((productPrice * fbsCommissionPct) / 100 * 100) / 100 : 0;

      const schemes = [
        {
          scheme: 'FBO',
          salesCommissionPct: fboCommissionPct,
          salesCommissionAmt: fboSalesAmt,
          logisticsAmt: deliveryCost,
          firstMileAmt: 0,
          returnAmt: returnCostBase,
          acceptanceAmt,
          totalFeeAmt: Math.round((fboSalesAmt + deliveryCost + returnCostBase + acceptanceAmt) * 100) / 100,
          storageCostPerDay,
        },
        {
          scheme: 'FBS',
          salesCommissionPct: fbsCommissionPct,
          salesCommissionAmt: fbsSalesAmt,
          logisticsAmt: deliveryCost,
          firstMileAmt: 0,
          returnAmt: returnCostBase,
          acceptanceAmt: 0,
          totalFeeAmt: Math.round((fbsSalesAmt + deliveryCost + returnCostBase) * 100) / 100,
          storageCostPerDay: 0,
        },
      ];

      for (const d of schemes) {
        await this.prisma.productMarketplaceCommission.upsert({
          where: {
            productId_marketplace_scheme: {
              productId: mapping.productId,
              marketplace: 'WILDBERRIES',
              scheme: d.scheme,
            },
          },
          create: {
            productId: mapping.productId,
            marketplace: 'WILDBERRIES',
            scheme: d.scheme,
            salesCommissionPct: d.salesCommissionPct,
            salesCommissionAmt: d.salesCommissionAmt,
            logisticsAmt: d.logisticsAmt,
            firstMileAmt: d.firstMileAmt,
            returnAmt: d.returnAmt,
            acceptanceAmt: d.acceptanceAmt,
            totalFeeAmt: d.totalFeeAmt,
            syncedAt: new Date(),
            rawData: { subjectId: wbSubjectId, volumeLiters, storageCostPerDay: d.storageCostPerDay },
          },
          update: {
            salesCommissionPct: d.salesCommissionPct,
            salesCommissionAmt: d.salesCommissionAmt,
            logisticsAmt: d.logisticsAmt,
            firstMileAmt: d.firstMileAmt,
            returnAmt: d.returnAmt,
            acceptanceAmt: d.acceptanceAmt,
            totalFeeAmt: d.totalFeeAmt,
            syncedAt: new Date(),
            rawData: { subjectId: wbSubjectId, volumeLiters, storageCostPerDay: d.storageCostPerDay },
          },
        }).catch((e: unknown) =>
          this.logger.warn(`[syncWbCommissions] upsert error: ${e instanceof Error ? e.message : String(e)}`),
        );
        synced++;
      }
    }

    this.logger.log(`[syncWbCommissions] userId=${userId} synced=${synced}`);
    return synced;
  }

  // ---------------------------------------------------------------------------
  // WB helpers
  // ---------------------------------------------------------------------------

  private async fetchWbCategoryCommissions(authHeader: Record<string, string>): Promise<WbCategoryCommission[]> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{ report?: WbCategoryCommission[] }>(
          `${this.WB_TARIFF_API}/api/v1/tariffs/commission`,
          { headers: authHeader, params: { locale: 'ru' }, timeout: 20000 },
        ),
      );
      return data?.report ?? [];
    } catch (e) {
      this.logger.warn(`[fetchWbCategoryCommissions] ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }

  private async fetchWbBoxTariff(authHeader: Record<string, string>, date: string): Promise<WbBoxTariff | null> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{
          response?: {
            data?: {
              warehouseList?: Array<{
                warehouseName: string;
                boxDeliveryBase: string;
                boxDeliveryLiter: string;
                boxStorageBase: string;
                boxStorageLiter: string;
              }>;
            };
          };
        }>(`${this.WB_TARIFF_API}/api/v1/tariffs/box`, {
          headers: authHeader,
          params: { date },
          timeout: 20000,
        }),
      );
      const list = data?.response?.data?.warehouseList;
      if (!list?.length) return null;
      // Берём первый склад (Коледино / Подольск как наиболее репрезентативный)
      const wh = list[0];
      return {
        warehouseName: wh.warehouseName,
        boxDeliveryBase: parseFloat(String(wh.boxDeliveryBase).replace(',', '.')) || 0,
        boxDeliveryLiter: parseFloat(String(wh.boxDeliveryLiter).replace(',', '.')) || 0,
        boxStorageBase: parseFloat(String(wh.boxStorageBase).replace(',', '.')) || 0,
        boxStorageLiter: parseFloat(String(wh.boxStorageLiter).replace(',', '.')) || 0,
      };
    } catch (e) {
      this.logger.warn(`[fetchWbBoxTariff] ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  private async fetchWbReturnTariff(authHeader: Record<string, string>, date: string): Promise<number> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{
          response?: {
            data?: {
              warehouseList?: Array<{
                deliveryDumpSupOfficeBase?: string;
                deliveryDumpSupOfficeLiter?: string;
              }>;
            };
          };
        }>(`${this.WB_TARIFF_API}/api/v1/tariffs/return`, {
          headers: authHeader,
          params: { date },
          timeout: 20000,
        }),
      );
      const wh = data?.response?.data?.warehouseList?.[0];
      if (!wh) return 0;
      // Базовый тариф возврата (пункт выдачи, не курьер)
      return parseFloat(String(wh.deliveryDumpSupOfficeBase ?? '0').replace(',', '.')) || 0;
    } catch (e) {
      this.logger.warn(`[fetchWbReturnTariff] ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    }
  }

  private async fetchWbAcceptanceCoef(authHeader: Record<string, string>): Promise<number> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<Array<{ coefficient: number | null }>>(
          'https://marketplace-api.wildberries.ru/api/tariffs/v1/acceptance/coefficients',
          { headers: authHeader, timeout: 20000 },
        ),
      );
      if (!Array.isArray(data) || data.length === 0) return 1;
      // Берём среднее ненулевых коэффициентов
      const coefs = data.map((d) => Number(d.coefficient ?? 1)).filter((c) => c > 0);
      if (!coefs.length) return 1;
      return Math.round((coefs.reduce((a, b) => a + b, 0) / coefs.length) * 100) / 100;
    } catch (e) {
      this.logger.warn(`[fetchWbAcceptanceCoef] ${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
  }
}

/** Округление до 2 знаков. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
