import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { MarketplacesService } from './marketplaces.service';
import { ProductsService } from '../products/products.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ConnectMarketplaceDto } from './dto/connect-marketplace.dto';
import { UpdateStatsTokenDto } from './dto/update-stats-token.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import type { ProductData } from './adapters/base-marketplace.adapter';
import { productToCanonical, canonicalToProductData } from './canonical';
import { SyncQueueService } from './sync-queue/sync-queue.service';
import { WbColorService } from './wb-color.service';
import { WbMappingHealthCron } from './wb-mapping-health.cron';

@Controller('marketplaces')
@UseGuards(JwtAuthGuard)
export class MarketplacesController {
  constructor(
    private readonly marketplacesService: MarketplacesService,
    private readonly productsService: ProductsService,
    private readonly syncQueueService: SyncQueueService,
    private readonly wbColorService: WbColorService,
    private readonly wbMappingHealthCron: WbMappingHealthCron,
  ) {}

  @Get()
  async findAll(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.findAll(userId);
  }

  @Get('user')
  async getUserMarketplaces(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getUserMarketplaces(userId);
  }

  /** Остатки FBO (на складах WB) по productId — для страницы товаров */
  @Get('wb-fbo-stock')
  async getWbFboStock(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getWbStockFbo(userId);
  }

  /** Остатки FBO (на складах Ozon) по productId — для страницы товаров */
  @Get('ozon-fbo-stock')
  async getOzonFboStock(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getOzonStockFbo(userId);
  }

  /** Диагностика: сырой ответ Ozon v4/product/info/stocks для отладки остатков FBO */
  @Get('ozon-fbo-stock-debug')
  async getOzonFboStockDebug(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getOzonFboStockDiagnostic(userId);
  }

  /** Справочник цветов WB (для выпадающего списка при создании/редактировании товара) */
  @Get('wb-colors')
  async getWbColors() {
    return this.wbColorService.findAll();
  }

  /** Синхронизация справочника цветов WB из API (требует подключённый WB) */
  @Post('wb-colors/sync')
  async syncWbColors(@CurrentUser('userId') userId: string) {
    return this.wbColorService.syncFromWb(userId);
  }

  @Post('connect')
  async connect(@CurrentUser('userId') userId: string, @Body() dto: ConnectMarketplaceDto) {
    const credential = dto.apiKey ?? dto.token;
    if (!credential) {
      throw new BadRequestException('Укажите apiKey или token');
    }
    const conn = await this.marketplacesService.connect(
      userId,
      dto.marketplace,
      credential,
      dto.refreshToken,
      dto.sellerId,
      dto.warehouseId,
      dto.statsToken,
    );
    return this.marketplacesService.toPublicMarketplaceSnapshot(conn);
  }

  @Patch(':marketplace/warehouse')
  async updateWarehouse(
    @CurrentUser('userId') userId: string,
    @Param('marketplace') marketplace: string,
    @Body() dto: UpdateWarehouseDto,
  ) {
    const api = marketplace.toUpperCase() as 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO';
    const conn = await this.marketplacesService.updateWarehouse(userId, api, dto.warehouseId ?? null);
    return this.marketplacesService.toPublicMarketplaceSnapshot(conn);
  }

  @Patch(':marketplace/stats-token')
  async updateStatsToken(
    @CurrentUser('userId') userId: string,
    @Param('marketplace') marketplace: string,
    @Body() dto: UpdateStatsTokenDto,
  ) {
    const api = marketplace.toUpperCase() as 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO';
    const conn = await this.marketplacesService.updateStatsToken(userId, api, dto.statsToken);
    return this.marketplacesService.toPublicMarketplaceSnapshot(conn);
  }

  @Delete(':marketplace')
  async disconnect(
    @CurrentUser('userId') userId: string,
    @Param('marketplace') marketplace: string,
  ) {
    const api = marketplace.toUpperCase() as 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO';
    await this.marketplacesService.disconnect(userId, api);
    return { success: true };
  }

  @Post('sync')
  async syncProducts(
    @CurrentUser('userId') userId: string,
    @Body() body?: { products?: ProductData[]; productIds?: string[] },
    @Query('async') asyncMode?: string,
    @Query('marketplace') marketplaceFilter?: string,
  ) {
    const mp = marketplaceFilter?.trim()?.toUpperCase();
    const marketplace = ['WILDBERRIES', 'OZON', 'YANDEX', 'AVITO'].includes(mp ?? '')
      ? (mp as 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO')
      : undefined;

    let products: ProductData[];
    if (body?.products?.length) {
      products = body.products;
      for (const p of products) {
        console.log(`[MarketplacesController] sync products from body: id=${p.id}, images=${(p.images?.length ?? 0)}, firstUrl=${p.images?.[0]?.slice(0, 60) ?? '—'}...`);
      }
    } else if (body?.productIds?.length) {
      const dbProducts = await Promise.all(
        body.productIds.map((id) => this.productsService.findByIdWithMappings(userId, id)),
      );
      const validProducts = dbProducts.filter((p): p is NonNullable<typeof p> => p != null);
      const canonical = validProducts.map((p) => productToCanonical(p));
      products = canonical.map((c) => canonicalToProductData(c));
      for (const p of products) {
        const db = validProducts.find((d) => d.id === p.id);
        console.log(`[MarketplacesController] sync from productIds: id=${p.id}, db.imageUrl=${(db as { imageUrl?: string })?.imageUrl?.slice(0, 50) ?? '—'}, images=${(p.images?.length ?? 0)}`);
      }
      if (marketplace === 'OZON' && validProducts.length > 0) {
        const byId = new Map(validProducts.map((p) => [p.id, p]));
        for (const p of products) {
          const db = byId.get(p.id);
          if (db) {
            p.barcodeOzon = (db as { barcodeOzon?: string }).barcodeOzon;
            p.barcode = p.barcodeOzon ?? undefined;
          }
        }
      }
    } else {
      const dbProducts = await this.productsService.findAll(userId);
      const canonical = dbProducts.map((p) => productToCanonical(p));
      products = canonical.map((c) => canonicalToProductData(c));
      if (marketplace === 'OZON' && dbProducts.length > 0) {
        const byId = new Map(dbProducts.map((p) => [p.id, p]));
        for (const p of products) {
          const db = byId.get(p.id);
          if (db) {
            p.barcodeOzon = (db as { barcodeOzon?: string }).barcodeOzon;
            p.barcode = p.barcodeOzon ?? undefined;
          }
        }
      }
    }

    if (marketplace === 'OZON' && products.length > 0) {
      const validationErrors: string[] = [];
      for (const p of products) {
        const dbProduct = await this.productsService.findById(userId, p.id);
        if (dbProduct) {
          const v = this.marketplacesService.validateProductForOzon(dbProduct);
          if (!v.valid) {
            validationErrors.push(`${p.name || 'Товар'}: ${v.errors.join('; ')}`);
          }
        }
      }
      if (validationErrors.length > 0) {
        throw new BadRequestException({
          message: 'Перед выгрузкой на Ozon заполните обязательные поля',
          errors: validationErrors,
        });
      }
    }

    if (marketplace === 'WILDBERRIES' && products.length > 0) {
      const wbColorNames = await this.marketplacesService.getWbColorNames();
      const validationErrors: string[] = [];
      for (const p of products) {
        const dbProduct = await this.productsService.findById(userId, p.id);
        const base = (dbProduct ?? p) as Record<string, unknown>;
        const toValidate = {
          ...base,
          title: p.name ?? base.title,
          imageUrl: p.images?.[0] ?? base.imageUrl,
          imageUrls: p.images?.length ? p.images.slice(1) : base.imageUrls,
        };
        const v = this.marketplacesService.validateProductForWb(toValidate, { wbColorNames });
        if (!v.valid) {
          validationErrors.push(`${p.name || 'Товар'}: ${v.errors.join('; ')}`);
        }
      }
      if (validationErrors.length > 0) {
        throw new BadRequestException({
          message: 'Перед выгрузкой на WB заполните обязательные поля',
          errors: validationErrors,
        });
      }
    }

    if (asyncMode === '1' || asyncMode === 'true') {
      return this.syncQueueService.addSyncJob(userId, products, marketplace);
    }
    return this.marketplacesService.syncProducts(userId, products, marketplace);
  }

  /** Called automatically by the frontend on products page load to fill missing WB photos */
  @Post('backfill-wb-photos')
  async backfillWbPhotos(@CurrentUser('userId') userId: string) {
    await this.marketplacesService.backfillWbPhotos(userId);
    return { ok: true };
  }

  @Get('sync/status/:jobId')
  async getSyncStatus(
    @CurrentUser('userId') _userId: string,
    @Param('jobId') jobId: string,
  ) {
    const status = await this.syncQueueService.getJobStatus(jobId);
    if (!status) throw new BadRequestException('Задача не найдена');
    return status;
  }

  /** Статус фонового импорта маркетплейса (очередь BullMQ) */
  @Get('import/status/:jobId')
  async getImportStatus(
    @CurrentUser('userId') _userId: string,
    @Param('jobId') jobId: string,
  ) {
    const status = await this.syncQueueService.getJobStatus(jobId);
    if (!status) throw new BadRequestException('Задача не найдена');
    return status;
  }

  @Get('orders')
  async getOrders(
    @CurrentUser('userId') userId: string,
    @Query('since') since?: string,
  ) {
    const sinceDate = since ? new Date(since) : undefined;
    return this.marketplacesService.getOrdersFromAllMarketplaces(userId, sinceDate);
  }

  /** Статистика заказов по маркету и статусу — для блоков Озон/ВБ на Главной (текущий месяц) */
  @Get('orders-stats-by-status')
  async getOrdersStatsByStatus(
    @CurrentUser('userId') userId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    return this.marketplacesService.getOrdersStatsByStatus(userId, fromDate, toDate);
  }

  @Get('statistics')
  async getStatistics(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getStatistics(userId);
  }

  /** Связанные товары по маркетплейсам — только БД, без внешних API */
  @Get('linked-products-stats')
  async getLinkedProductsStats(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getLinkedProductsStats(userId);
  }

  /** Аудит WB-связок: дубли, непривязанные товары, legacy SKU без маппинга */
  @Get('wb-mapping-audit')
  async getWbMappingAudit(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getWbMappingAudit(userId);
  }

  /** Синхронизация логистики и комиссий по выкупленным заказам (WB reportDetailByPeriod, Ozon finance/transaction/list) */
  @Post('order-costs/sync')
  async syncOrderCosts(
    @CurrentUser('userId') userId: string,
    @Body() body?: { from?: string; to?: string },
  ) {
    const from = body?.from ? new Date(body.from) : undefined;
    const to = body?.to ? new Date(body.to) : undefined;
    return this.marketplacesService.syncOrderCosts(userId, from, to);
  }

  @Get('wb-stock/:displayId')
  async getWbStock(
    @CurrentUser('userId') userId: string,
    @Param('displayId') displayId: string,
  ) {
    return this.marketplacesService.getWbStockForProduct(userId, displayId);
  }

  /** Принудительно синхронизировать остаток на WB (артикул или displayId) */
  @Post('wb-stock/:displayId/sync')
  async forceSyncWbStock(
    @CurrentUser('userId') userId: string,
    @Param('displayId') displayId: string,
  ) {
    return this.marketplacesService.forceSyncWbStock(userId, displayId);
  }

  /** Получить штрих-код WB для товара */
  @Get('wb-barcode/:productId')
  async getWbBarcode(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketplacesService.getWbBarcodeForProduct(userId, productId);
  }

  /** Загрузить штрих-код с WB и сохранить. Только с маркета — вручную нельзя. */
  @Post('wb-barcode/:productId/load')
  async loadWbBarcode(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketplacesService.loadAndSaveWbBarcode(userId, productId);
  }

  /** Дерево категорий Ozon (для выбора категории товара) */
  @Get('ozon/categories')
  async getOzonCategories(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getOzonCategoryTree(userId);
  }

  /** Список складов Ozon (ID + название) — для выбора склада по имени */
  @Get('ozon/warehouses')
  async getOzonWarehouses(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getOzonWarehouseList(userId);
  }

  /** Список складов WB (ID + название) — для выбора склада для остатков */
  @Get('wb/warehouses')
  async getWbWarehouses(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getWbWarehouseList(userId);
  }

  /** Список категорий WB (subjects) — для выбора категории товара */
  @Get('wb/categories')
  async getWbCategories(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getWbCategoryList(userId);
  }

  /** Атрибуты категории Ozon (по categoryId и typeId) */
  @Get('ozon/categories/attributes')
  async getOzonCategoryAttributes(
    @CurrentUser('userId') userId: string,
    @Query('categoryId') categoryId: string,
    @Query('typeId') typeId: string,
  ) {
    const cat = parseInt(categoryId, 10);
    const type = parseInt(typeId, 10);
    if (isNaN(cat) || isNaN(type) || cat <= 0 || type <= 0) {
      throw new BadRequestException('Укажите categoryId и typeId');
    }
    return this.marketplacesService.getOzonCategoryAttributes(userId, cat, type);
  }

  /** Проверка подключения к Ozon: Client-Id, API Key, запрос к API */
  @Get('ozon-test')
  async testOzonConnection(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.testOzonConnection(userId);
  }

  /** Диагностика остатков Ozon (артикул или displayId) */
  @Get('ozon-stock/:displayIdOrArticle')
  async getOzonStock(
    @CurrentUser('userId') userId: string,
    @Param('displayIdOrArticle') displayIdOrArticle: string,
  ) {
    return this.marketplacesService.getOzonStockForProduct(userId, displayIdOrArticle);
  }

  /** Пошаговая диагностика остатков Ozon: запросы и ответы на каждом шаге. Админ может передать ?forUserId=xxx */
  @Get('ozon-stock-debug/:displayIdOrArticle')
  async ozonStockDebug(
    @CurrentUser('userId') userId: string,
    @CurrentUser('role') role: string,
    @Param('displayIdOrArticle') displayIdOrArticle: string,
    @Query('forUserId') forUserId?: string,
  ) {
    const targetUserId = role === 'ADMIN' && forUserId?.trim() ? forUserId.trim() : userId;
    return this.marketplacesService.ozonStockDebugStepByStep(targetUserId, displayIdOrArticle);
  }

  /** Принудительно синхронизировать остаток на Ozon */
  @Post('ozon-stock/:displayIdOrArticle/sync')
  async forceSyncOzonStock(
    @CurrentUser('userId') userId: string,
    @Param('displayIdOrArticle') displayIdOrArticle: string,
  ) {
    return this.marketplacesService.forceSyncOzonStock(userId, displayIdOrArticle);
  }

  /** Проверить, создана ли карточка на Ozon. Связка по артикулу. */
  @Get('ozon-check/:productId')
  async getOzonCheck(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketplacesService.getOzonProductCheck(userId, productId);
  }

  /** Валидация перед выгрузкой на Ozon: обязательные поля */
  @Get('ozon-validate/:productId')
  async validateForOzon(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    const product = await this.productsService.findById(userId, productId);
    if (!product) throw new BadRequestException('Товар не найден');
    return this.marketplacesService.validateProductForOzon(product);
  }

  /** Валидация перед выгрузкой на WB: обязательные поля */
  @Get('wb-validate/:productId')
  async validateForWb(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    const product = await this.productsService.findById(userId, productId);
    if (!product) throw new BadRequestException('Товар не найден');
    const wbColorNames = await this.marketplacesService.getWbColorNames();
    return this.marketplacesService.validateProductForWb(product, { wbColorNames });
  }

  /** Диагностика выгрузки на WB: попытка загрузки с полным ответом API */
  @Post('wb-export-diagnostic/:productId')
  async getWbExportDiagnostic(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketplacesService.getWbExportDiagnostic(userId, productId);
  }

  /** Предпросмотр выгрузки на WB: payload и маппинг полей */
  @Get('wb-export-preview/:productId')
  async getWbExportPreview(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketplacesService.getWbExportPreview(userId, productId);
  }

  /** Диагностика выгрузки: попытка импорта с полным ответом Ozon при ошибке */
  @Post('ozon-export-diagnostic/:productId')
  async getOzonExportDiagnostic(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketplacesService.getOzonExportDiagnostic(userId, productId);
  }

  /** Предпросмотр выгрузки на Ozon: payload, маппинг полей, обязательные атрибуты категории */
  @Get('ozon-export-preview/:productId')
  async getOzonExportPreview(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketplacesService.getOzonExportPreview(userId, productId);
  }

  /** Диагностика Ozon: сравнить offer_id — для отладки ошибок обновления */
  @Get('ozon-debug/:productId')
  async getOzonDebug(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketplacesService.getOzonProductDebug(userId, productId);
  }

  /** Удалить связку Ozon (лишний маппинг). Body: { externalSystemId: string } */
  @Post('ozon-delete-mapping/:productId')
  async deleteOzonMapping(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
    @Body() body: { externalSystemId: string },
  ) {
    if (!body?.externalSystemId?.trim()) {
      throw new BadRequestException('Укажите externalSystemId (product_id на Ozon)');
    }
    return this.marketplacesService.deleteOzonMapping(userId, productId, body.externalSystemId);
  }

  /** Обновить связку с Ozon по текущему артикулу (когда клиент исправил артикул или создал товар на Ozon вручную) */
  @Post('ozon-refresh-mapping/:productId')
  async refreshOzonMapping(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketplacesService.refreshOzonMapping(userId, productId);
  }

  /** Обновить связку с WB по текущему артикулу (vendorCode) */
  @Post('wb-refresh-mapping/:productId')
  async refreshWbMapping(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketplacesService.refreshWbMapping(userId, productId);
  }

  /** Массовое восстановление WB-связок для непривязанных товаров */
  @Post('wb-mapping-repair')
  async repairWbMappings(
    @CurrentUser('userId') userId: string,
    @Body() body?: { limit?: number; dryRun?: boolean },
    @Query('async') asyncMode?: string,
  ) {
    const isAsyncRequested = asyncMode === '1' || asyncMode === 'true';
    if (isAsyncRequested) {
      return this.syncQueueService.addWbRepairJob(userId, {
        limit: body?.limit,
        dryRun: body?.dryRun,
      });
    }
    return this.marketplacesService.repairWbMappings(userId, {
      limit: body?.limit,
      dryRun: body?.dryRun,
    });
  }

  /** Ручной health-check WB-связок для текущего пользователя (без ожидания cron) */
  @Post('wb-mapping-health/run')
  async runWbMappingHealth(
    @CurrentUser('userId') userId: string,
    @Body() body?: {
      withDryRunRepairPreview?: boolean;
      withApplyRepair?: boolean;
      repairLimit?: number;
      sendTelegram?: boolean;
    },
  ) {
    return this.wbMappingHealthCron.runManualCheckForUser(userId, {
      withDryRunRepairPreview: body?.withDryRunRepairPreview,
      withApplyRepair: body?.withApplyRepair,
      repairLimit: body?.repairLimit,
      sendTelegram: body?.sendTelegram,
    });
  }

  /** Загрузить штрих-код с Ozon и сохранить. Только с маркета — вручную нельзя. */
  @Post('ozon-barcode/:productId/load')
  async loadOzonBarcode(
    @CurrentUser('userId') userId: string,
    @Param('productId') productId: string,
  ) {
    return this.marketplacesService.loadAndSaveOzonBarcode(userId, productId);
  }

  /** WB FBS: информация о поставке и грузоместах */
  @Get('wb-supply')
  async getWbSupplyInfo(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getWbSupplyInfo(userId);
  }

  /** WB FBS: добавить грузоместа (коробки) */
  @Post('wb-supply/trbx')
  async addWbTrbx(@CurrentUser('userId') userId: string, @Body() body: { amount?: number }) {
    return this.marketplacesService.addWbTrbx(userId, body.amount ?? 1);
  }

  /** WB FBS: стикеры грузомест для печати */
  @Get('wb-supply/trbx/stickers')
  async getWbTrbxStickers(
    @CurrentUser('userId') userId: string,
    @Query('type') type?: 'svg' | 'png' | 'zplv' | 'zplh',
  ) {
    return this.marketplacesService.getWbTrbxStickers(userId, type ?? 'png');
  }

  /** WB FBS: сдать поставку в доставку */
  @Post('wb-supply/deliver')
  async deliverWbSupply(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.deliverWbSupply(userId);
  }

  /** WB FBS: QR-код поставки для СЦ (после deliver). При сдаче на ПВЗ не требуется. */
  @Get('wb-supply/barcode')
  async getWbSupplyBarcode(
    @CurrentUser('userId') userId: string,
    @Query('type') type?: 'svg' | 'png' | 'zplv' | 'zplh',
  ) {
    const result = await this.marketplacesService.getWbSupplyBarcode(userId, type ?? 'png');
    if (!result) throw new BadRequestException('QR-код недоступен. Сначала сдайте поставку в доставку.');
    return result;
  }

  /** Диагностика импорта с Ozon: сырой ответ API /v3/product/list */
  @Get('ozon-import-diagnostic')
  async getOzonImportDiagnostic(@CurrentUser('userId') userId: string) {
    return this.marketplacesService.getOzonImportDiagnostic(userId);
  }

  @Post('import')
  async importProducts(
    @CurrentUser('userId') userId: string,
    @Body() body: { marketplace?: 'WILDBERRIES' | 'OZON' | 'YANDEX' | 'AVITO' },
    @Query('async') asyncMode?: string,
  ) {
    const marketplace = body?.marketplace ?? 'WILDBERRIES';
    const isAsyncRequested = asyncMode === '1' || asyncMode === 'true';
    // Ozon/WB imports can include thousands of products and often exceed gateway timeout.
    // Keep WB API calls unchanged in adapter layer; only move execution to background queue.
    const shouldRunAsync = isAsyncRequested || marketplace === 'OZON' || marketplace === 'WILDBERRIES';
    try {
      if (shouldRunAsync) {
        return this.syncQueueService.addImportJob(userId, marketplace);
      }
      return await this.marketplacesService.importProductsFromMarketplace(userId, marketplace);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[MarketplacesController] import error:', msg, err);
      throw new BadRequestException(msg || 'Ошибка импорта товаров');
    }
  }
}
