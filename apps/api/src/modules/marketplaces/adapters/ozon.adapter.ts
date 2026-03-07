import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  BaseMarketplaceAdapter,
  ProductData,
  OrderData,
  SyncResult,
  MarketplaceConfig,
  PlatformProductPayload,
} from './base-marketplace.adapter';
import type { CanonicalProduct } from '../canonical/canonical-product.types';
import { CryptoService } from '../../../common/crypto/crypto.service';

/** Узел дерева категорий Ozon (рекурсивный) */
export interface OzonCategoryNode {
  description_category_id: number;
  category_name: string;
  disabled?: boolean;
  type_id?: number;
  type_name?: string;
  children?: OzonCategoryNode[];
}

/** Информация об атрибуте категории Ozon */
export interface OzonAttributeInfo {
  id: number;
  name?: string;
  description?: string;
  type?: string;
  is_collection?: boolean;
  is_required?: boolean;
  group_id?: number;
  group_name?: string;
  dictionary_id?: number;
}

@Injectable()
export class OzonAdapter extends BaseMarketplaceAdapter {
  private readonly logger = new Logger(OzonAdapter.name);
  private readonly API_BASE = 'https://api-seller.ozon.ru';
  private readonly httpService: HttpService;
  /** Последний offer_id, полученный из Ozon API при setStock — для обновления маппинга. */
  private lastStockOfferIdResolved?: { productId: string; externalSystemId: string; offerId: string };

  constructor(
    crypto: CryptoService,
    httpService: HttpService,
    config: MarketplaceConfig,
  ) {
    super(crypto, {
      ...config,
      baseUrl: config.baseUrl || 'https://seller.ozon.ru',
    });
    this.httpService = httpService;
  }

  /**
   * CanonicalProduct → формат Ozon /v2/product/import.
   * Маппинг: title→name, long_description→attributes[4190], vendor_code→offer_id, price→price.
   */
  convertToPlatform(canonical: CanonicalProduct): PlatformProductPayload {
    const offerId = canonical.vendor_code ?? canonical.canonical_sku;
    const descText = canonical.long_description_html?.trim() || (canonical.long_description_plain ?? canonical.short_description ?? '');
    const attributes: Array<{ complex_id: number; id: number; values: Array<{ dictionary_value_id: number; value: string }> }> = [
      { complex_id: 0, id: 4189, values: [{ dictionary_value_id: 0, value: canonical.title }] },
      { complex_id: 0, id: 4190, values: [{ dictionary_value_id: 0, value: descText }] },
    ];
    const height = canonical.height_mm ?? 100;
    const width = canonical.width_mm ?? 100;
    const depth = canonical.length_mm ?? 100;
    const weight = canonical.weight_grams ?? 100;

    const item: Record<string, unknown> = {
      attributes,
      images: canonical.images?.map((i) => i.url) ?? [],
      name: canonical.title,
      offer_id: offerId,
      old_price: canonical.old_price
        ? String(Math.round(canonical.old_price))
        : canonical.price <= 400
          ? String(Math.ceil(canonical.price / 0.79))
          : String(Math.round(canonical.price * 1.2)),
      price: String(Math.round(canonical.price)),
      vat: '0',
      height,
      width,
      depth,
      dimension_unit: 'mm',
      weight,
      weight_unit: 'g',
    };
    if (canonical.seo_title || canonical.seo_keywords || canonical.seo_description) {
      item.seo_text = {
        title: canonical.seo_title ?? canonical.title,
        keywords: canonical.seo_keywords ?? '',
        description: canonical.seo_description ?? '',
      };
    }
    return { items: [item] };
  }

  async authenticate(): Promise<boolean> {
    if (!this.config.sellerId?.trim() || !this.config.apiKey?.trim()) {
      return false;
    }
    const headers = {
      'Client-Id': this.config.sellerId.trim(),
      'Api-Key': this.config.apiKey.trim(),
      'Content-Type': 'application/json',
    };
    const endpoints: Array<{ url: string; body: object }> = [
      { url: `${this.API_BASE}/v1/warehouse/list`, body: {} },
      { url: `${this.API_BASE}/v2/product/list`, body: { limit: 1, offset: 0 } },
      { url: `${this.API_BASE}/v3/product/list`, body: {} },
    ];
    let lastError: string | null = null;
    for (const { url, body } of endpoints) {
      try {
        const { status, data } = await firstValueFrom(
          this.httpService.post(url, body, {
            headers,
            validateStatus: () => true,
          }),
        );
        if (status >= 200 && status < 300) return true;
        lastError = this.extractOzonErrorFromResponse(status, data);
      } catch (error) {
        lastError = this.extractOzonError(error);
        this.logError(error, `authenticate ${url}`);
      }
    }
    if (lastError) {
      throw new Error(`Ozon: ${lastError}`);
    }
    return false;
  }

  private extractOzonErrorFromResponse(status: number, data: unknown): string {
    if (data && typeof data === 'object') {
      const d = data as { message?: string; code?: string; details?: Array<{ message?: string }> };
      if (d.message) return d.message;
      if (Array.isArray(d.details) && d.details[0]?.message) return d.details[0].message;
      if (d.code) return String(d.code);
    }
    if (status === 401) return 'Неверный API ключ или Client ID';
    if (status === 403) return 'Доступ запрещён. Проверьте права ключа в кабинете Ozon';
    return `HTTP ${status}`;
  }

  private extractOzonError(error: unknown): string {
    if (error && typeof error === 'object' && 'response' in error) {
      const res = (error as { response?: { data?: unknown; status?: number } }).response;
      if (res) return this.extractOzonErrorFromResponse(res.status ?? 0, res.data);
    }
    return error instanceof Error ? error.message : String(error);
  }

  /**
   * Ozon offer_id: только буквы, цифры, дефис, подчёркивание. UUID не подходит.
   */
  private sanitizeOfferId(val: string): string {
    return val.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) || `HS_${Math.random().toString(36).slice(2, 10)}`;
  }

  /** Заголовки для запросов к Ozon API */
  private ozonHeaders() {
    return {
      'Client-Id': this.config.sellerId ?? '',
      'Api-Key': this.config.apiKey,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Список складов Ozon. POST /v1/warehouse/list
   * Возвращает { warehouse_id, name } для выбора склада по названию.
   */
  async getWarehouseList(): Promise<Array<{ warehouse_id: number; name?: string }>> {
    const { data } = await firstValueFrom(
      this.httpService.post<{ result?: Array<{ warehouse_id?: number | string; name?: string }> }>(
        `${this.API_BASE}/v1/warehouse/list`,
        {},
        { headers: this.ozonHeaders(), timeout: 15000 },
      ),
    );
    const items = data?.result ?? [];
    const result: Array<{ warehouse_id: number; name?: string }> = [];
    for (const w of items) {
      const id = w.warehouse_id;
      const num = typeof id === 'number' ? id : (typeof id === 'string' ? parseInt(id, 10) : NaN);
      if (num > 0) result.push({ warehouse_id: num, name: w.name ?? '' });
    }
    return result;
  }

  /**
   * Дерево категорий Ozon.
   * POST /v1/description-category/tree
   */
  async getCategoryTree(): Promise<OzonCategoryNode[]> {
    const { data } = await firstValueFrom(
      this.httpService.post<{ result?: OzonCategoryNode[] }>(
        `${this.API_BASE}/v1/description-category/tree`,
        {},
        { headers: this.ozonHeaders(), timeout: 15000 },
      ),
    );
    return Array.isArray(data?.result) ? data.result : [];
  }

  /**
   * Атрибуты категории Ozon (обязательные и опциональные).
   * POST /v1/description-category/attribute — список атрибутов.
   * Ответ: result — массив { attribute: { id, name, is_required, ... } } или result — массив атрибутов напрямую.
   */
  async getCategoryAttributes(
    descriptionCategoryId: number,
    typeId: number,
  ): Promise<OzonAttributeInfo[]> {
    const { data } = await firstValueFrom(
      this.httpService.post<{ result?: unknown[] }>(
        `${this.API_BASE}/v1/description-category/attribute`,
        { description_category_id: descriptionCategoryId, type_id: typeId },
        { headers: this.ozonHeaders(), timeout: 15000 },
      ),
    );
    const items = data?.result ?? [];
    const mapped: OzonAttributeInfo[] = [];
    for (const r of items) {
      const attr = (r && typeof r === 'object' && 'attribute' in r)
        ? (r as { attribute?: OzonAttributeInfo }).attribute
        : (r as OzonAttributeInfo);
      if (attr && typeof attr === 'object' && typeof (attr as { id?: number }).id === 'number') {
        mapped.push(attr as OzonAttributeInfo);
      }
    }
    return mapped;
  }

  /**
   * Маппинг атрибутов Ozon: id/name -> значение из карточки товара.
   */
  private mapAttributeToValue(
    attr: OzonAttributeInfo,
    product: ProductData,
    offerId: string,
  ): string {
    const id = attr.id;
    const name = (attr.name ?? '').toLowerCase();
    if (id === 4180 || name.includes('бренд')) return (product.brand || 'Ручная работа').trim().slice(0, 200);
    if (id === 9048 || name.includes('название модели') || name.includes('модель')) return (product.name || offerId).slice(0, 500);
    if (name.includes('тип')) return (product.craftType || product.name || offerId).trim().slice(0, 500);
    return (product.name || offerId).slice(0, 500);
  }

  /**
   * Построить payload для v3/product/import без отправки. Для предпросмотра и диагностики.
   * requiredAttributes: при наличии — атрибуты строятся по обязательным полям категории (Тип, Бренд и др.).
   */
  buildImportPayload(
    product: ProductData,
    requiredAttributes?: OzonAttributeInfo[],
  ): {
    item: Record<string, unknown>;
    mapping: Record<string, { our: unknown; ozon: unknown }>;
    offerId: string;
    descriptionCategoryId: number;
    typeId: number;
    attributeIds: number[];
  } {
    const priceNum = Math.round(Number(product.price ?? 1));
    const offerId = this.sanitizeOfferId(product.vendorCode ?? `HS_${product.id.slice(0, 8)}`);
    // Штрих-код: только если уже есть (barcodeOzon или barcode). Иначе не передаём — Ozon сгенерирует свой (OZN...).
    const barcode = (product.barcodeOzon ?? product.barcode)?.trim() || undefined;
    const priceStr = String(priceNum);
    // Ozon требует скидку >20% при цене ≤400 (old_price > price / 0.8)
    // Если oldPrice указан вручную — используем его, иначе авторасчёт
    const oldPriceNum = product.oldPrice
      ? Math.round(product.oldPrice)
      : priceNum <= 400
        ? Math.ceil(priceNum / 0.79)
        : Math.max(priceNum + 1, Math.round((product.price ?? 1) * 1.25));
    const oldPriceStr = String(oldPriceNum);

    const validImages = product.images?.filter((u) => typeof u === 'string' && u.startsWith('http')) ?? [];

    const height = product.height ?? 100;
    const width = product.width ?? 100;
    const depth = product.length ?? 100;
    const weight = product.weight ?? 100;

    const descriptionCategoryId = product.ozonCategoryId ?? 17028922;
    const typeId = product.ozonTypeId ?? 91565;

    const modelName = (product.name || offerId).slice(0, 500);
    const brandValue = (product.brand || 'Ручная работа').trim().slice(0, 200);

    let attributes: Array<{ id: number; complex_id: number; values: Array<{ dictionary_value_id: number; value: string }> }>;
    if (Array.isArray(requiredAttributes) && requiredAttributes.length > 0) {
      attributes = requiredAttributes.map((attr) => ({
        id: attr.id,
        complex_id: 0,
        values: [{ dictionary_value_id: 0, value: this.mapAttributeToValue(attr, product, offerId) }],
      }));
    } else {
      attributes = [
        { id: 9048, complex_id: 0, values: [{ dictionary_value_id: 0, value: modelName }] },
        { id: 4180, complex_id: 0, values: [{ dictionary_value_id: 0, value: brandValue }] },
      ];
    }

    const item: Record<string, unknown> = {
      description_category_id: descriptionCategoryId,
      type_id: typeId,
      name: (product.name || '').slice(0, 500),
      offer_id: offerId,
      ...(barcode ? { barcode } : {}),
      price: priceStr,
      old_price: oldPriceStr,
      vat: '0',
      height,
      width,
      depth,
      dimension_unit: 'mm',
      weight,
      weight_unit: 'g',
      images: validImages,
      attributes,
    };

    const extra: string[] = [];
    if (product.color?.trim()) extra.push(`Цвет: ${product.color.trim()}`);
    if (product.itemsPerPack != null && product.itemsPerPack > 0) extra.push(`Кол-во в упаковке: ${product.itemsPerPack}`);
    if (product.material?.trim()) extra.push(`Материал: ${product.material.trim()}`);
    if (product.craftType?.trim()) extra.push(`Вид творчества: ${product.craftType.trim()}`);
    if (product.countryOfOrigin?.trim()) extra.push(`Страна производства: ${product.countryOfOrigin.trim()}`);
    if (product.packageContents?.trim()) extra.push(`Комплектация: ${product.packageContents.trim()}`);
    let desc = product.description?.trim() ?? '';
    if (product.richContent?.trim()) {
      desc = desc ? `${desc}\n\n${product.richContent.trim()}` : product.richContent.trim();
    }
    if (extra.length) {
      desc = desc ? `${desc}\n\n${extra.join('\n')}` : extra.join('\n');
    }
    if (desc) {
      item.description = desc.slice(0, 5000);
    }

    const mapping: Record<string, { our: unknown; ozon: unknown }> = {
      name: { our: product.name, ozon: item.name },
      offer_id: { our: product.vendorCode ?? product.id, ozon: offerId },
      barcode: { our: product.barcodeOzon ?? product.barcode ?? '(Ozon сгенерирует)', ozon: barcode ?? '(не передаём)' },
      price: { our: product.price ?? 1, ozon: priceStr },
      images: { our: product.images?.length ?? 0, ozon: validImages.length },
      weight: { our: product.weight ?? weight, ozon: weight },
      width: { our: product.width ?? width, ozon: width },
      depth: { our: product.length ?? depth, ozon: depth },
      height: { our: product.height ?? height, ozon: height },
      attributes: { our: '9048, 4180', ozon: attributes.map((a) => `${a.id}`).join(', ') },
    };

    return {
      item,
      mapping,
      offerId,
      descriptionCategoryId,
      typeId,
      attributeIds: attributes.map((a) => a.id),
    };
  }

  /**
   * Диагностика: попытка импорта с возвратом полного ответа Ozon.
   * При успехе — создаёт карточку и возвращает productId; при ошибке — полный ozonResponse для отладки.
   */
  /** Диагностика: попытка импорта с возвратом полного ответа Ozon при ошибке */
  async tryImportWithFullResponse(product: ProductData): Promise<{
    success: boolean;
    productId?: string;
    error?: string;
    ozonResponse?: unknown;
  }> {
    try {
      const productId = await this.uploadProduct(product);
      return { success: true, productId };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const ozonResponse = err && typeof err === 'object' && 'ozonResponse' in err
        ? (err as { ozonResponse?: unknown }).ozonResponse
        : undefined;
      return { success: false, error: msg, ozonResponse };
    }
  }

  async uploadProduct(product: ProductData): Promise<string> {
    try {
      if (!this.config.sellerId?.trim() || !this.config.apiKey?.trim()) {
        throw new Error(
          'Ozon не подключён или данные устарели. Подключите Ozon заново в разделе Маркетплейсы (Client ID и API Key).',
        );
      }
      // Цена задаётся на Ozon клиентом; при создании используем placeholder 1
      const priceNum = Math.round(Number(product.price ?? 1));
      if (priceNum <= 0) {
        throw new Error('Ozon не принимает цену 0 или отрицательную.');
      }

      const validImages = product.images?.filter((u) => typeof u === 'string' && u.startsWith('http')) ?? [];
      if (validImages.length === 0) {
        throw new Error(
          'Добавьте URL фото товара в карточке. Ozon требует хотя бы одно изображение.',
        );
      }

      let requiredAttributes: OzonAttributeInfo[] = [];
      try {
        const catId = product.ozonCategoryId ?? 17028922;
        const typeId = product.ozonTypeId ?? 91565;
        requiredAttributes = (await this.getCategoryAttributes(catId, typeId)).filter((a) => a.is_required);
      } catch {
        // Категория может быть недоступна — используем дефолтные атрибуты
      }
      const { item, offerId } = this.buildImportPayload(product, requiredAttributes.length > 0 ? requiredAttributes : undefined);

      this.logger.debug(
        `Ozon import: offer_id=${offerId}, category=${item.description_category_id}, type=${item.type_id}, images=${(item.images as unknown[]).length}`,
      );

      const { status: httpStatus, data } = await firstValueFrom(
        this.httpService.post(
          `${this.API_BASE}/v3/product/import`,
          { items: [item] },
          {
            headers: {
              'Client-Id': this.config.sellerId ?? '',
              'Api-Key': this.config.apiKey,
              'Content-Type': 'application/json',
            },
            validateStatus: () => true,
          },
        ),
      );

      if (httpStatus >= 400 || data?.code || data?.message) {
        this.logger.warn(`Ozon v3/import HTTP ${httpStatus}: ${JSON.stringify(data)}`);
      }

      const taskId = data?.result?.task_id;
      if (!taskId) {
        let errMsg =
          this.extractOzonImportError(data) ??
          data?.message ??
          (Array.isArray(data?.errors) ? data.errors[0] : null) ??
          'Не удалось создать товар';
        if (httpStatus === 401 || (typeof errMsg === 'string' && /unauthorized/i.test(errMsg))) {
          errMsg = 'Неверный API ключ или Client ID. Проверьте данные в ЛК Ozon (Настройки → API-ключи) и переподключите в разделе Маркетплейсы.';
        } else if (httpStatus === 403) {
          errMsg = 'Доступ запрещён. Проверьте права API ключа в кабинете Ozon.';
        }
        throw new Error(String(errMsg));
      }

      await new Promise((r) => setTimeout(r, 2000));
      const statusData = await firstValueFrom(
        this.httpService.post(
          `${this.API_BASE}/v1/product/import/info`,
          { task_id: taskId },
          {
            headers: {
              'Client-Id': this.config.sellerId ?? '',
              'Api-Key': this.config.apiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      ).then((r) => r.data);

      const items = statusData?.result?.items ?? [];
      const firstItem = items[0];
      const ozonStatus = String(firstItem?.status ?? statusData?.result?.state ?? '');
      let productId = firstItem?.product_id;

      if (ozonStatus !== 'imported' && ozonStatus !== 'processed' && ozonStatus !== 'skipped') {
        this.logger.warn(`Ozon import/info task=${taskId}: status=${ozonStatus}, items=${JSON.stringify(items)}, state=${statusData?.result?.state}`);
      }

      // imported, processed — успешно создан; skipped — товар уже существует (повторная выгрузка)
      if (ozonStatus === 'imported' || ozonStatus === 'processed') {
        if (productId) {
          // Принудительно передаём остатки (даже если warehouseId не настроен — попробуем с дефолтным)
          const stockToSend = typeof product.stock === 'number' ? product.stock : 0;
          const offerId = product.vendorCode ?? product.id;
          try {
            if (this.config.warehouseId) {
              await this.setStock(offerId, String(productId), stockToSend);
              this.logger.log(`Озон: остатки отправлены для product_id=${productId}, stock=${stockToSend}`);
            } else {
              this.logger.warn(`Озон: warehouseId не настроен — остатки НЕ отправлены для product_id=${productId}. Настройте склад в настройках Ozon.`);
            }
          } catch (stockErr) {
            this.logger.error(`Озон: ошибка отправки остатков для product_id=${productId}: ${stockErr instanceof Error ? stockErr.message : String(stockErr)}`);
            // Не прерываем — товар уже создан, просто остатки не обновились
          }

          // Ozon автоматически генерирует штрих-код (OZN...) при импорте, если barcode не передан
          // Ждём 5 секунд для завершения генерации на стороне Ozon
          this.logger.log(`Озон: импорт успешен, product_id=${productId} — штрих-код генерируется автоматически`);
          await new Promise((r) => setTimeout(r, 5000));
          return String(productId);
        }
      }

      if (ozonStatus === 'skipped') {
        // При skipped Ozon может вернуть product_id в ответе; иначе ищем по offer_id
        if (!productId) {
          productId = await this.findProductIdByOfferId(offerId);
        }
        if (productId) {
          // Товар уже существует — обновляем остатки принудительно
          const stockToSend = typeof product.stock === 'number' ? product.stock : 0;
          try {
            if (this.config.warehouseId) {
              await this.setStock(offerId, String(productId), stockToSend);
              this.logger.log(`Озон (skipped): остатки обновлены для product_id=${productId}, stock=${stockToSend}`);
            } else {
              this.logger.warn(`Озон (skipped): warehouseId не настроен — остатки НЕ обновлены для product_id=${productId}`);
            }
          } catch (stockErr) {
            this.logger.error(`Озон (skipped): ошибка обновления остатков для product_id=${productId}: ${stockErr instanceof Error ? stockErr.message : String(stockErr)}`);
          }
          return String(productId);
        }
      }

      const errParts = this.collectOzonErrors(firstItem?.errors, statusData?.result?.errors, statusData?.message);
      const errMsg = errParts.length > 0
        ? errParts.join('; ')
        : `Статус: ${ozonStatus || 'unknown'}. Проверьте категорию (ozonCategoryId/ozonTypeId) и обязательные атрибуты.`;
      this.logger.warn(`Ozon import failed: task=${taskId}, status=${ozonStatus}, errors=${JSON.stringify(firstItem?.errors)}`);
      const err = new Error(errMsg) as Error & { ozonResponse?: unknown };
      err.ozonResponse = statusData;
      throw err;
    } catch (error) {
      this.logError(error, 'uploadProduct');
      let msg = this.extractOzonErrorFromAxios(error) || (error instanceof Error ? error.message : String(error));
      if (/unauthorized/i.test(String(msg))) {
        msg = 'Неверный API ключ или Client ID. Проверьте данные в ЛК Ozon (Настройки → API-ключи) и переподключите в разделе Маркетплейсы.';
      } else if (/forbidden|доступ запрещён/i.test(String(msg))) {
        msg = 'Доступ запрещён. Проверьте права API ключа в кабинете Ozon.';
      }
      const err = new Error(`Ошибка выгрузки товара на Ozon: ${msg}`) as Error & { ozonResponse?: unknown };
      if (error && typeof error === 'object' && 'ozonResponse' in error) {
        err.ozonResponse = (error as { ozonResponse?: unknown }).ozonResponse;
      }
      throw err;
    }
  }

  /** Собрать все сообщения об ошибках из ответа Ozon (items[].errors, result.errors) */
  private collectOzonErrors(
    itemErrors?: unknown[],
    resultErrors?: unknown[],
    fallbackMessage?: string,
  ): string[] {
    const parts: string[] = [];
    const add = (arr: unknown[] | undefined) => {
      if (!Array.isArray(arr)) return;
      for (const e of arr) {
        if (typeof e === 'string' && e.trim()) parts.push(e.trim());
        else if (e && typeof e === 'object' && 'message' in e) {
          const m = (e as { message?: string }).message;
          if (typeof m === 'string' && m.trim()) parts.push(m.trim());
        } else if (e && typeof e === 'object' && 'description' in e) {
          const d = (e as { description?: string }).description;
          if (typeof d === 'string' && d.trim()) parts.push(d.trim());
        }
      }
    };
    add(itemErrors);
    add(resultErrors);
    if (parts.length === 0 && typeof fallbackMessage === 'string' && fallbackMessage.trim()) {
      parts.push(fallbackMessage.trim());
    }
    return [...new Set(parts)];
  }

  private extractOzonImportError(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null;
    const d = data as Record<string, unknown>;
    const details = d.details as Array<{ message?: string; code?: string; description?: string }> | undefined;
    if (Array.isArray(details) && details.length > 0) {
      const parts = details
        .map((x) => x?.message ?? x?.description ?? (typeof x === 'string' ? x : null))
        .filter(Boolean);
      if (parts.length) return parts.join('; ');
    }
    const errors = d.errors as Array<string | { message?: string }> | undefined;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0];
      return typeof first === 'string' ? first : first?.message ?? null;
    }
    return (d.message as string) ?? null;
  }

  private extractOzonErrorFromAxios(error: unknown): string | null {
    if (error && typeof error === 'object' && 'response' in error) {
      const res = (error as { response?: { data?: unknown; status?: number } }).response;
      const status = res?.status;
      if (res?.data) {
        const d = res.data as Record<string, unknown>;
        // Ozon: details[], errors[], message
        const details = d.details as Array<{ message?: string; code?: string; description?: string }> | undefined;
        if (Array.isArray(details) && details.length > 0) {
          const parts = details
            .map((x) => x?.message ?? x?.description ?? (typeof x === 'string' ? x : null))
            .filter(Boolean);
          if (parts.length) return parts.join('; ');
          return (d.message as string) ?? String(details[0]);
        }
        const errors = d.errors as Array<string | { message?: string }> | undefined;
        if (Array.isArray(errors) && errors.length > 0) {
          const first = errors[0];
          const msg = typeof first === 'string' ? first : first?.message;
          if (msg) return msg;
        }
        if (d.message) return String(d.message);
        if (d.code) return `[${d.code}] ${String(d.message || '')}`.trim() || String(d.code);
      }
      if (status) return `HTTP ${status}`;
    }
    return null;
  }

  /** Поиск product_id по offer_id (для статуса skipped — товар уже на Ozon) */
  private async findProductIdByOfferId(offerId: string): Promise<number | undefined> {
    const filters = [
      { offer_id: [offerId], visibility: 'ALL' as const },
      { offer_id: [offerId], visibility: 'ARCHIVED' as const },
      { offer_id: [offerId] },
    ];
    for (const filter of filters) {
      try {
        const { data } = await firstValueFrom(
          this.httpService.post(
            `${this.API_BASE}/v3/product/list`,
            { filter, limit: 1 },
            {
              headers: {
                'Client-Id': this.config.sellerId ?? '',
                'Api-Key': this.config.apiKey,
                'Content-Type': 'application/json',
              },
            },
          ),
        );
        const items = data?.result?.items ?? [];
        const first = items[0];
        if (first?.product_id) return first.product_id;
      } catch {
        // пробуем следующий фильтр
      }
    }
    return undefined;
  }

  /**
   * Получить остатки с Ozon. POST /v4/product/info/stocks
   */
  async getProductStocks(offerIds: string[]): Promise<{ items: Array<{ offer_id?: string; product_id?: number; stock?: number; warehouse_id?: number }> }> {
    const { data } = await firstValueFrom(
      this.httpService.post<{ result?: { items?: unknown[] } }>(
        `${this.API_BASE}/v4/product/info/stocks`,
        { filter: { visibility: 'ALL', offer_id: offerIds } },
        {
          headers: this.ozonHeaders(),
          timeout: 15000,
        },
      ),
    );
    const items = (data?.result?.items ?? []) as Array<{ offer_id?: string; product_id?: number; stock?: number; warehouse_id?: number }>;
    return { items };
  }

  /**
   * Остатки FBO (на складах Ozon) — товар на складах Ozon, не на нашем FBS-складе.
   * POST /v4/product/info/stocks. Два типа запросов (product_id + offer_id), батчинг по 100, пагинация.
   * Возвращает Record: ключ = product_id или offer_id (для маппинга в сервисе).
   */
  async getStocksFbo(params: {
    productIds: number[];
    offerIds: string[];
  }): Promise<Record<string, number>> {
    const { productIds, offerIds } = params;
    if (productIds.length === 0 && offerIds.length === 0) return {};
    const ourWarehouseId = this.config.warehouseId ? parseInt(this.config.warehouseId, 10) : 0;
    const result: Record<string, number> = {};
    const BATCH = 100;

    const parseItems = (items: Array<{ offer_id?: string; product_id?: number; stock?: number; stocks?: Array<{ warehouse_id?: number; type?: string; present?: number }> }>) => {
      for (const item of items) {
        let fboStock = 0;
        if (Array.isArray(item.stocks) && item.stocks.length > 0) {
          for (const s of item.stocks) {
            const type = (s.type ?? '').toLowerCase();
            const whId = s.warehouse_id ?? 0;
            const present = Number(s.present ?? 0);
            if (type === 'fbo') {
              fboStock += present;
            } else if (ourWarehouseId > 0 && whId > 0 && whId !== ourWarehouseId) {
              fboStock += present;
            } else if (ourWarehouseId <= 0 && type !== 'fbs') {
              fboStock += present;
            }
          }
        } else if (item.stock != null) {
          fboStock = Number(item.stock);
        }
        if (fboStock > 0) {
          if (item.product_id != null) result[String(item.product_id)] = fboStock;
          if (item.offer_id?.trim()) result[item.offer_id.trim()] = fboStock;
        }
      }
    };

    const fetchBatch = async (
      filter: { visibility: string; product_id?: number[]; offer_id?: string[] },
    ): Promise<void> => {
      const isProductId = 'product_id' in filter && filter.product_id != null;
      const ids = (filter.product_id ?? filter.offer_id ?? []) as number[] | string[];
      for (let offset = 0; offset < ids.length; offset += BATCH) {
        const batch = isProductId
          ? (ids as number[]).slice(offset, offset + BATCH)
          : (ids as string[]).slice(offset, offset + BATCH);
        if (batch.length === 0) break;
        let lastId: string | undefined;
        do {
          const f = { visibility: 'ALL' as const, ...(isProductId ? { product_id: batch } : { offer_id: batch }) };
          const body: { filter: typeof f; limit?: number; last_id?: string } = { filter: f, limit: 1000 };
          if (lastId) body.last_id = lastId;
          const { data } = await firstValueFrom(
            this.httpService.post<{ result?: { items?: unknown[]; last_id?: string }; items?: unknown[] }>(
              `${this.API_BASE}/v4/product/info/stocks`,
              body,
              { headers: this.ozonHeaders(), timeout: 15000 },
            ),
          );
          const items = (data?.result?.items ?? data?.items ?? []) as Array<{
            offer_id?: string;
            product_id?: number;
            stock?: number;
            stocks?: Array<{ warehouse_id?: number; type?: string; present?: number }>;
          }>;
          parseItems(items);
          lastId = data?.result?.last_id;
        } while (lastId);
      }
    };

    try {
      if (productIds.length > 0) {
        await fetchBatch({ visibility: 'ALL', product_id: productIds });
      }
      if (offerIds.length > 0) {
        await fetchBatch({ visibility: 'ALL', offer_id: offerIds });
      }
      return result;
    } catch (error) {
      this.logError(error, 'getStocksFbo');
      return {};
    }
  }

  /**
   * Диагностика: сырой ответ Ozon v4/product/info/stocks. Один запрос (первый batch).
   */
  async getStocksFboRaw(params: {
    productIds: number[];
    offerIds: string[];
  }): Promise<{ request: object; response: unknown; parsed: Record<string, number> }> {
    const { productIds, offerIds } = params;
    const filter: { visibility: string; product_id?: number[]; offer_id?: string[] } = { visibility: 'ALL' };
    if (productIds.length > 0) filter.product_id = productIds.slice(0, 100);
    else if (offerIds.length > 0) filter.offer_id = offerIds.slice(0, 100);
    const request = { filter, limit: 1000 };
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<{ result?: { items?: unknown[] }; items?: unknown[] }>(
          `${this.API_BASE}/v4/product/info/stocks`,
          request,
          { headers: this.ozonHeaders(), timeout: 15000, validateStatus: () => true },
        ),
      );
      const items = (data?.result?.items ?? data?.items ?? []) as Array<{
        offer_id?: string;
        product_id?: number;
        stock?: number;
        stocks?: Array<{ warehouse_id?: number; type?: string; present?: number }>;
      }>;
      const parsed: Record<string, number> = {};
      for (const item of items) {
        let fboStock = 0;
        if (Array.isArray(item.stocks) && item.stocks.length > 0) {
          for (const s of item.stocks) {
            if ((s.type ?? '').toLowerCase() === 'fbo') fboStock += Number(s.present ?? 0);
          }
        } else if (item.stock != null) {
          fboStock = Number(item.stock);
        }
        if (fboStock > 0) {
          if (item.product_id != null) parsed[String(item.product_id)] = fboStock;
          if (item.offer_id?.trim()) parsed[item.offer_id.trim()] = fboStock;
        }
      }
      return { request, response: data, parsed };
    } catch (err) {
      return { request, response: { error: err instanceof Error ? err.message : String(err) }, parsed: {} };
    }
  }

  /**
   * Отправить остатки на Ozon и вернуть полный ответ (для диагностики).
   */
  async setStockWithResponse(
    offerId: string,
    productId: string,
    stock: number,
  ): Promise<{ request: object; response: unknown; status: number }> {
    if (!this.config.warehouseId || !this.config.sellerId) {
      throw new Error('warehouseId и sellerId обязательны для обновления остатков Ozon');
    }
    const warehouseId = this.config.warehouseId.trim();
    const warehouseIdNum = Number(warehouseId);
    if (isNaN(warehouseIdNum) || warehouseIdNum <= 0) {
      throw new Error(`Некорректный warehouse_id: ${warehouseId}`);
    }
    const body = {
      stocks: [{ offer_id: offerId, product_id: Number(productId), stock, warehouse_id: warehouseIdNum }],
    };
    const res = await firstValueFrom(
      this.httpService.post(`${this.API_BASE}/v2/products/stocks`, body, {
        headers: this.ozonHeaders(),
        validateStatus: () => true,
      }),
    );
    return { request: body, response: res.data, status: res.status };
  }

  /**
   * Обновить остатки на Ozon.
   * API: POST /v2/products/stocks (ProductAPI_ProductsStocksV2).
   * Документация: https://docs.ozon.ru/api/seller/#operation/ProductAPI_ProductsStocksV2
   */
  private async setStock(offerId: string, productId: string, stock: number): Promise<void> {
    if (!this.config.warehouseId || !this.config.sellerId) {
      throw new Error('warehouseId и sellerId обязательны для обновления остатков Ozon');
    }
    const warehouseId = this.config.warehouseId.trim();
    const warehouseIdNum = Number(warehouseId);
    if (isNaN(warehouseIdNum) || warehouseIdNum <= 0) {
      throw new Error(`Некорректный warehouse_id: ${warehouseId}. Получите ID через «Загрузить склады» в настройках Ozon.`);
    }
    // Уникальный ID запроса для обхода дедупликации Ozon
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const body = {
      stocks: [
        {
          offer_id: offerId,
          product_id: Number(productId),
          stock,
          warehouse_id: warehouseIdNum,
          // Уникальный ID для каждого запроса — Ozon не дедуплицирует
          update_uid: requestId,
        },
      ],
    };
    try {
      this.logger.log(`Ozon setStock: отправка stock=${stock} для product_id=${productId}, requestId=${requestId}`);
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.API_BASE}/v2/products/stocks`,
          body,
          {
            headers: {
              'Client-Id': this.config.sellerId,
              'Api-Key': this.config.apiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      this.logger.log(`Ozon setStock: успешно для product_id=${productId}, response=${JSON.stringify(data)}`);
    } catch (error) {
      const ozonMsg = this.extractOzonErrorFromAxios(error);
      this.logError(error, 'setStock');
      throw new Error(
        ozonMsg ||
          `Ozon setStock: offer_id=${offerId}, product_id=${productId}, warehouse_id=${warehouseId} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async updateProduct(
    marketplaceProductId: string,
    product: Partial<ProductData>,
  ): Promise<boolean> {
    try {
      const productIdNum = parseInt(marketplaceProductId, 10);
      if (isNaN(productIdNum)) {
        throw new Error('Некорректный product_id Ozon');
      }

      const headers = {
        'Client-Id': this.config.sellerId ?? '',
        'Api-Key': this.config.apiKey,
        'Content-Type': 'application/json',
      };

      // Остаток: по product_id и offer_id (offer_id нужен для склада)
      // Для старых товаров externalArticle в маппинге может быть пустым или не совпадать с Ozon.
      // Получаем фактический offer_id через API — гарантирует корректную передачу остатков.
      if (product.stock !== undefined) {
        if (!this.config.warehouseId || !this.config.sellerId) {
          throw new Error(
            'Для обновления остатков Ozon укажите ID склада в настройках подключения (Маркетплейсы → Ozon → Склад).',
          );
        }
        this.lastStockOfferIdResolved = undefined;
        let offerId: string;
        const ozonInfo = await this.getProductInfoByProductId(marketplaceProductId);
        const actualOfferId = (ozonInfo?.offer_id ?? '').toString().trim();
        if (actualOfferId) {
          offerId = this.sanitizeOfferId(actualOfferId);
          this.lastStockOfferIdResolved = {
            productId: (product.id ?? '').toString(),
            externalSystemId: marketplaceProductId,
            offerId,
          };
        } else {
          const rawOffer = (product.vendorCode ?? product.id ?? '').toString();
          offerId = rawOffer ? this.sanitizeOfferId(rawOffer) : `HS_${(product.id ?? '').toString().slice(0, 8)}`;
        }
        await this.setStock(offerId, marketplaceProductId, product.stock);
      }

      // Обновление описания, названия, изображений и атрибутов через v3/product/import (Ozon обновляет по offer_id)
      const hasContentUpdate =
        product.name != null ||
        product.description != null ||
        (product.images != null && product.images.length > 0) ||
        product.weight != null ||
        product.width != null ||
        product.length != null ||
        product.height != null ||
        product.brand != null ||
        product.color != null ||
        product.material != null ||
        product.craftType != null ||
        product.countryOfOrigin != null ||
        product.packageContents != null ||
        product.richContent != null ||
        product.itemsPerPack != null;
      if (hasContentUpdate && product.vendorCode && product.name) {
        const validImages = product.images?.filter((u) => typeof u === 'string' && u.startsWith('http')) ?? [];
        if (validImages.length > 0) {
          try {
            const fullProduct: ProductData = {
              id: product.id ?? '',
              name: product.name,
              description: product.description ?? '',
              price: product.price ?? 1,
              stock: product.stock ?? 0,
              images: validImages,
              vendorCode: product.vendorCode,
              barcode: product.barcodeOzon ?? product.barcode,
              brand: product.brand,
              weight: product.weight,
              width: product.width,
              length: product.length,
              height: product.height,
              color: product.color,
              material: product.material,
              craftType: product.craftType,
              countryOfOrigin: product.countryOfOrigin,
              packageContents: product.packageContents,
              richContent: product.richContent,
              itemsPerPack: product.itemsPerPack,
              ozonCategoryId: product.ozonCategoryId,
              ozonTypeId: product.ozonTypeId,
              barcodeOzon: product.barcodeOzon,
            };
            const { item } = this.buildImportPayload(fullProduct);
            const { status: httpStatus, data } = await firstValueFrom(
              this.httpService.post(
                `${this.API_BASE}/v3/product/import`,
                { items: [item] },
                { headers, validateStatus: () => true },
              ),
            );
            if (httpStatus >= 400 || data?.code || data?.message) {
              this.logger.warn(`Ozon v3/import (update) HTTP ${httpStatus}: ${JSON.stringify(data)}`);
            }
          } catch (contentErr) {
            this.logger.warn('Ozon v3/import (content update) failed:', contentErr);
            // Не падаем — цена и остаток уже обновлены
          }
        }
      }

      return true;
    } catch (error) {
      const ozonMsg = this.extractOzonErrorFromAxios(error);
      this.logError(error, 'updateProduct');
      const msg =
        ozonMsg ||
        (error instanceof Error ? error.message : String(error)) ||
        'Неизвестная ошибка';
      throw new Error(`Ozon: ${msg}`);
    }
  }

  async deleteProduct(marketplaceProductId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.post(
          `${this.API_BASE}/v1/product/archive`,
          { product_id: [Number(marketplaceProductId)] },
          {
            headers: {
              'Client-Id': this.config.sellerId ?? '',
              'Api-Key': this.config.apiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return true;
    } catch (error) {
      this.logError(error, 'deleteProduct');
      return false;
    }
  }

  async getOrders(since?: Date): Promise<OrderData[]> {
    const dateFrom = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const headers = {
      'Client-Id': this.config.sellerId ?? '',
      'Api-Key': this.config.apiKey,
      'Content-Type': 'application/json',
    };

    type Posting = {
      posting_number: string;
      products?: Array<{ product_id?: number; sku?: number; offer_id?: string; price?: number }>;
      customer_name?: string;
      phone?: string;
      address?: { address_tail?: string };
      status: string;
      created_at: string;
    };

    const toOrderData = (posting: Posting, isFbo = false): OrderData => {
      const p0 = posting.products?.[0];
      const productId = p0?.product_id != null ? String(p0.product_id)
        : p0?.sku != null ? String(p0.sku)
        : '';
      return {
      id: posting.posting_number,
      marketplaceOrderId: posting.posting_number,
      productId,
      customerName: posting.customer_name ?? 'Аноним',
      customerPhone: posting.phone,
      deliveryAddress: posting.address?.address_tail,
      status: posting.status,
      rawStatus: posting.status, // для подсчёта «отказ покупателя» vs «отмена продавца»
      amount: posting.products?.reduce((sum: number, p) => sum + (p.price ?? 0), 0) ?? 0,
      createdAt: new Date(posting.created_at),
      isFbo,
    };
    };

    const seen = new Set<string>();
    const result: OrderData[] = [];

    // FBS — собственные склады
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.API_BASE}/v3/posting/fbs/list`,
          {
            dir: 'asc',
            filter: { since: dateFrom.toISOString(), status: 'all' },
            limit: 1000,
            offset: 0,
            with: { analytics_data: true, financial_data: true },
          },
          { headers, timeout: 15000 },
        ),
      );
      for (const p of data?.result ?? []) {
        const posting = p as Posting;
        if (!seen.has(posting.posting_number)) {
          seen.add(posting.posting_number);
          result.push(toOrderData(posting, false));
        }
      }
    } catch (error) {
      this.logError(error, 'getOrders FBS');
    }

    // FBO — склады Ozon (Fulfillment by Ozon). Товар со склада Ozon — не списывать «Мой склад».
    try {
      let offset = 0;
      const limit = 500;
      while (true) {
        const { data } = await firstValueFrom(
          this.httpService.post(
            `${this.API_BASE}/v2/posting/fbo/list`,
            {
              dir: 'asc',
              filter: { since: dateFrom.toISOString(), to: new Date().toISOString() },
              limit,
              offset,
            },
            { headers, timeout: 15000 },
          ),
        );
        const items = (data?.result ?? data?.postings ?? []) as Posting[];
        for (const posting of items) {
          if (posting?.posting_number && !seen.has(posting.posting_number)) {
            seen.add(posting.posting_number);
            result.push(toOrderData(posting, true));
          }
        }
        if (items.length < limit) break;
        offset += limit;
      }
    } catch (error) {
      this.logError(error, 'getOrders FBO');
    }

    return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Финансовые транзакции — логистика и комиссии по отправлениям.
   * POST /v3/finance/transaction/list. Требует права «Финансы» у API ключа.
   * @returns Map<posting_number, { logisticsCost, commissionAmount }>
   */
  async getOrderCostsFromFinance(
    dateFrom: Date,
    dateTo: Date,
    postingNumbers?: string[],
  ): Promise<Map<string, { logisticsCost: number; commissionAmount: number }>> {
    const result = new Map<string, { logisticsCost: number; commissionAmount: number }>();
    let page = 1;
    const pageSize = 100;

    const headers = {
      'Client-Id': this.config.sellerId ?? '',
      'Api-Key': this.config.apiKey,
      'Content-Type': 'application/json',
    };

    const operationTypes = [
      'ClientOrderDelivered',
      'ClientOrderDeliveredToCustomer',
      'ClientOrderDeliveredToCustomerReturn',
    ];

    while (true) {
      const filter: Record<string, unknown> = {
        date: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
        operation_type: operationTypes,
      };
      if (postingNumbers?.length) {
        filter.posting_number = postingNumbers[0];
      }
      const body = { filter, page, page_size: pageSize };

      const { data } = await firstValueFrom(
        this.httpService.post<{ result?: { operations?: unknown[]; row_count?: number } }>(
          `${this.API_BASE}/v3/finance/transaction/list`,
          body,
          { headers },
        ),
      );

      const ops = data?.result?.operations ?? [];
      if (!Array.isArray(ops) || ops.length === 0) break;

      for (const op of ops as Array<Record<string, unknown>>) {
        const posting = op.posting as Record<string, unknown> | undefined;
        const postingNumber = posting ? String(posting.posting_number ?? '').trim() : '';
        if (!postingNumber) continue;

        const deliveryCharge = Number(op.delivery_charge ?? 0);
        const saleCommission = Number(op.sale_commission ?? 0);

        const existing = result.get(postingNumber);
        if (existing) {
          existing.logisticsCost += deliveryCharge;
          existing.commissionAmount += saleCommission;
        } else {
          result.set(postingNumber, {
            logisticsCost: deliveryCharge,
            commissionAmount: saleCommission,
          });
        }
      }

      const rowCount = data?.result?.row_count ?? 0;
      if (ops.length < pageSize || page * pageSize >= rowCount) break;
      page++;
    }

    return result;
  }

  async updateOrderStatus(
    marketplaceOrderId: string,
    status: string,
    _options?: {
      wbStickerNumber?: string;
      wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW';
      wbSupplyId?: string;
    },
  ): Promise<boolean> {
    try {
      if (status === 'SHIPPED') {
        await firstValueFrom(
          this.httpService.post(
            `${this.API_BASE}/v2/posting/fbs/ship`,
            { posting_number: marketplaceOrderId },
            {
              headers: {
                'Client-Id': this.config.sellerId ?? '',
                'Api-Key': this.config.apiKey,
                'Content-Type': 'application/json',
              },
            },
          ),
        );
      }
      return true;
    } catch (error) {
      this.logError(error, 'updateOrderStatus');
      return false;
    }
  }

  /**
   * @deprecated Метод устарел. Ozon автоматически генерирует штрих-код (OZN...) при импорте товара
   * через /v3/product/import, если поле barcode не передано. Ручной вызов генерации не требуется.
   * Endpoint /v1/barcode/generate удалён Ozon в 2024 году.
   */
  async generateBarcodes(productIds: string[]): Promise<void> {
    this.logger.warn(
      `generateBarcodes(${productIds.length} items): метод устарел. ` +
      'Ozon автоматически генерирует штрих-код при импорте. ' +
      'Документация: https://docs.ozon.ru/api/seller/#operation/ProductAPI_ProductsImportV3'
    );
    // Нет необходимости вызывать API — Ozon генерирует штрих-код автоматически
    return Promise.resolve();
  }

  /**
   * Получить штрих-код товара Ozon.
   * Приоритет: product_id из маппинга (надёжнее) → offer_id.
   * Важно: не подставлять данные WB — каждый маркет имеет свой штрих-код.
   */
  async getBarcodeByProductId(ozonProductId: string, offerId?: string): Promise<string | null> {
    // product_id из маппинга — однозначная связка с Ozon
    if (ozonProductId && !isNaN(parseInt(ozonProductId, 10))) {
      const byProduct = this.extractBarcode(await this.getProductInfoByProductId(ozonProductId));
      if (byProduct) return byProduct;
    }
    // fallback по offer_id (артикул)
    if (offerId) {
      const byOffer = this.extractBarcode(await this.getProductInfoByOfferId(offerId));
      if (byOffer) return byOffer;
    }
    return null;
  }

  private extractBarcode(info: Record<string, unknown> | null): string | null {
    if (!info || typeof info !== 'object') return null;
    const bc = info.barcodes;
    if (Array.isArray(bc) && bc.length > 0) {
      for (const item of bc) {
        const s = typeof item === 'string' ? item : (item && typeof item === 'object' && 'barcode' in item ? (item as { barcode?: string }).barcode : (item as { value?: string })?.value);
        if (typeof s === 'string' && s.trim()) return s.trim();
      }
    }
    const b = info.barcode;
    if (typeof b === 'string' && b.trim()) return b.trim();
    // Ozon иногда возвращает штрих-код во вложенных sku (fbs_list, fbo_list)
    const trySkuBarcode = (arr: unknown): string | null => {
      if (!Array.isArray(arr) || arr.length === 0) return null;
      const first = arr[0];
      if (first && typeof first === 'object' && 'barcode' in first) {
        const v = (first as { barcode?: string }).barcode;
        if (typeof v === 'string' && v.trim()) return v.trim();
      }
      return null;
    };
    const fbs = trySkuBarcode(info.fbs_list ?? info.fbo_list);
    if (fbs) return fbs;
    return null;
  }

  /**
   * Получить информацию о товаре Ozon по product_id.
   */
  async getProductInfoByProductId(ozonProductId: string): Promise<{ id?: number; offer_id?: string; barcode?: string; barcodes?: string[] | Array<{ barcode?: string }>; name?: string } | null> {
    const res = await this.getProductInfoByProductIdWithRaw(ozonProductId);
    const item = res?.item;
    if (!item || typeof item !== 'object' || Object.keys(item).length === 0) return null;
    return item as { id?: number; offer_id?: string; barcode?: string; barcodes?: string[] | Array<{ barcode?: string }>; name?: string };
  }

  /** Диагностика: полный ответ Ozon v3/product/info/list по product_id */
  async getProductInfoByProductIdWithRaw(ozonProductId: string): Promise<{ item: Record<string, unknown>; raw: unknown } | null> {
    try {
      const productIdNum = parseInt(ozonProductId, 10);
      if (isNaN(productIdNum)) return null;
      const body = { product_id: [productIdNum] };
      const { data, status } = await firstValueFrom(
        this.httpService.post(
          `${this.API_BASE}/v3/product/info/list`,
          body,
          {
            headers: {
              'Client-Id': this.config.sellerId ?? '',
              'Api-Key': this.config.apiKey,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
            validateStatus: () => true,
          },
        ),
      );
      // Ozon может вернуть items в result.items или в другом пути
      const items = (data?.result?.items ?? data?.items ?? []) as Array<Record<string, unknown>>;
      const item = items[0] ?? null;
      if (!item && status === 200) {
        this.logger.warn(`Ozon v3/product/info/list: пустой items при product_id=${productIdNum}, status=${status}, keys=${Object.keys(data ?? {}).join(',')}`);
      }
      return { item: item as Record<string, unknown>, raw: { status, data } };
    } catch (err) {
      this.logError(err, 'getProductInfoByProductIdWithRaw');
      return null;
    }
  }

  /**
   * Получить информацию о товаре Ozon по offer_id (артикул).
   * 1) v3/product/list (filter offer_id) → v3/product/info/list (product_id)
   * 2) Fallback: v3/product/info/list с offer_id напрямую
   */
  async getProductInfoByOfferId(offerId: string): Promise<{ id?: number; offer_id?: string; name?: string; barcode?: string; barcodes?: string[] | Array<{ barcode?: string }> } | null> {
    const res = await this.getProductInfoByOfferIdWithRaw(offerId);
    return (res?.item ?? null) as { id?: number; offer_id?: string; name?: string; barcode?: string; barcodes?: string[] | Array<{ barcode?: string }> } | null;
  }

  /** Диагностика: полный ответ Ozon по offer_id */
  async getProductInfoByOfferIdWithRaw(offerId: string): Promise<{ item: Record<string, unknown>; raw: unknown } | null> {
    const offerIdSanitized = offerId ? this.sanitizeOfferId(offerId) : '';
    if (!offerIdSanitized) return null;
    const productId = await this.findProductIdByOfferId(offerIdSanitized);
    if (productId) {
      const byProduct = await this.getProductInfoByProductIdWithRaw(String(productId));
      if (byProduct?.item) return { item: byProduct.item, raw: byProduct.raw };
    }
    try {
      const { data, status } = await firstValueFrom(
        this.httpService.post(
          `${this.API_BASE}/v3/product/info/list`,
          { offer_id: [offerIdSanitized] },
          {
            headers: {
              'Client-Id': this.config.sellerId ?? '',
              'Api-Key': this.config.apiKey,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
            validateStatus: () => true,
          },
        ),
      );
      const items = (data?.result?.items ?? []) as Array<{ id?: number; offer_id?: string; name?: string; barcode?: string; barcodes?: unknown }>;
      const item = items[0] ?? null;
      return { item, raw: { status, data } };
    } catch {
      return null;
    }
  }

  /**
   * Диагностика: сырой ответ /v3/product/list для отладки импорта.
   */
  async getProductListRaw(): Promise<{ status: number; data: unknown; error?: string }> {
    try {
      const res = await firstValueFrom(
        this.httpService.post(
          `${this.API_BASE}/v3/product/list`,
          { filter: { visibility: 'ALL' }, limit: 10 },
          {
            headers: {
              'Client-Id': this.config.sellerId ?? '',
              'Api-Key': this.config.apiKey,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
            validateStatus: () => true,
          },
        ),
      );
      return { status: res.status, data: res.data };
    } catch (err) {
      return {
        status: 0,
        data: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Получение списка товаров с Ozon для импорта в каталог.
   * v3/product/list → v3/product/info/list (пачками).
   */
  async getProductsFromOzon(): Promise<
    Array<{
      productId: number;
      offerId: string;
      name: string;
      description?: string;
      imageUrl?: string;
      price?: number;
      barcode?: string;
      weight?: number;
      width?: number;
      height?: number;
      length?: number;
      ozonCategoryId?: number;
      ozonTypeId?: number;
    }>
  > {
    const items: Array<{ product_id: number; offer_id: string }> = [];
    let lastId: string | undefined;
    do {
      const body: Record<string, unknown> = {
        filter: { visibility: 'ALL' },
        limit: 100,
      };
      if (lastId) body.last_id = lastId;
      this.logger.log(`[getProductsFromOzon] /v3/product/list lastId=${lastId ?? 'none'}, sellerId=${this.config.sellerId}`);
      let data: unknown;
      try {
        const res = await firstValueFrom(
          this.httpService.post(`${this.API_BASE}/v3/product/list`, body, {
            headers: {
              'Client-Id': this.config.sellerId ?? '',
              'Api-Key': this.config.apiKey,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          }),
        );
        data = res.data;
      } catch (err) {
        this.logger.error(`[getProductsFromOzon] /v3/product/list error: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
      const result = (data as Record<string, unknown>)?.result ?? data;
      const total = (result as Record<string, unknown>)?.total;
      const pageItems = ((result as Record<string, unknown>)?.items ?? (data as Record<string, unknown>)?.items ?? []) as Array<{
        product_id?: number;
        offer_id?: string;
        sku?: number;
      }>;
      this.logger.log(`[getProductsFromOzon] /v3/product/list total=${total}, items=${pageItems.length}`);
      for (const it of pageItems) {
        const pid = it?.product_id ?? it?.sku ?? 0;
        const oid = (it?.offer_id ?? '').toString().trim();
        if (pid && oid) items.push({ product_id: pid, offer_id: oid });
      }
      lastId = (result as Record<string, unknown>)?.last_id as string | undefined;
      if (!lastId || pageItems.length === 0) break;
    } while (true);
    this.logger.log(`[getProductsFromOzon] Total items collected: ${items.length}`);

    const out: Array<{
      productId: number;
      offerId: string;
      name: string;
      description?: string;
      imageUrl?: string;
      price?: number;
      barcode?: string;
      weight?: number;
      width?: number;
      height?: number;
      length?: number;
      ozonCategoryId?: number;
      ozonTypeId?: number;
    }> = [];
    // Используем /v3/product/info/list с product_id (Ozon API принимает product_id или offer_id)
    const productIds = items.map((it) => it.product_id).filter((id): id is number => id > 0);
    this.logger.log(`[getProductsFromOzon] Fetching details for ${productIds.length} products via /v3/product/info/list`);
    const BATCH_SIZE = 100;
    for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
      const batch = productIds.slice(i, i + BATCH_SIZE);
      try {
        const { data } = await firstValueFrom(
          this.httpService.post(
            `${this.API_BASE}/v3/product/info/list`,
            { product_id: batch },
            {
              headers: {
                'Client-Id': this.config.sellerId ?? '',
                'Api-Key': this.config.apiKey,
                'Content-Type': 'application/json',
              },
              timeout: 30000,
            },
          ),
        );
        const result = (data as Record<string, unknown>)?.result ?? data;
        const infoItems = ((result as Record<string, unknown>)?.items ?? []) as Array<{
        id?: number;
        offer_id?: string;
        name?: string;
        description?: string;
        source?: { item_id?: number; attribute_id?: number; value?: string }[];
        images?: string[];
        marketing_price?: string;
        price?: string;
        old_price?: string;
        barcode?: string;
        barcodes?: string[] | Array<{ barcode?: string }>;
        weight?: number;
        height?: number;
        width?: number;
        depth?: number;
        description_category_id?: number;
        type_id?: number;
      }>;
      this.logger.log(`[getProductsFromOzon] /v3/product/info/list batch returned ${infoItems.length} items`);
      for (const inf of infoItems) {
        const pid = inf?.id ?? 0;
        const offerId = (inf?.offer_id ?? '').toString().trim();
        const name = (inf?.name ?? `Товар ${pid}`).trim().slice(0, 500);
        if (!name) {
          this.logger.warn(`[getProductsFromOzon] Skipping product ${pid}: empty name`);
          continue;
        }
        let description: string | undefined;
        if (typeof inf?.description === 'string' && inf.description.trim()) {
          description = inf.description.slice(0, 5000);
        } else if (Array.isArray(inf?.source)) {
          const attr4190 = inf.source.find((a: { attribute_id?: number; value?: string }) => a?.attribute_id === 4190);
          if (attr4190?.value) description = attr4190.value.slice(0, 5000);
        }
        const images = inf?.images ?? [];
        const imageUrl = Array.isArray(images) && images.length > 0
          ? (typeof images[0] === 'string' ? images[0] : (images[0] as { url?: string })?.url)
          : undefined;
        const priceStr = inf?.marketing_price ?? inf?.price ?? inf?.old_price;
        const price = priceStr != null ? parseFloat(String(priceStr)) : undefined;
        const barcode = this.extractBarcode(inf);
        const catId = inf?.description_category_id;
        const typeId = inf?.type_id;
        out.push({
          productId: pid,
          offerId,
          name,
          description,
          imageUrl: imageUrl || undefined,
          price: typeof price === 'number' && !isNaN(price) ? price : undefined,
          barcode: barcode || undefined,
          weight: inf?.weight,
          width: inf?.width,
          height: inf?.height,
          length: inf?.depth,
          ozonCategoryId: typeof catId === 'number' && catId > 0 ? catId : undefined,
          ozonTypeId: typeof typeId === 'number' && typeId > 0 ? typeId : undefined,
        });
      }
      } catch (err) {
        this.logger.error(`[getProductsFromOzon] /v3/product/info/list batch error: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    }
    this.logger.log(`[getProductsFromOzon] Returning ${out.length} products`);
    return out;
  }

  /**
   * Получить один товар с Ozon по product_id или sku — для автосоздания при синхронизации заказа.
   * FBO posting может возвращать sku вместо product_id; v3/product/info/list принимает оба.
   */
  async getProductFromOzonByProductId(ozonProductId: string): Promise<{
    productId: number;
    offerId: string;
    name: string;
    description?: string;
    imageUrl?: string;
    price?: number;
    barcode?: string;
    weight?: number;
    width?: number;
    height?: number;
    length?: number;
    ozonCategoryId?: number;
    ozonTypeId?: number;
  } | null> {
    const pid = parseInt(ozonProductId, 10);
    if (isNaN(pid) || pid <= 0) return null;
    const tryFetch = async (body: { product_id?: number[]; sku?: number[] }) => {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.API_BASE}/v3/product/info/list`,
          body,
          { headers: this.ozonHeaders(), timeout: 10000 },
        ),
      );
      const result = (data as Record<string, unknown>)?.result ?? data;
      return ((result as Record<string, unknown>)?.items ?? []) as Array<{
        id?: number;
        offer_id?: string;
        name?: string;
        description?: string;
        source?: { attribute_id?: number; value?: string }[];
        images?: string[];
        marketing_price?: string;
        price?: string;
        old_price?: string;
        weight?: number;
        height?: number;
        width?: number;
        depth?: number;
        description_category_id?: number;
        type_id?: number;
      }>;
    };
    const parseItem = (inf: { id?: number; offer_id?: string; name?: string; description?: string; source?: { attribute_id?: number; value?: string }[]; images?: string[]; marketing_price?: string; price?: string; old_price?: string; weight?: number; height?: number; width?: number; depth?: number; description_category_id?: number; type_id?: number }) => {
      const offerId = (inf.offer_id ?? '').toString().trim();
      const name = (inf.name ?? `Товар ${pid}`).trim().slice(0, 500);
      if (!name) return null;
      let description: string | undefined;
      if (typeof inf.description === 'string' && inf.description.trim()) {
        description = inf.description.slice(0, 5000);
      } else if (Array.isArray(inf.source)) {
        const attr4190 = inf.source.find((a) => a?.attribute_id === 4190);
        if (attr4190?.value) description = attr4190.value.slice(0, 5000);
      }
      const images = inf.images ?? [];
      const imageUrl = Array.isArray(images) && images.length > 0
        ? (typeof images[0] === 'string' ? images[0] : (images[0] as { url?: string })?.url)
        : undefined;
      const priceStr = inf.marketing_price ?? inf.price ?? inf.old_price;
      const price = priceStr != null ? parseFloat(String(priceStr)) : undefined;
      const barcode = this.extractBarcode(inf);
      const catId = inf.description_category_id;
      const typeId = inf.type_id;
      return {
        productId: inf.id ?? pid,
        offerId,
        name,
        description,
        imageUrl: imageUrl || undefined,
        price: typeof price === 'number' && !isNaN(price) ? price : undefined,
        barcode: barcode || undefined,
        weight: inf.weight,
        width: inf.width,
        height: inf.height,
        length: inf.depth,
        ozonCategoryId: typeof catId === 'number' && catId > 0 ? catId : undefined,
        ozonTypeId: typeof typeId === 'number' && typeId > 0 ? typeId : undefined,
      };
    };
    try {
      let items = await tryFetch({ product_id: [pid] });
      if (!items.length) items = await tryFetch({ sku: [pid] });
      const inf = items[0];
      if (!inf) return null;
      return parseItem(inf);
    } catch (err) {
      this.logError(err, 'getProductFromOzonByProductId');
      return null;
    }
  }

  async syncProducts(products: ProductData[]): Promise<SyncResult> {
    const result: SyncResult = { success: true, syncedCount: 0, failedCount: 0, errors: [], createdMappings: [] };
    for (const product of products) {
      try {
        if (product.ozonProductId) {
          const ok = await this.updateProduct(product.ozonProductId, product);
          if (ok) {
            result.syncedCount++;
            if (this.lastStockOfferIdResolved?.productId === product.id) {
              result.updatedMappings = result.updatedMappings ?? [];
              result.updatedMappings.push({
                productId: this.lastStockOfferIdResolved.productId,
                externalSystemId: this.lastStockOfferIdResolved.externalSystemId,
                externalArticle: this.lastStockOfferIdResolved.offerId,
              });
              this.lastStockOfferIdResolved = undefined;
            }
          } else {
            result.failedCount++;
            result.errors?.push(`Товар ${product.name}: ошибка обновления на Ozon`);
          }
        } else {
          const ozonProductId = await this.uploadProduct(product);
          result.syncedCount++;
          // Сохраняем фактический offer_id (после sanitize), отправленный в Ozon — для надёжной связки при setStock
          const offerId = this.sanitizeOfferId(product.vendorCode ?? `HS_${product.id.slice(0, 8)}`);
          result.createdMappings?.push({
            productId: product.id,
            externalSystemId: ozonProductId,
            externalArticle: offerId,
          });
        }
      } catch (error) {
        result.failedCount++;
        result.errors?.push(`Товар ${product.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    result.success = result.failedCount === 0;
    return result;
  }

  async getStatistics(): Promise<{
    totalProducts: number;
    totalOrders: number;
    revenue: number;
    lastSyncAt: Date;
  }> {
    try {
      // Календарный месяц: с 1-го числа текущего месяца
      const dateFrom = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const dateFromStr = dateFrom.toISOString().split('T')[0];
      const dateToStr = new Date().toISOString().split('T')[0];

      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.API_BASE}/v1/analytics/data`,
          {
            date_from: dateFromStr,
            date_to: dateToStr,
            dimension: ['day'],
            metrics: ['revenue', 'orders_count'],
            limit: 100,
          },
          {
            headers: {
              'Client-Id': this.config.sellerId ?? '',
              'Api-Key': this.config.apiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      const rows = data?.result?.data ?? [];
      const revenue = rows.reduce((sum: number, day: { metrics?: number[] }) => sum + (day.metrics?.[0] ?? 0), 0);
      const totalOrders = rows.reduce((sum: number, day: { metrics?: number[] }) => sum + (day.metrics?.[1] ?? 0), 0);

      const { data: productsData } = await firstValueFrom(
        this.httpService.post(
          `${this.API_BASE}/v2/product/list`,
          { limit: 1000, offset: 0 },
          {
            headers: {
              'Client-Id': this.config.sellerId ?? '',
              'Api-Key': this.config.apiKey,
              'Content-Type': 'application/json',
            },
          },
        ),
      );

      return {
        totalProducts: productsData?.result?.total ?? 0,
        totalOrders,
        revenue,
        lastSyncAt: new Date(),
      };
    } catch (error) {
      this.logError(error, 'getStatistics');
      return { totalProducts: 0, totalOrders: 0, revenue: 0, lastSyncAt: new Date() };
    }
  }
}
