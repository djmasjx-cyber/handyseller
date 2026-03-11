import { Injectable } from '@nestjs/common';
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

@Injectable()
export class WildberriesAdapter extends BaseMarketplaceAdapter {
  /** Content API (товары, карточки) — suppliers-api устарел с 30.01.2025 */
  private readonly CONTENT_API = 'https://content-api.wildberries.ru';
  /** Marketplace API (заказы, остатки, склады) */
  private readonly MARKETPLACE_API = 'https://marketplace-api.wildberries.ru';
  /** Statistics API (отчёты, логистика, комиссии) — reportDetailByPeriod */
  private readonly STATISTICS_API = 'https://statistics-api.wildberries.ru';
  /** Prices API */
  private readonly PRICES_API = 'https://discounts-prices-api.wildberries.ru';
  private readonly httpService: HttpService;
  /** Кэш warehouseId если не задан в конфиге */
  private cachedWarehouseId: string | null = null;
  /** Кэш nmId → chrtId (с 09.02 WB требует chrtId для остатков, не sku/nmId) */
  private chrtIdCache = new Map<number, number>();
  /** Кэш nmId → chrtIds[] (все размеры для обновления остатков) */
  private chrtIdsCache = new Map<number, number[]>();

  private authHeader(token?: string) {
    const t = token ?? this.config.apiKey;
    const auth = t.startsWith('Bearer ') ? t : `Bearer ${t}`;
    return { Authorization: auth };
  }

  constructor(
    crypto: CryptoService,
    httpService: HttpService,
    config: MarketplaceConfig,
  ) {
    super(crypto, {
      ...config,
      baseUrl: config.baseUrl || 'https://seller.wildberries.ru',
    });
    this.httpService = httpService;
  }

  /**
   * CanonicalProduct → формат WB Content API (cards).
   * Маппинг: title→nmTitle/Наименование, long_description_plain→description/Описание, vendor_code→supplierVendorCode.
   */
  /** Strip HTML tags to plain text (WB "Описание" expects plain text) */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  /** Нормализация страны: опечатка "Росиия" → "Россия", пустое → "Россия" */
  private normalizeCountry(country?: string | null): string {
    const s = (country ?? '').trim();
    if (!s) return 'Россия';
    if (/^Роси[иi]я$/i.test(s)) return 'Россия';
    return s;
  }

  /**
   * Получить charcID по имени характеристики (для маппинга наших полей на WB).
   * @param charcs - массив из getCharcsForSubject
   * @param names - варианты названия (например ['Наименование', 'наименование', 'Название'])
   */
  private findCharcIdByNames(charcs: Array<{ charcID: number; name: string }>, names: string[]): number | null {
    const lower = names.map((n) => n.toLowerCase());
    const found = charcs.find((c) => lower.some((n) => (c.name || '').toLowerCase().includes(n) || n.includes((c.name || '').toLowerCase())));
    return found?.charcID ?? null;
  }

  convertToPlatform(
    canonical: CanonicalProduct,
    barcode?: string,
    wbCharcs?: Array<{ charcID: number; name: string; required?: boolean }>,
  ): PlatformProductPayload {
    // Логируем входные данные для отладки
    console.log('[WildberriesAdapter] convertToPlatform INPUT:', {
      canonical_sku: canonical.canonical_sku,
      title: canonical.title,
      wb_subject_id: canonical.wb_subject_id,
      vendor_code: canonical.vendor_code,
      images_count: canonical.images?.length ?? 0,
      barcode: barcode ?? 'не сгенерирован',
      charcs_count: wbCharcs?.length ?? 0,
    });

    const vendorCode = canonical.vendor_code ?? canonical.canonical_sku;
    const plainDesc = canonical.long_description_plain ?? canonical.short_description ?? '';
    const richDesc = canonical.long_description_html?.trim();
    const descriptionText = richDesc
      ? (plainDesc ? `${plainDesc}\n\n${this.stripHtml(richDesc)}` : this.stripHtml(richDesc))
      : plainDesc;
    const title = (canonical.title || '').trim();

    // WB get cards/list возвращает value как массив — всегда массив для characteristics
    const toValue = (v: string | string[] | undefined): string[] =>
      Array.isArray(v) ? v.filter(Boolean).map((s) => String(s).trim()) : (v?.trim() ? [v.trim()] : []);

    const characteristics: Array<{ id: number; name?: string; value: string[] }> = [];

    if (wbCharcs && wbCharcs.length > 0) {
      // Используем charcID из API WB — обязательные поля зависят от категории
      const addChar = (names: string[], value: string | string[] | undefined) => {
        const arr = toValue(value);
        if (arr.length === 0) return;
        const id = this.findCharcIdByNames(wbCharcs!, names);
        if (id) characteristics.push({ id, value: arr });
      };
      addChar(['Наименование', 'наименование', 'Название', 'title'], title || 'Товар');
      addChar(['Описание', 'описание', 'description'], descriptionText?.trim() || 'Описание товара');
      addChar(['Цвет', 'цвет', 'color'], canonical.color?.trim());
      addChar(['Количество предметов в упаковке', 'количество'], canonical.items_per_pack != null && canonical.items_per_pack > 0 ? String(canonical.items_per_pack) : undefined);
      addChar(['Материал изделия', 'материал', 'material'], canonical.material?.trim());
      addChar(['Вид творчества', 'вид творчества', 'craft'], canonical.craft_type?.trim());
      addChar(['Комплектация', 'комплектация'], canonical.package_contents?.trim());
      for (const a of canonical.attributes ?? []) {
        const id = this.findCharcIdByNames(wbCharcs, [a.name]);
        if (id && a.value?.trim()) characteristics.push({ id, value: toValue(a.value) });
      }
      // Добавляем обязательные характеристики, которые не заполнены (дефолт для прохождения модерации)
      const addedIds = new Set(characteristics.map((c) => c.id));
      for (const c of wbCharcs) {
        if (c.required && !addedIds.has(c.charcID)) {
          characteristics.push({ id: c.charcID, value: ['Не указано'] });
          addedIds.add(c.charcID);
        }
      }
    }

    if (characteristics.length === 0) {
      // Fallback: фиксированные ID (могут не подходить для всех категорий)
      characteristics.push({ id: 0, name: 'Наименование', value: toValue(title || 'Товар') });
      characteristics.push({ id: 3, name: 'Описание', value: toValue(descriptionText || '') });
      if (canonical.color?.trim()) characteristics.push({ id: 1, name: 'Цвет', value: toValue(canonical.color) });
      if (canonical.items_per_pack != null && canonical.items_per_pack > 0) {
        characteristics.push({ id: 4, name: 'Количество предметов в упаковке', value: toValue(String(canonical.items_per_pack)) });
      }
      if (canonical.material?.trim()) characteristics.push({ id: 5, name: 'Материал изделия', value: toValue(canonical.material) });
      if (canonical.craft_type?.trim()) characteristics.push({ id: 6, name: 'Вид творчества', value: toValue(canonical.craft_type) });
      if (canonical.package_contents?.trim()) characteristics.push({ id: 7, name: 'Комплектация', value: toValue(canonical.package_contents) });
      if (canonical.attributes?.length) {
        let nextId = 100;
        for (const a of canonical.attributes) {
          const skip = ['Артикул', 'Наименование', 'Описание', 'Цвет', 'Количество предметов в упаковке', 'Материал изделия', 'Вид творчества', 'Комплектация'];
          if (!skip.includes(a.name)) {
            characteristics.push({ id: nextId++, name: a.name, value: toValue(a.value) });
          }
        }
      }
    }
    // WB: габариты в см (у нас мм), вес в кг (у нас г). Разделитель дробной части — точка.
    const w = Math.round(((canonical.width_mm ?? 100) / 10) * 100) / 100;   // mm → cm, 2 знака
    const h = Math.round(((canonical.height_mm ?? 100) / 10) * 100) / 100;
    const l = Math.round(((canonical.length_mm ?? 100) / 10) * 100) / 100;
    const weightBrutto = Math.round(((canonical.weight_grams ?? 100) / 1000) * 100) / 100; // g → kg, 2 знака

    // subjectId обязателен для создания карточки
    if (!canonical.wb_subject_id || canonical.wb_subject_id <= 0) {
      throw new Error('WB: категория (subjectId) обязательна для создания карточки товара');
    }

    const variant: Record<string, unknown> = {
      vendorCode: `${vendorCode}-1`,
      title: title || 'Товар',
      description: descriptionText?.trim() || 'Описание товара',
      brand: canonical.brand_name ?? 'Ручная работа',
      dimensions: { length: l, width: w, height: h, weightBrutto },
      characteristics,
    };

    // Штрих-код и sizes — WB требует sizes[].skus для идентификации размера
    if (barcode?.trim()) {
      variant.barcode = barcode.trim();
      const priceRub = Math.round(canonical.price ?? 1);
      // WB: для безразмерного товара не указывать techSize/wbSize — иначе «Недопустимо указывать Размер и Рос.Размер»
      variant.sizes = [
        {
          price: priceRub,
          skus: [barcode.trim()],
        },
      ];
    }

    // Формат Habr/WBSeller: subjectID + variants (без nomenclature, goods)
    const card: Record<string, unknown> = {
      subjectID: canonical.wb_subject_id,
      supplierVendorCode: vendorCode,
      countryProduction: this.normalizeCountry(canonical.country_of_origin),
      brand: canonical.brand_name ?? 'Ручная работа',
      variants: [variant],
    };

    // Фото НЕ передаём в cards/upload — WB не принимает addin при создании.
    // Загрузка фото отдельно через POST /content/v3/media/save после создания карточки (uploadImages).

    if (canonical.seo_title || canonical.seo_description || canonical.seo_keywords) {
      card.seoText = {
        title: canonical.seo_title ?? canonical.title,
        description: canonical.seo_description ?? '',
        keywords: canonical.seo_keywords ?? '',
      };
    }
    // WB Content API: принимает и { cards: [...] }, и массив [card] в корне.
    // Пробуем массив — Habr и WBSeller используют этот формат.
    return [card] as unknown as PlatformProductPayload;
  }

  /**
   * Аутентификация — проверка токена через /ping
   * WB Content API: https://content-api.wildberries.ru/ping
   */
  async authenticate(): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.httpService.get(`${this.CONTENT_API}/ping`, {
          headers: this.authHeader(),
          timeout: 10000,
        }),
      );
      return res?.data?.Status === 'OK' || res?.status === 200;
    } catch (error) {
      const axErr = error as { response?: { status?: number; data?: { detail?: string; title?: string } } };
      const status = axErr?.response?.status;
      const wbMsg = axErr?.response?.data?.detail ?? axErr?.response?.data?.title;
      if (status === 401) {
        console.warn('[WildberriesAdapter] Токен невалиден или истёк. Проверьте токен в ЛК WB.');
      } else if (wbMsg || status) {
        console.warn(`[WildberriesAdapter] authenticate: HTTP ${status} — ${wbMsg || ''}`);
      }
      this.logError(error, 'authenticate');
      return false;
    }
  }

  /**
   * Список категорий WB (subjects) для выбора при создании карточки.
   * GET /content/v2/object/all — предметы второго уровня (limit 1000, пагинация по offset).
   * Формат ответа WB: subjectID, subjectName (или subjectId, subjectName).
   */
  async getCategoryList(): Promise<Array<{ subjectId: number; subjectName: string }>> {
    const all: Array<{ subjectId: number; subjectName: string }> = [];
    const limit = 1000;
    let offset = 0;
    let hasMore = true;

    try {
      while (hasMore) {
        const { data } = await firstValueFrom(
          this.httpService.get<unknown>(
            `${this.CONTENT_API}/content/v2/object/all`,
            {
              headers: this.authHeader(),
              timeout: 20000,
              params: { limit, offset },
            },
          ),
        );

        const raw = Array.isArray(data) ? data
          : (data && typeof data === 'object')
            ? (data as Record<string, unknown>).data ?? (data as Record<string, unknown>).result ?? (data as Record<string, unknown>).items ?? null
            : null;
        const items = Array.isArray(raw) ? raw : [];

        for (const item of items) {
          const obj = item && typeof item === 'object' ? item as Record<string, unknown> : null;
          if (!obj) continue;
          const subjectId = (obj.subjectID ?? obj.subjectId ?? obj.id) as number | undefined;
          const subjectName = (obj.subjectName ?? obj.name ?? obj.subject) as string | undefined;
          if (typeof subjectId === 'number' && subjectId > 0 && typeof subjectName === 'string' && subjectName) {
            all.push({ subjectId, subjectName });
          }
        }

        if (items.length < limit) hasMore = false;
        else {
          offset += limit;
          // Задержка между запросами для соблюдения rate limiting WB (1 запрос в 500мс)
          await new Promise((r) => setTimeout(r, 600));
        }
      }

    const seen = new Set<number>();
    return all
      .filter((x) => {
        if (seen.has(x.subjectId)) return false;
        seen.add(x.subjectId);
        return true;
      })
      .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'ru'));
    } catch (err) {
      const axErr = err as { response?: { status?: number; data?: { detail?: string; message?: string } } };
      const status = axErr?.response?.status;
      const wbMsg = axErr?.response?.data?.detail ?? axErr?.response?.data?.message;
      const msg = wbMsg || (err instanceof Error ? err.message : `Ошибка WB API`);
      console.warn('[WildberriesAdapter] getCategoryList failed:', status, wbMsg || err);
      throw new Error(`Не удалось загрузить категории WB: ${msg}`);
    }
  }

  /**
   * Получить характеристики категории WB (обязательные и опциональные атрибуты).
   * GET /content/v2/object/charcs/{subjectId}
   * Характеристики зависят от категории — для корректной выгрузки нужны charcID из API.
   */
  async getCharcsForSubject(subjectId: number): Promise<Array<{ charcID: number; name: string; required?: boolean }>> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<unknown>(
          `${this.CONTENT_API}/content/v2/object/charcs/${subjectId}`,
          { headers: this.authHeader(), timeout: 10000 },
        ),
      );
      const raw = Array.isArray(data) ? data
        : (data && typeof data === 'object')
          ? (data as Record<string, unknown>).data ?? (data as Record<string, unknown>).result ?? (data as Record<string, unknown>).items ?? null
          : null;
      const items = Array.isArray(raw) ? raw : [];
      return items
        .filter((x): x is Record<string, unknown> => x && typeof x === 'object')
        .map((x) => ({
          charcID: Number(x.charcID ?? x.id ?? x.charcId ?? 0),
          name: String(x.name ?? x.attributeName ?? '').trim(),
          required: Boolean(x.required),
        }))
        .filter((x) => x.charcID > 0 && x.name);
    } catch (err) {
      this.logError(err as Error, 'getCharcsForSubject');
      return [];
    }
  }

  /**
   * Получить справочник цветов WB.
   * GET /content/v2/directory/colors — требуется авторизация.
   * @param token — токен WB (опционально, иначе берётся из config)
   */
  async getColors(token?: string): Promise<Array<{ id: number; name: string }>> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<unknown>(
          `${this.CONTENT_API}/content/v2/directory/colors`,
          { headers: this.authHeader(token), timeout: 10000 },
        ),
      );
      const raw = Array.isArray(data) ? data
        : (data && typeof data === 'object')
          ? (data as Record<string, unknown>).data ?? (data as Record<string, unknown>).result ?? (data as Record<string, unknown>).items ?? null
          : null;
      const items = Array.isArray(raw) ? raw : [];
      return items
        .filter((x): x is Record<string, unknown> => x && typeof x === 'object')
        .map((x) => ({
          id: Number(x.id ?? x.colorId ?? x.color_id ?? 0),
          name: String(x.name ?? x.colorName ?? x.color_name ?? '').trim(),
        }))
        .filter((x) => x.id > 0 && x.name);
    } catch (err) {
      this.logError(err as Error, 'getColors');
      const msg = err instanceof Error ? err.message : String(err);
      const axErr = err as { response?: { status?: number; data?: { detail?: string } } };
      const wbMsg = axErr?.response?.data?.detail ?? axErr?.response?.status;
      throw new Error(wbMsg ? `Ошибка WB API: ${wbMsg}` : `Не удалось загрузить цвета. ${msg}`);
    }
  }

  /**
   * Генерация штрих-кодов на стороне WB.
   * POST /content/v2/barcodes — создаёт уникальные штрих-коды для товаров.
   * @param count Количество штрих-кодов для генерации (обычно 1)
   * @returns Массив сгенерированных штрих-кодов
   */
  async generateBarcodes(count: number = 1): Promise<string[]> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<{ barcodes?: string[]; data?: string[] }>(
          `${this.CONTENT_API}/content/v2/barcodes`,
          { count },
          {
            headers: {
              ...this.authHeader(),
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        ),
      );
      const barcodes = data?.barcodes ?? data?.data ?? [];
      if (barcodes.length === 0) {
        console.warn('[WildberriesAdapter] generateBarcodes: пустой ответ от WB');
      } else {
        console.log(`[WildberriesAdapter] Сгенерировано ${barcodes.length} штрих-кодов: ${barcodes.join(', ')}`);
      }
      return barcodes;
    } catch (error) {
      this.logError(error, 'generateBarcodes');
      const axErr = error as { response?: { status?: number; data?: { detail?: string; message?: string } } };
      const status = axErr?.response?.status;
      const wbMsg = axErr?.response?.data?.detail ?? axErr?.response?.data?.message;
      const msg = wbMsg || (error instanceof Error ? error.message : 'Ошибка генерации штрих-кодов');
      throw new Error(`Не удалось сгенерировать штрих-коды WB: ${msg}`);
    }
  }

  /**
   * Выгрузка товара. Поддерживает как ProductData (legacy), так и CanonicalProduct через convertToPlatform.
   */
  async uploadProduct(product: ProductData): Promise<string> {
    // Логируем входные данные ProductData
    console.log('[WildberriesAdapter] uploadProduct ProductData:', {
      id: product.id,
      name: product.name,
      wbSubjectId: product.wbSubjectId,
      vendorCode: product.vendorCode,
      imagesCount: product.images?.length ?? 0,
    });

    const canonical: CanonicalProduct = {
      canonical_sku: product.id,
      vendor_code: product.vendorCode ?? product.id,
      title: product.name,
      long_description_plain: product.description,
      brand_name: product.brand,
      weight_grams: product.weight,
      width_mm: product.width,
      length_mm: product.length,
      height_mm: product.height,
      color: product.color,
      items_per_pack: product.itemsPerPack,
      material: product.material,
      craft_type: product.craftType,
      country_of_origin: product.countryOfOrigin,
      package_contents: product.packageContents,
      long_description_html: product.richContent,
      wb_subject_id: product.wbSubjectId,
      attributes: undefined,
      images: product.images.map((url) => ({ url })),
      price: product.price ?? 1,
      stock_quantity: product.stock,
    };
    return this.uploadFromCanonical(canonical);
  }

  /**
   * Диагностика выгрузки: попытка загрузки с возвратом полного запроса и ответа WB.
   * Для отладки ошибок 400 — показывает что именно отправлено и что вернул WB.
   */
  async tryUploadWithFullResponse(
    product: ProductData,
  ): Promise<{ success: boolean; nmId?: string; error?: string; wbRequest?: unknown; wbResponse?: unknown }> {
    const canonical: CanonicalProduct = {
      canonical_sku: product.id,
      vendor_code: product.vendorCode ?? product.id,
      title: product.name,
      long_description_plain: product.description,
      brand_name: product.brand,
      weight_grams: product.weight,
      width_mm: product.width,
      length_mm: product.length,
      height_mm: product.height,
      color: product.color,
      items_per_pack: product.itemsPerPack,
      material: product.material,
      craft_type: product.craftType,
      country_of_origin: product.countryOfOrigin,
      package_contents: product.packageContents,
      long_description_html: product.richContent,
      wb_subject_id: product.wbSubjectId,
      attributes: undefined,
      images: (product.images ?? []).map((url) => ({ url })),
      price: product.price ?? 1,
      stock_quantity: product.stock ?? 0,
    };
    let wbProduct: unknown;
    try {
      const barcodes = await this.generateBarcodes(1);
      const barcode = barcodes[0];
      if (!barcode?.trim()) {
        return { success: false, error: 'Не удалось сгенерировать штрих-код WB' };
      }
      let wbCharcs: Array<{ charcID: number; name: string; required?: boolean }> | undefined;
      if (canonical.wb_subject_id && canonical.wb_subject_id > 0) {
        await new Promise((r) => setTimeout(r, 300));
        wbCharcs = await this.getCharcsForSubject(canonical.wb_subject_id);
      }
      const cardsArray = this.convertToPlatform(canonical, barcode, wbCharcs);
      const cards = Array.isArray(cardsArray) ? cardsArray : [cardsArray];
      // WB требует supplierVendorCode и brand на уровне карточки — дополняем если нет
      for (const card of cards) {
        const c = card as Record<string, unknown>;
        const v0 = Array.isArray(c.variants) ? (c.variants as Record<string, unknown>[])[0] : undefined;
        if (!c.supplierVendorCode) {
          const vc = v0?.vendorCode;
          c.supplierVendorCode = (typeof vc === 'string' ? vc.replace(/-1$/, '') : null) ?? canonical.vendor_code ?? canonical.canonical_sku;
        }
        if (!c.brand) {
          c.brand = v0?.brand ?? canonical.brand_name ?? 'Ручная работа';
        }
      }
      // WB Content API: пробуем массив (формат Habr) — он принимается чаще
      wbProduct = cards;
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.CONTENT_API}/content/v2/cards/upload`, wbProduct, {
          headers: { ...this.authHeader(), 'Content-Type': 'application/json' },
        }),
      );
      const first = Array.isArray(data) ? data[0] : data?.cards?.[0];
      const nmId = first?.nmID ?? first?.nmId ?? data?.nmID ?? data?.nmId;
      return { success: true, nmId: nmId ? String(nmId) : undefined, wbRequest: wbProduct, wbResponse: data };
    } catch (error) {
      const axErr = error as { response?: { status?: number; data?: unknown } };
      const wbData = axErr?.response?.data;
      let msg = error instanceof Error ? error.message : String(error);
      const parts: string[] = [];
      if (wbData && typeof wbData === 'object') {
        const obj = wbData as Record<string, unknown>;
        if (typeof obj.detail === 'string') parts.push(obj.detail);
        if (typeof obj.message === 'string') parts.push(obj.message);
        const errs = obj.errors ?? obj.Errors ?? obj.error;
        if (Array.isArray(errs)) {
          for (const e of errs) {
            const s = typeof e === 'string' ? e : (e && typeof e === 'object' && 'message' in e ? (e as { message?: string }).message : null);
            if (s?.trim()) parts.push(s.trim());
          }
        }
      }
      if (parts.length > 0) msg = parts.join('. ');
      return { success: false, error: msg, wbRequest: wbProduct, wbResponse: wbData };
    }
  }

  /**
   * Выгрузка на WB из канонической модели.
   * Генерирует штрих-код на стороне WB перед созданием карточки.
   */
  async uploadFromCanonical(canonical: CanonicalProduct): Promise<string> {
    try {
      // 1. Генерируем штрих-код на стороне WB (обязательно при выгрузке карточки)
      const barcodes = await this.generateBarcodes(1);
      const barcode = barcodes[0];
      if (!barcode?.trim()) {
        throw new Error('Не удалось сгенерировать штрих-код WB. Выгрузка карточки невозможна без штрих-кода.');
      }

      // 2. Получаем характеристики категории (обязательные поля зависят от subjectId)
      let wbCharcs: Array<{ charcID: number; name: string; required?: boolean }> | undefined;
      if (canonical.wb_subject_id && canonical.wb_subject_id > 0) {
        await new Promise((r) => setTimeout(r, 300)); // rate limit WB API
        wbCharcs = await this.getCharcsForSubject(canonical.wb_subject_id);
      }

      // 3. Формируем payload с штрих-кодом и корректными charcID
      const cardsArray = this.convertToPlatform(canonical, barcode, wbCharcs);
      const cards = Array.isArray(cardsArray) ? cardsArray : [cardsArray];
      for (const card of cards) {
        const c = card as Record<string, unknown>;
        const v0 = Array.isArray(c.variants) ? (c.variants as Record<string, unknown>[])[0] : undefined;
        if (!c.supplierVendorCode) {
          const vc = v0?.vendorCode;
          c.supplierVendorCode = (typeof vc === 'string' ? vc.replace(/-1$/, '') : null) ?? canonical.vendor_code ?? canonical.canonical_sku;
        }
        if (!c.brand) {
          c.brand = v0?.brand ?? canonical.brand_name ?? 'Ручная работа';
        }
      }
      const wbProduct = cards;

      // Логируем полный запрос для отладки
      console.log('[WildberriesAdapter] uploadFromCanonical REQUEST:', JSON.stringify(wbProduct, null, 2));

      // 3. Выгружаем карточку
      const { data } = await firstValueFrom(
        this.httpService.post(`${this.CONTENT_API}/content/v2/cards/upload`, wbProduct, {
          headers: {
            ...this.authHeader(),
            'Content-Type': 'application/json',
          },
        }),
      );

      // Логируем ответ
      console.log('[WildberriesAdapter] uploadFromCanonical RESPONSE:', JSON.stringify(data, null, 2));

      // WB создаёт карточки асинхронно и может не вернуть nmID сразу
      let nmId: number | undefined;
      const firstCard = Array.isArray(data) ? data[0] : data?.cards?.[0];
      nmId = firstCard ? Number(firstCard.nmID ?? firstCard.nmId) : undefined;

      // Если nmId не вернулся — WB обрабатывает асинхронно, ищем по vendorCode
      const vendorCode = (wbProduct[0] as Record<string, unknown>)?.supplierVendorCode as string | undefined;
      if (!nmId && vendorCode) {
        console.log(`[WildberriesAdapter] nmId не вернулся, ждём 7 сек и ищем по vendorCode=${vendorCode}`);
        await new Promise((r) => setTimeout(r, 7000));
        nmId = await this.findNmIdByVendorCode(vendorCode);
      }

      if (!nmId) {
        console.warn('[WildberriesAdapter] Не удалось получить nmId. Карточка создана, но фото не загружены.');
        return 'pending'; // Карточка создана асинхронно, nmId появится позже
      }

      const imageUrls = canonical.images?.map((i) => i.url) ?? [];
      // WB обрабатывает карточку асинхронно — ждём ещё 3 сек перед загрузкой фото
      if (imageUrls.length > 0) {
        await new Promise((r) => setTimeout(r, 3000));
      }
      await this.uploadImages(nmId, imageUrls);
      if (this.config.sellerId) {
        await this.setStock(nmId, canonical.stock_quantity);
      }
      return String(nmId);
    } catch (error) {
      this.logError(error, 'uploadProduct');
      const axErr = error as { response?: { status?: number; data?: unknown } };
      const status = axErr?.response?.status;
      const wbData = axErr?.response?.data as Record<string, unknown> | undefined;
      let msg = error instanceof Error ? error.message : String(error);
      const parts: string[] = [];
      if (status === 404) {
        msg = `HTTP 404 — endpoint не найден. Проверьте, что WB Content API доступен (content-api.wildberries.ru).`;
      } else if (wbData && typeof wbData === 'object') {
        if (typeof wbData.detail === 'string') parts.push(wbData.detail);
        if (typeof wbData.message === 'string') parts.push(wbData.message);
        if (typeof wbData.title === 'string') parts.push(wbData.title);
        const errs = wbData.errors ?? wbData.Errors ?? wbData.error;
        if (Array.isArray(errs) && errs.length > 0) {
          for (const e of errs) {
            const s = typeof e === 'string' ? e : (e && typeof e === 'object' && 'message' in e ? (e as { message?: string }).message : (e as { text?: string })?.text ?? null);
            if (s?.trim()) parts.push(s.trim());
          }
        } else if (typeof errs === 'string' && errs.trim()) {
          parts.push(errs.trim());
        }
        const dataErr = wbData.data as Record<string, unknown> | undefined;
        if (dataErr && typeof dataErr === 'object') {
          const dataErrs = dataErr.errors ?? dataErr.Errors ?? dataErr.error;
          if (Array.isArray(dataErrs)) {
            for (const e of dataErrs) {
              const s = typeof e === 'string' ? e : (e && typeof e === 'object' && 'message' in e ? (e as { message?: string }).message : (e as { text?: string })?.text ?? null);
              if (s?.trim()) parts.push(s.trim());
            }
          }
        }
        if (parts.length > 0) msg = [...new Set(parts)].join('. ');
        if (status === 400) {
          const rawJson = JSON.stringify(wbData, null, 2);
          console.warn('[WildberriesAdapter] uploadProduct 400:', rawJson);
          if (!msg || msg.includes('status code') || msg.length < 20) {
            msg = parts.length > 0 ? msg : 'HTTP 400 — неверный формат. Выберите категорию WB, добавьте фото и заполните обязательные поля (название, артикул, габариты, вес).';
          }
          // Добавляем сырой ответ WB для диагностики (первые 800 символов)
          const rawPreview = rawJson.length > 800 ? rawJson.slice(0, 800) + '...' : rawJson;
          msg += ` [Ответ WB: ${rawPreview}]`;
        }
      }
      throw new Error(`Ошибка выгрузки товара на Wildberries: ${msg}`);
    }
  }

  /**
   * Загрузка фото на WB через POST /content/v3/media/save.
   * Формат: { nmId, data: ["url1", "url2"] } — data это массив строк URL (не объектов!).
   * Проверено curl-запросом 09.03.2026.
   */
  private async uploadImages(nmId: number, images: string[]): Promise<void> {
    const urls = images.filter((u) => typeof u === 'string' && u.trim().startsWith('http')).map((u) => u.trim());
    if (urls.length === 0) return;
    const maxRetries = 4;
    const retryDelayMs = 3000;

    // Загружаем все фото одним запросом (batch)
    const body = { nmId, data: urls };
    let lastErr: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await firstValueFrom(
          this.httpService.post(`${this.CONTENT_API}/content/v3/media/save`, body, {
            headers: { ...this.authHeader(), 'Content-Type': 'application/json' },
            timeout: 30000,
          }),
        );
        console.log(`[WildberriesAdapter] Фото загружены для nmId=${nmId} (${urls.length} шт.)`);
        return;
      } catch (err) {
        lastErr = err;
        const axErr = err as { response?: { status?: number; data?: unknown } };
        console.warn(`[WildberriesAdapter] media/save попытка ${attempt}/${maxRetries} failed: HTTP ${axErr?.response?.status}`, JSON.stringify(axErr?.response?.data ?? '').slice(0, 200));
        if (attempt < maxRetries) await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }

    if (lastErr) {
      const axErr = lastErr as { response?: { data?: unknown } };
      const wbData = axErr?.response?.data as Record<string, unknown> | undefined;
      const msg = typeof wbData?.errorText === 'string' ? wbData.errorText : (lastErr instanceof Error ? lastErr.message : String(lastErr));
      console.warn(`[WildberriesAdapter] Ошибка загрузки фото для nmId=${nmId}: ${msg}. Попробуйте загрузить фото вручную в ЛК WB.`);
    }
  }

  /**
   * Найти nmId карточки по vendorCode (артикулу).
   * Используется когда WB создаёт карточку асинхронно и не возвращает nmId сразу.
   */
  private async findNmIdByVendorCode(vendorCode: string): Promise<number | undefined> {
    const maxAttempts = 3;
    const delayMs = 3000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const { data } = await firstValueFrom(
          this.httpService.post(
            `${this.CONTENT_API}/content/v2/get/cards/list`,
            {
              settings: {
                cursor: { limit: 100 },
                filter: { withPhoto: -1, textSearch: vendorCode },
              },
            },
            {
              headers: { ...this.authHeader(), 'Content-Type': 'application/json' },
              timeout: 15000,
            },
          ),
        );

        const cards = (data?.cards ?? []) as Array<{
          nmID?: number;
          nmId?: number;
          vendorCode?: string;
          supplierVendorCode?: string;
        }>;

        // Ищем карточку с точным совпадением vendorCode
        const card = cards.find(
          (c) =>
            c.vendorCode === vendorCode ||
            c.supplierVendorCode === vendorCode ||
            c.vendorCode?.includes(vendorCode) ||
            c.supplierVendorCode?.includes(vendorCode),
        );

        if (card) {
          const nmId = Number(card.nmID ?? card.nmId);
          console.log(`[WildberriesAdapter] Найдена карточка: vendorCode=${vendorCode}, nmId=${nmId}`);
          return nmId;
        }

        if (attempt < maxAttempts) {
          console.log(`[WildberriesAdapter] Карточка не найдена, попытка ${attempt}/${maxAttempts}, ждём ${delayMs}ms...`);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      } catch (err) {
        console.warn(`[WildberriesAdapter] Ошибка поиска карточки:`, err instanceof Error ? err.message : err);
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    }

    console.warn(`[WildberriesAdapter] Карточка с vendorCode=${vendorCode} не найдена после ${maxAttempts} попыток`);
    return undefined;
  }

  private async setPrice(nmId: number, price: number): Promise<void> {
    try {
      const discount = 0;
      const finalPrice = Math.round(price * (1 + discount / 100));
      await firstValueFrom(
        this.httpService.post(
          `${this.PRICES_API}/public/api/v1/prices`,
          [{ nmId, price: finalPrice, discount }],
          {
            headers: {
              ...this.authHeader(),
              'Content-Type': 'application/json',
            },
          },
        ),
      );
    } catch (error) {
      this.logError(error, 'setPrice');
    }
  }

  /**
   * Получить chrtId (ID размера) по nmId. С 09.02.2025 WB требует chrtId для обновления остатков.
   * 1) Prices API GET /api/v2/list/goods/size/nm — sizeID = chrtId (предпочтительно)
   * 2) Content API POST /content/v2/get/cards/list — sizes[0].chrtID
   */
  private async getChrtIdByNmId(nmId: number): Promise<number | null> {
    const cached = this.chrtIdCache.get(nmId);
    if (cached != null) return cached;
    try {
      // 1. Prices API — надёжный способ: sizeID = chrtId
      try {
        const { data: priceData } = await firstValueFrom(
          this.httpService.get(
            `${this.PRICES_API}/api/v2/list/goods/size/nm`,
            {
              params: { nmID: nmId, limit: 10, offset: 0 },
              headers: this.authHeader(),
              timeout: 8000,
            },
          ),
        );
        const tryExtract = (item: unknown): number | null => {
          if (!item || typeof item !== 'object') return null;
          const obj = item as Record<string, unknown>;
          // Формат: { nmID, sizes: [{ sizeID }] }
          const sizes = (obj?.sizes ?? []) as Array<{ sizeID?: number; sizeId?: number }>;
          const firstSize = sizes[0];
          const id = firstSize?.sizeID ?? firstSize?.sizeId;
          if (id != null) return Number(id);
          // Формат: массив размеров [{ nmID, sizeID }] — один размер = один объект
          const sizeId = (obj?.sizeID ?? obj?.sizeId) as number | undefined;
          if (sizeId != null && Number(obj?.nmID ?? obj?.nmId) === nmId) return Number(sizeId);
          return null;
        };
        const raw = priceData?.data ?? priceData;
        const arr = Array.isArray(raw) ? raw : (raw != null ? [raw] : []);
        for (const item of arr) {
          const chrtId = tryExtract(item);
          if (chrtId != null) {
            this.chrtIdCache.set(nmId, chrtId);
            return chrtId;
          }
        }
      } catch (priceErr) {
        if ((priceErr as { response?: { status?: number } })?.response?.status !== 404) {
          this.logError(priceErr, 'getChrtIdByNmId (Prices API)');
        }
      }

      // 2. Content API — fallback
      const extractChrtId = (card: Record<string, unknown>): number | null => {
        const goods0 = (card?.goods as Array<{ sizes?: unknown[] }> | undefined)?.[0];
        const sizes = ((card?.sizes ?? goods0?.sizes) ?? []) as Array<{ chrtID?: number; chrtId?: number }>;
        const firstSize = sizes[0];
        const id = firstSize?.chrtID ?? firstSize?.chrtId;
        return id != null ? Number(id) : null;
      };
      for (const body of [
        { settings: { cursor: { limit: 100 }, filter: { withPhoto: -1, nmIDs: [nmId] } } },
        { settings: { cursor: { limit: 500 }, filter: { withPhoto: -1 } } },
      ]) {
        const { data } = await firstValueFrom(
          this.httpService.post(
            `${this.CONTENT_API}/content/v2/get/cards/list`,
            body,
            { headers: { ...this.authHeader(), 'Content-Type': 'application/json' }, timeout: 10000 },
          ),
        );
        const cards = (data?.cards ?? []) as Record<string, unknown>[];
        const card = cards.find((c) => Number(c?.nmID ?? c?.nmId) === nmId);
        const chrtId = card ? extractChrtId(card) : null;
        if (chrtId != null) {
          this.chrtIdCache.set(nmId, chrtId);
          return chrtId;
        }
      }
      return null;
    } catch (err) {
      this.logError(err, 'getChrtIdByNmId');
      return null;
    }
  }

  /**
   * Получить ВСЕ chrtId для nmId (все размеры). Нужно для корректного обновления остатков:
   * если обновить только первый размер, остальные сохраняют старые значения → расхождение.
   */
  private async getChrtIdsByNmId(nmId: number): Promise<number[]> {
    const cached = this.chrtIdsCache.get(nmId);
    if (cached != null && cached.length > 0) return cached;

    const extractFromItem = (obj: Record<string, unknown>): number[] => {
      const sizes = (obj?.sizes ?? []) as Array<{ sizeID?: number; sizeId?: number }>;
      const ids = sizes.map((s) => s?.sizeID ?? s?.sizeId).filter((id): id is number => id != null);
      if (ids.length > 0) return ids.map(Number);
      const sizeId = (obj?.sizeID ?? obj?.sizeId) as number | undefined;
      if (sizeId != null && Number(obj?.nmID ?? obj?.nmId) === nmId) return [Number(sizeId)];
      return [];
    };

    try {
      // 1. Prices API — может вернуть один объект с sizes[] или массив размеров [{ nmID, sizeID }]
      try {
        const { data: priceData } = await firstValueFrom(
          this.httpService.get(
            `${this.PRICES_API}/api/v2/list/goods/size/nm`,
            { params: { nmID: nmId, limit: 50, offset: 0 }, headers: this.authHeader(), timeout: 8000 },
          ),
        );
        const raw = priceData?.data ?? priceData;
        const arr = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
        const allIds: number[] = [];
        for (const item of arr) {
          if (!item || typeof item !== 'object') continue;
          const ids = extractFromItem(item as Record<string, unknown>);
          for (const id of ids) {
            if (!allIds.includes(id)) allIds.push(id);
          }
        }
        if (allIds.length > 0) {
          if (allIds.length > 1) this.chrtIdsCache.set(nmId, allIds);
          this.chrtIdCache.set(nmId, allIds[0]);
          return allIds;
        }
      } catch {
        // ignore
      }

      // 2. Content API — fallback (несколько структур: sizes[], goods[].chrtID, goods[].sizes[], addin)
      const extractFromCard = (card: Record<string, unknown>): number[] => {
        const ids: number[] = [];
        const add = (id: number | undefined | null) => {
          if (id != null && !ids.includes(Number(id))) ids.push(Number(id));
        };

        const sizes = (card?.sizes ?? []) as Array<{ chrtID?: number; chrtId?: number; sizeID?: number; sizeId?: number }>;
        for (const s of sizes) {
          add(s?.chrtID ?? s?.chrtId ?? s?.sizeID ?? s?.sizeId);
        }

        const goods = (card?.goods ?? []) as Array<Record<string, unknown>>;
        for (const g of goods) {
          add((g?.chrtID ?? g?.chrtId ?? g?.sizeID ?? g?.sizeId) as number | undefined);
          const gSizes = (g?.sizes ?? []) as Array<{ chrtID?: number; chrtId?: number }>;
          for (const gs of gSizes) add(gs?.chrtID ?? gs?.chrtId);
        }

        // addin — доп. данные WB (могут содержать размеры)
        const addin = (card?.addin ?? []) as Array<Record<string, unknown>>;
        for (const a of addin) {
          add((a?.chrtID ?? a?.chrtId ?? a?.sizeID ?? a?.sizeId) as number | undefined);
          const aSizes = (a?.sizes ?? []) as Array<{ chrtID?: number; chrtId?: number }>;
          for (const as of aSizes) add(as?.chrtID ?? as?.chrtId);
        }

        if (ids.length > 0) return ids;

        const goods0 = (card?.goods as Array<{ sizes?: unknown[] }> | undefined)?.[0];
        const fallbackSizes = ((card?.sizes ?? goods0?.sizes) ?? []) as Array<{ chrtID?: number; chrtId?: number }>;
        return fallbackSizes.map((s) => s?.chrtID ?? s?.chrtId).filter((id): id is number => id != null);
      };
      for (const body of [
        { settings: { cursor: { limit: 100 }, filter: { withPhoto: -1, nmIDs: [nmId] } } },
        { settings: { cursor: { limit: 500 }, filter: { withPhoto: -1 } } },
      ]) {
        const { data } = await firstValueFrom(
          this.httpService.post(
            `${this.CONTENT_API}/content/v2/get/cards/list`,
            body,
            { headers: { ...this.authHeader(), 'Content-Type': 'application/json' }, timeout: 10000 },
          ),
        );
        const cards = (data?.cards ?? []) as Record<string, unknown>[];
        const card = cards.find((c) => Number(c?.nmID ?? c?.nmId) === nmId);
        const ids = card ? extractFromCard(card) : [];
        if (ids.length > 0) {
          if (ids.length > 1) this.chrtIdsCache.set(nmId, ids);
          this.chrtIdCache.set(nmId, ids[0]);
          return ids;
        }
      }

      // Fallback: один chrtId из getChrtIdByNmId
      const single = await this.getChrtIdByNmId(nmId);
      if (single != null) {
        this.chrtIdsCache.set(nmId, [single]);
        return [single];
      }
      return [];
    } catch (err) {
      this.logError(err, 'getChrtIdsByNmId');
      return [];
    }
  }

  /**
   * Получить первый штрих-код (barcode) товара WB по nmId.
   * Content API: POST /content/v2/get/cards/list с фильтром по nmID.
   */
  async getBarcodeByNmId(nmId: number): Promise<string | null> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.CONTENT_API}/content/v2/get/cards/list`,
          { settings: { cursor: { limit: 10 }, filter: { withPhoto: -1, nmIDs: [nmId] } } },
          { headers: { ...this.authHeader(), 'Content-Type': 'application/json' }, timeout: 10000 },
        ),
      );
      const cards = (data?.cards ?? []) as Array<Record<string, unknown>>;
      const card = cards.find((c) => Number(c?.nmID ?? c?.nmId) === nmId);
      if (!card) return null;
      const sizes = (card.sizes ?? (card.goods as Array<{ sizes?: Array<{ skus?: string[] }> }>)?.[0]?.sizes ?? []) as Array<{ skus?: string[] }>;
      const firstSize = sizes[0];
      const skus = firstSize?.skus;
      return Array.isArray(skus) && skus.length > 0 ? String(skus[0]) : null;
    } catch (err) {
      this.logError(err, 'getBarcodeByNmId');
      return null;
    }
  }

  /**
   * Список складов WB (ID + название) для выбора в настройках.
   * GET /api/v3/warehouses или /api/v2/warehouses
   */
  async getWarehouseList(): Promise<Array<{ id: string; name?: string }>> {
    for (const path of ['/api/v3/warehouses', '/api/v2/warehouses']) {
      try {
        const { data } = await firstValueFrom(
          this.httpService.get(`${this.MARKETPLACE_API}${path}`, {
            headers: this.authHeader(),
            timeout: 5000,
          }),
        );
        const list = data?.warehouses ?? (Array.isArray(data) ? data : []);
        type WbWarehouse = { id?: number | string; warehouseId?: number | string; name?: string };
        const items = list as WbWarehouse[];
        const result: Array<{ id: string; name?: string }> = [];
        for (const w of items) {
          const id = w?.id ?? w?.warehouseId;
          if (id != null) result.push({ id: String(id), name: w?.name ?? `Склад ${id}` });
        }
        if (result.length > 0) return result;
      } catch (err) {
        if ((err as { response?: { status?: number } })?.response?.status !== 404) {
          this.logError(err, `getWarehouseList ${path}`);
        }
      }
    }
    return [];
  }

  /**
   * Получить warehouseId для работы с остатками.
   * WB требует ID склада (ЛК → Маркетплейс → Мои склады). Если не задан — получаем первый через API.
   */
  private async resolveWarehouseId(): Promise<string | null> {
    if (this.config.warehouseId) return this.config.warehouseId;
    if (this.cachedWarehouseId) return this.cachedWarehouseId;
    for (const path of ['/api/v3/warehouses', '/api/v2/warehouses']) {
      try {
        const { data } = await firstValueFrom(
          this.httpService.get(`${this.MARKETPLACE_API}${path}`, {
            headers: this.authHeader(),
            timeout: 5000,
          }),
        );
        const list = data?.warehouses ?? (Array.isArray(data) ? data : []);
        const first = list[0];
        const id = first?.id ?? first?.warehouseId ?? (first as Record<string, unknown>)?.id;
        if (id) {
          this.cachedWarehouseId = String(id);
          console.log('[WildberriesAdapter] Используем склад из API:', this.cachedWarehouseId);
          return this.cachedWarehouseId;
        }
      } catch (err) {
        if ((err as { response?: { status?: number } })?.response?.status !== 404) {
          this.logError(err, `resolveWarehouseId ${path}`);
        }
      }
    }
    console.warn('[WildberriesAdapter] Склад не найден. Укажите warehouseId при подключении WB (ЛК → Маркетплейс → Мои склады).');
    return null;
  }

  /**
   * Обновить остатки на WB. С 09.02.2025 используется chrtId (ID размера), не sku/nmId.
   * Важно: обновляем ВСЕ размеры — первый получает наш stock, остальные 0.
   * Иначе старые значения в других размерах дают расхождение (напр. у нас 15, на WB 16).
   */
  private async setStock(nmId: number, stock: number): Promise<void> {
    const warehouseId =
      this.config.warehouseId || this.config.sellerId || (await this.resolveWarehouseId());
    if (!warehouseId) {
      console.warn('[WildberriesAdapter] setStock пропущен: укажите warehouseId при подключении WB (ЛК → Маркетплейс → Мои склады)');
      return;
    }
    const chrtIds = await this.getChrtIdsByNmId(nmId);
    if (chrtIds.length === 0) {
      const msg = `chrtId не найден для nmId=${nmId}. Убедитесь, что товар создан на WB и имеет хотя бы один размер.`;
      console.warn(`[WildberriesAdapter] setStock: ${msg}`);
      throw new Error(msg);
    }
    try {
      const stocks = chrtIds.map((chrtId, i) => ({
        chrtId,
        amount: i === 0 ? stock : 0,
      }));
      const res = await firstValueFrom(
        this.httpService.put(
          `${this.MARKETPLACE_API}/api/v3/stocks/${warehouseId}`,
          { stocks },
          {
            headers: {
              ...this.authHeader(),
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      if (res?.status >= 200 && res?.status < 300) {
        // 204 No Content — успех
      }
    } catch (error) {
      const axErr = error as { response?: { status?: number; data?: { message?: string; code?: string } } };
      const code = axErr?.response?.status;
      const msg = axErr?.response?.data?.message ?? axErr?.response?.data?.code;
      console.error(
        `[WildberriesAdapter] setStock nmId=${nmId} chrtIds=${chrtIds.length} stock=${stock}: HTTP ${code} — ${msg || ''}`,
      );
      this.logError(error, 'setStock');
      throw error;
    }
  }

  /**
   * Диагностика: получить все chrtId для nmId (для отладки расхождений остатков).
   */
  async getChrtIdsForNmId(nmId: number): Promise<number[]> {
    return this.getChrtIdsByNmId(nmId);
  }

  /**
   * Остатки на складах WB (FBO) — через Statistics API.
   * Требует statsToken. Суммирует quantity по складам, исключая наш FBS-склад.
   */
  async getStocksFbo(nmIds: number[]): Promise<Record<number, number>> {
    const token = this.config.statsToken ?? this.config.apiKey;
    if (!token || nmIds.length === 0) return {};
    const ourWarehouseId = this.config.warehouseId || this.config.sellerId || (await this.resolveWarehouseId());
    let ourWarehouseName: string | null = null;
    if (ourWarehouseId) {
      const list = await this.getWarehouseList();
      const ours = list.find((w) => w.id === ourWarehouseId);
      if (ours?.name) ourWarehouseName = ours.name.trim();
    }
    try {
      const dateFrom = new Date(2020, 0, 1).toISOString();
      const { data } = await firstValueFrom(
        this.httpService.get<Array<{ nmId?: number; quantity?: number; warehouseName?: string }>>(
          `${this.STATISTICS_API}/api/v1/supplier/stocks`,
          {
            headers: this.authHeader(token),
            params: { dateFrom },
            timeout: 15000,
          },
        ),
      );
      const result: Record<number, number> = {};
      const nmIdSet = new Set(nmIds);
      for (const row of Array.isArray(data) ? data : []) {
        const nmId = Number(row.nmId);
        if (!nmIdSet.has(nmId) || isNaN(nmId)) continue;
        const whName = String(row.warehouseName ?? '').trim();
        if (ourWarehouseName && whName === ourWarehouseName) continue;
        const qty = Number(row.quantity ?? 0);
        if (qty > 0) result[nmId] = (result[nmId] ?? 0) + qty;
      }
      return result;
    } catch (error) {
      this.logError(error, 'getStocksFbo');
      return {};
    }
  }

  /**
   * Получить остатки на WB. POST /api/v3/stocks/{warehouseId} с body { skus: [...] }
   */
  async getStocks(nmIds: number[]): Promise<Record<number, number>> {
    const warehouseId =
      this.config.warehouseId || this.config.sellerId || (await this.resolveWarehouseId());
    if (!warehouseId || nmIds.length === 0) return {};
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<{ stocks?: Array<{ sku: string; amount: number }> }>(
          `${this.MARKETPLACE_API}/api/v3/stocks/${warehouseId}`,
          { skus: nmIds.map((id) => String(id)) },
          {
            headers: {
              ...this.authHeader(),
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      const result: Record<number, number> = {};
      for (const s of data?.stocks ?? []) {
        const nmId = parseInt(s.sku, 10);
        if (!isNaN(nmId)) result[nmId] = (result[nmId] ?? 0) + (s.amount ?? 0);
      }
      return result;
    } catch (error) {
      this.logError(error, 'getStocks');
      return {};
    }
  }

  async updateProduct(
    marketplaceProductId: string,
    product: Partial<ProductData>,
  ): Promise<boolean> {
    try {
      const nmId = Number(marketplaceProductId);
      if (isNaN(nmId)) return false;
      if (product.stock !== undefined) await this.setStock(nmId, product.stock);

      // Обновление описания, названия и характеристик через WB Content API
      const hasContentUpdate =
        product.name != null ||
        product.description != null ||
        product.brand != null ||
        product.weight != null ||
        product.width != null ||
        product.length != null ||
        product.height != null ||
        product.color != null ||
        product.material != null ||
        product.craftType != null ||
        product.countryOfOrigin != null ||
        product.packageContents != null ||
        product.richContent != null ||
        product.itemsPerPack != null;
      if (hasContentUpdate && product.name) {
        try {
          const plainDesc = (product.description ?? '').trim();
          const richDesc = (product.richContent ?? '').trim();
          const descriptionText = richDesc
            ? (plainDesc ? `${plainDesc}\n\n${this.stripHtml(richDesc)}` : this.stripHtml(richDesc))
            : plainDesc;
          const characteristics: Array<{ id: number; name: string; value: string }> = [
            { id: 0, name: 'Наименование', value: product.name.slice(0, 500) },
            { id: 3, name: 'Описание', value: descriptionText.slice(0, 5000) },
          ];
          if (product.color?.trim()) {
            characteristics.push({ id: 1, name: 'Цвет', value: product.color.trim() });
          }
          if (product.itemsPerPack != null && product.itemsPerPack > 0) {
            characteristics.push({ id: 4, name: 'Количество предметов в упаковке', value: String(product.itemsPerPack) });
          }
          if (product.material?.trim()) {
            characteristics.push({ id: 5, name: 'Материал изделия', value: product.material.trim() });
          }
          if (product.craftType?.trim()) {
            characteristics.push({ id: 6, name: 'Вид творчества', value: product.craftType.trim() });
          }
          if (product.packageContents?.trim()) {
            characteristics.push({ id: 7, name: 'Комплектация', value: product.packageContents.trim() });
          }
          const w = (product.width ?? 100) / 10;
          const h = (product.height ?? 100) / 10;
          const l = (product.length ?? 100) / 10;
          const weightBrutto = (product.weight ?? 100) / 1000;
          const vendorCode = (product.vendorCode ?? product.id ?? `HS-${nmId}`).toString();
          const card: Record<string, unknown> = {
            nmID: nmId,
            supplierVendorCode: vendorCode,
            countryProduction: (product.countryOfOrigin ?? 'Россия').trim(),
            brand: (product.brand ?? 'Ручная работа').trim(),
            dimensions: { width: w, height: h, length: l, weightBrutto },
            goods: [
              {
                nomenclature: 0,
                variant: 0,
                vendorCode: `${vendorCode}-1`,
                characteristics,
                weightBrutto,
                length: l,
                width: w,
                height: h,
              },
            ],
          };
          await firstValueFrom(
            this.httpService.post(
              `${this.CONTENT_API}/content/v2/cards/update`,
              { cards: [card] },
              {
                headers: { ...this.authHeader(), 'Content-Type': 'application/json' },
                timeout: 15000,
                validateStatus: () => true,
              },
            ),
          );
        } catch (contentErr) {
          this.logError(contentErr as Error, 'updateProduct (content)');
          // Не падаем — цена и остаток уже обновлены
        }
      }

      // Загружаем фото при обновлении (для повторных выгрузок и догонки фото)
      const imageUrls: string[] = [];
      if (Array.isArray(product.images)) {
        imageUrls.push(...product.images.filter((u): u is string => typeof u === 'string' && u.startsWith('http')));
      }
      if (imageUrls.length > 0) {
        try {
          console.log(`[WildberriesAdapter] Загружаем ${imageUrls.length} фото для nmId=${nmId}`);
          await this.uploadImages(nmId, imageUrls);
        } catch (photoErr) {
          this.logError(photoErr as Error, 'updateProduct (photos)');
          // Не падаем — фото опциональны
        }
      }

      return true;
    } catch (error) {
      this.logError(error, 'updateProduct');
      return false;
    }
  }

  async deleteProduct(marketplaceProductId: string): Promise<boolean> {
    console.log(`[WildberriesAdapter] Удаление товара ${marketplaceProductId} с Wildberries`);
    return true;
  }

  /**
   * Получить стикеры заказов из WB API. Доступны при статусе confirm (На сборке) или complete.
   * POST /api/v3/orders/stickers?type=png&width=58&height=40
   */
  async getStickers(orderIds: number[]): Promise<Array<{ orderId: number; file: string }>> {
    if (orderIds.length === 0) return [];
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<{ file?: string; stickers?: Array<{ orderId?: number; file?: string }> }>(
          `${this.MARKETPLACE_API}/api/v3/orders/stickers?type=png&width=58&height=40`,
          { orders: orderIds },
          {
            headers: {
              ...this.authHeader(),
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        ),
      );
      if (data?.stickers && Array.isArray(data.stickers)) {
        return data.stickers
          .filter((s) => s.file)
          .map((s) => ({ orderId: s.orderId ?? orderIds[0], file: s.file! }));
      }
      if (data?.file && orderIds.length > 0) {
        return [{ orderId: orderIds[0], file: data.file }];
      }
      return [];
    } catch (err) {
      this.logError(err, 'getStickers');
      return [];
    }
  }

  /**
   * Отладка: получить статус заказа напрямую из WB API.
   * orderIdOrSrid — числовой id заказа WB или srid (например 4645532575).
   */
  async getOrderStatusFromWb(orderIdOrSrid: string): Promise<{
    found: boolean;
    orderId?: number;
    srid?: string;
    wbStatus?: string;
    supplierStatus?: string;
    orderStatus?: string | number;
    raw?: Record<string, unknown>;
  }> {
    const numId = parseInt(orderIdOrSrid, 10);
    const opts = {
      headers: {
        ...this.authHeader(),
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    };

    const parseStatusResponse = (data: unknown, id: number) => {
      const orders = (data as { orders?: unknown[] })?.orders ?? [];
      const o = orders[0] as { id?: number; orderId?: number; srid?: string; wbStatus?: string; supplierStatus?: string; orderStatus?: number } | undefined;
      if (o) {
        return {
          found: true,
          orderId: o.id ?? o.orderId ?? id,
          srid: o.srid,
          wbStatus: o.wbStatus,
          supplierStatus: o.supplierStatus,
          orderStatus: o.orderStatus,
          raw: o as unknown as Record<string, unknown>,
        };
      }
      return null;
    };

    const tryStatusById = async (id: number) => {
      for (const [path, bodyKey, bodyVal] of [
        ['/api/v3/orders/status', 'orders', [id]] as const,
        ['/api/marketplace/v3/dbs/orders/status/info', 'ordersIds', [id]] as const,
      ]) {
        try {
          const { data } = await firstValueFrom(
            this.httpService.post(`${this.MARKETPLACE_API}${path}`, { [bodyKey]: bodyVal }, opts),
          );
          const res = parseStatusResponse(data, id);
          if (res) return res;
        } catch {
          /* не найден в этом типе заказов */
        }
      }
      if (this.config.statsToken) {
        try {
          const { data } = await firstValueFrom(
            this.httpService.post(
              `${this.MARKETPLACE_API}/api/v3/dbw/orders/status`,
              { orders: [id] },
              { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${this.config.statsToken}` } },
            ),
          );
          const res = parseStatusResponse(data, id);
          if (res) return res;
        } catch {
          /* DBW */
        }
      }
      return null;
    };

    if (!isNaN(numId)) {
      const res = await tryStatusById(numId);
      if (res) return res;
    }

    const orders = await this.getOrders(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const search = orderIdOrSrid.toLowerCase();
    const match = orders.find(
      (o) =>
        o.id === orderIdOrSrid ||
        o.id === String(numId) ||
        o.marketplaceOrderId === orderIdOrSrid ||
        (o.marketplaceOrderId && o.marketplaceOrderId.toLowerCase().includes(search)),
    );
    if (match) {
      const id = parseInt(match.id, 10);
      if (!isNaN(id)) {
        const res = await tryStatusById(id);
        if (res) return res;
      }
      return {
        found: true,
        orderId: parseInt(match.id, 10),
        srid: match.marketplaceOrderId,
        wbStatus: (match as OrderData & { rawStatus?: string }).rawStatus,
        orderStatus: (match as OrderData & { rawStatus?: string }).rawStatus,
        raw: match as unknown as Record<string, unknown>,
      };
    }
    return { found: false };
  }

  async getOrders(since?: Date): Promise<OrderData[]> {
    const seen = new Set<string>();
    const result: OrderData[] = [];
    const dateTo = Math.floor(Date.now() / 1000);
    const defaultSince = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const dateFrom = Math.floor((since ?? defaultSince).getTime() / 1000);
    const fboToken = this.config.statsToken;

    /** Индекс в result по ключу — для обновления FBO при приоритете DBW */
    const keyToIndex = new Map<string, number>();
    const toOrder = (o: Record<string, unknown>, fulfillmentType: 'FBS' | 'DBS' | 'DBW') => {
      const id = o.id ?? o.orderId;
      const srid = (o.srid ?? o.id ?? '') as string;
      const status = (o.orderStatus ?? o.supplierStatus ?? o.status ?? 'new') as string | number;
      const wbStatus = o.wbStatus as string | undefined;
      const priceRaw = o.totalPrice ?? o.price ?? o.convertedPrice ?? 0;
      const amount = (Number(priceRaw) || 0) / 100;
      const dateStr = (o.dateCreated ?? o.createdAt ?? o.date ?? new Date().toISOString()) as string;
      const items = (o.items ?? o.nomenclaturas ?? o.positions) as Array<Record<string, unknown>> | undefined;
      let nmId = o.nmId ?? o.nmID ?? o.nomenclaturaId ?? 0;
      if (Array.isArray(items) && items.length > 0) {
        nmId = items[0]?.nmId ?? items[0]?.nmID ?? items[0]?.nomenclaturaId ?? nmId;
      }
      const offices = o.offices as string[] | undefined;
      const warehouseName = Array.isArray(offices) && offices.length > 0 ? offices[0] : undefined;
      const key = `${id}-${srid}-${nmId}`;
      // deliveryType из ответа WB — приоритет над эндпоинтом (FBS может возвращать заказы с deliveryType dbw)
      const deliveryType = (o.deliveryType ?? o.delivery_type ?? '') as string;
      const isDbwByResponse = /dbw/i.test(deliveryType);
      const effectiveType: 'FBS' | 'DBS' | 'DBW' = isDbwByResponse ? 'DBW' : fulfillmentType;
      const existingIdx = keyToIndex.get(key);
      if (existingIdx != null) {
        // Заказ уже есть — при приходе из DBW обновляем на FBO (приоритет DBW)
        if (effectiveType === 'DBW') {
          const od = result[existingIdx];
          od.wbFulfillmentType = 'DBW';
          od.isFbo = true;
        }
        return;
      }
      keyToIndex.set(key, result.length);
      seen.add(key);
      result.push({
        id: String(id),
        marketplaceOrderId: String(srid),
        productId: String(nmId),
        customerName: (o.customerName as string) || 'Аноним',
        customerPhone: (o.customerPhone ?? o.clientPhone) as string | undefined,
        status: typeof status === 'number' ? String(status) : status,
        amount,
        createdAt: new Date(dateStr),
        warehouseName,
        rawStatus: wbStatus,
        wbFulfillmentType: effectiveType,
        isFbo: effectiveType === 'DBW',
      });
    };

    const fetchFrom = async (
      url: string,
      params: Record<string, number> | undefined,
      fulfillmentType: 'FBS' | 'DBS' | 'DBW',
      useFboToken?: boolean,
    ) => {
      const token = useFboToken && fboToken ? fboToken : undefined;
      const opts = { headers: this.authHeader(token), timeout: 10000 };
      try {
        const { data } = await firstValueFrom(
          this.httpService.get(url, { ...opts, params }),
        );
        for (const o of data?.orders ?? []) {
          toOrder(o as Record<string, unknown>, fulfillmentType);
        }
      } catch {
        /* эндпоинт недоступен или нет данных */
      }
    };

    const fetchStatuses = async (
      orderIds: number[],
      statusPath: string,
      bodyKey: 'orders' | 'ordersIds',
      useFboToken?: boolean,
    ): Promise<Map<number, { wbStatus?: string; supplierStatus?: string }>> => {
      const map = new Map<number, { wbStatus?: string; supplierStatus?: string }>();
      if (orderIds.length === 0) return map;
      const token = useFboToken && fboToken ? fboToken : undefined;
      for (let i = 0; i < orderIds.length; i += 1000) {
        const batch = orderIds.slice(i, i + 1000);
        try {
          const { data } = await firstValueFrom(
            this.httpService.post(
              `${this.MARKETPLACE_API}${statusPath}`,
              { [bodyKey]: batch },
              {
                headers: {
                  ...this.authHeader(token),
                  'Content-Type': 'application/json',
                },
                timeout: 10000,
              },
            ),
          );
          for (const s of data?.orders ?? []) {
            const entry = s as { id?: number; orderId?: number; wbStatus?: string; supplierStatus?: string };
            const oid = entry.id ?? entry.orderId;
            if (oid != null) {
              const prev = map.get(Number(oid)) ?? {};
              map.set(Number(oid), {
                ...prev,
                wbStatus: entry.wbStatus ?? prev.wbStatus,
                supplierStatus: entry.supplierStatus ?? prev.supplierStatus,
              });
            }
          }
        } catch {
          /* статусы опциональны */
        }
      }
      return map;
    };

    // DBW (FBO) первым — при дубликате в FBS и DBW приоритет у FBO (не списывать «Мой склад»)
    try {
      await fetchFrom(`${this.MARKETPLACE_API}/api/v3/dbw/orders/new`, undefined, 'DBW', true);
      await fetchFrom(`${this.MARKETPLACE_API}/api/v3/orders/new`, undefined, 'FBS');
      await fetchFrom(`${this.MARKETPLACE_API}/api/v3/dbs/orders/new`, undefined, 'DBS');
      await fetchFrom(
        `${this.MARKETPLACE_API}/api/v3/dbw/orders`,
        { dateFrom, dateTo, next: 0, limit: 1000 },
        'DBW',
        true,
      );
      await fetchFrom(
        `${this.MARKETPLACE_API}/api/v3/orders`,
        { dateFrom, dateTo, next: 0, limit: 1000 },
        'FBS',
      );
      await fetchFrom(
        `${this.MARKETPLACE_API}/api/v3/dbs/orders`,
        { dateFrom, dateTo, next: 0, limit: 1000 },
        'DBS',
      );

      const ids = result.map((r) => parseInt(r.id, 10)).filter((n) => !isNaN(n));
      const [fbsMap, dbsMap, dbwMap] = await Promise.all([
        fetchStatuses(ids, '/api/v3/orders/status', 'orders'),
        fetchStatuses(ids, '/api/marketplace/v3/dbs/orders/status/info', 'ordersIds'),
        fetchStatuses(ids, '/api/v3/dbw/orders/status', 'orders', true),
      ]);
      const statusMap = new Map<number, { wbStatus?: string; supplierStatus?: string }>([
        ...fbsMap,
        ...dbsMap,
        ...dbwMap,
      ]);
      for (const od of result) {
        const st = statusMap.get(parseInt(od.id, 10));
        if (st?.wbStatus) (od as { rawStatus?: string }).rawStatus = st.wbStatus;
        if (st?.supplierStatus) (od as { rawSupplierStatus?: string }).rawSupplierStatus = st.supplierStatus;
      }

      return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      this.logError(error, 'getOrders');
      return [];
    }
  }

  async updateOrderStatus(
    marketplaceOrderId: string,
    status: string,
    options?: { wbStickerNumber?: string; wbFulfillmentType?: 'FBS' | 'DBS' | 'DBW'; wbSupplyId?: string },
  ): Promise<boolean> {
    const wbStatus = this.mapStatusToWB(status);
    if (wbStatus !== 2) {
      // Пока поддерживаем только переход в «На сборке» (confirm)
      return true;
    }
    try {
      const numericId = this.resolveWbOrderId(marketplaceOrderId, options?.wbStickerNumber);
      if (numericId == null) {
        this.logError(new Error('WB: не удалось определить числовой id заказа'), 'updateOrderStatus');
        return false;
      }
      // Если знаем тип заказа WB — используем его, иначе пытаемся по всем API.
      if (options?.wbFulfillmentType === 'FBS') {
        if (options.wbSupplyId) {
          return await this.confirmFbsOrderWithSupply(numericId, options.wbSupplyId);
        }
        return await this.confirmFbsOrder(numericId);
      }
      if (options?.wbFulfillmentType === 'DBS') {
        return await this.confirmDbsOrder(numericId);
      }
      if (options?.wbFulfillmentType === 'DBW') {
        return await this.confirmDbwOrder(numericId);
      }
      return await this.confirmOrderToAssembly(numericId);
    } catch (error) {
      this.logError(error, 'updateOrderStatus');
      return false;
    }
  }

  /** Числовой id заказа WB для supplies API */
  private resolveWbOrderId(marketplaceOrderId: string, wbStickerNumber?: string): number | null {
    const fromSticker = wbStickerNumber ? parseInt(wbStickerNumber, 10) : NaN;
    const fromExternal = parseInt(marketplaceOrderId, 10);
    const id = !isNaN(fromSticker) ? fromSticker : !isNaN(fromExternal) ? fromExternal : null;
    return id != null ? id : null;
  }

  /**
   * Перевести заказ в «На сборке». Пробуем FBS → DBS → DBW (разные API для разных типов заказов).
   */
  private async confirmOrderToAssembly(wbOrderId: number): Promise<boolean> {
    const fbsOk = await this.confirmFbsOrder(wbOrderId);
    if (fbsOk) return true;
    const dbsOk = await this.confirmDbsOrder(wbOrderId);
    if (dbsOk) return true;
    const dbwOk = await this.confirmDbwOrder(wbOrderId);
    return dbwOk;
  }

  /** FBS: создать (при необходимости) поставку и добавить заказ. PATCH /api/marketplace/v3/supplies/{supplyId}/orders */
  private async confirmFbsOrder(wbOrderId: number): Promise<boolean> {
    try {
      const supplyId = await this.createOrGetActiveSupply();
      if (!supplyId) return false;
      return await this.confirmFbsOrderWithSupply(wbOrderId, supplyId);
    } catch (error) {
      this.logError(error, 'confirmFbsOrder');
      return false;
    }
  }

  /** FBS: добавить заказ в уже известную поставку. */
  private async confirmFbsOrderWithSupply(wbOrderId: number, supplyId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.patch(
          `${this.MARKETPLACE_API}/api/marketplace/v3/supplies/${encodeURIComponent(supplyId)}/orders`,
          { orders: [wbOrderId] },
          {
            headers: {
              ...this.authHeader(),
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return true;
    } catch (error) {
      this.logError(error, 'confirmFbsOrderWithSupply');
      return false;
    }
  }

  /** DBS: PATCH /api/v3/dbs/orders/{orderId}/confirm */
  private async confirmDbsOrder(wbOrderId: number): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.patch(
          `${this.MARKETPLACE_API}/api/v3/dbs/orders/${wbOrderId}/confirm`,
          {},
          {
            headers: {
              ...this.authHeader(),
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return true;
    } catch (error) {
      this.logError(error, 'confirmDbsOrder');
      return false;
    }
  }

  /** DBW: PATCH /api/v3/dbw/orders/{orderId}/confirm (требует statsToken) */
  private async confirmDbwOrder(wbOrderId: number): Promise<boolean> {
    const token = this.config.statsToken ?? this.config.apiKey;
    if (!token) return false;
    try {
      await firstValueFrom(
        this.httpService.patch(
          `${this.MARKETPLACE_API}/api/v3/dbw/orders/${wbOrderId}/confirm`,
          {},
          {
            headers: {
              ...this.authHeader(token),
              'Content-Type': 'application/json',
            },
          },
        ),
      );
      return true;
    } catch (error) {
      this.logError(error, 'confirmDbwOrder');
      return false;
    }
  }

  /** Создать новую поставку или вернуть id активной (FBS). */
  private async createOrGetActiveSupply(): Promise<string | null> {
    try {
      let next = 0;
      const limit = 1000;
      let activeId: string | null = null;
      do {
        const { data } = await firstValueFrom(
          this.httpService.get<{ supplies?: Array<{ id: string; done?: boolean }>; next?: number }>(
            `${this.MARKETPLACE_API}/api/v3/supplies`,
            {
              headers: this.authHeader(),
              params: { limit, next },
            },
          ),
        );
        const list = data?.supplies ?? [];
        const active = list.find((s) => !s.done);
        if (active?.id) {
          activeId = active.id;
          break;
        }
        next = data?.next ?? 0;
      } while (next > 0);

      if (activeId) return activeId;

      const name = `HandySeller-${new Date().toISOString().slice(0, 10)}`;
      const { data: created } = await firstValueFrom(
        this.httpService.post<{ id?: string }>(
          `${this.MARKETPLACE_API}/api/v3/supplies`,
          { name },
          { headers: { ...this.authHeader(), 'Content-Type': 'application/json' } },
        ),
      );
      return created?.id ?? null;
    } catch (error) {
      this.logError(error, 'createOrGetActiveSupply');
      const msg = this.extractWbErrorMessage(error);
      throw new Error(msg || 'WB API: ошибка при получении/создании поставки');
    }
  }

  private extractWbErrorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'response' in error) {
      const res = (error as { response?: { data?: Record<string, unknown>; status?: number } }).response;
      const data = res?.data;
      if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>;
        if (d.message) return String(d.message);
        if (d.errorText) return String(d.errorText);
        if (d.detail) return String(d.detail);
        if (Array.isArray(d.errors) && d.errors.length > 0) return String(d.errors[0]);
      }
      if (res?.status) return `WB API ответ: ${res.status}`;
    }
    return error instanceof Error ? error.message : String(error);
  }

  /** Публичный метод для сервисов: получить или создать активную поставку FBS. */
  async ensureFbsSupply(): Promise<string | null> {
    return this.createOrGetActiveSupply();
  }

  /** Добавить грузоместа (коробки) в поставку. POST /api/v3/supplies/{supplyId}/trbx */
  async addTrbxToSupply(supplyId: string, amount: number): Promise<string[]> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<{ trbxIds?: string[] }>(
          `${this.MARKETPLACE_API}/api/v3/supplies/${encodeURIComponent(supplyId)}/trbx`,
          { amount },
          { headers: { ...this.authHeader(), 'Content-Type': 'application/json' } },
        ),
      );
      return data?.trbxIds ?? [];
    } catch (error) {
      this.logError(error, 'addTrbxToSupply');
      const msg = this.extractWbErrorMessage(error);
      throw new Error(msg || 'WB API: не удалось добавить коробку в поставку');
    }
  }

  /** Получить стикеры грузомест. POST /api/v3/supplies/{supplyId}/trbx/stickers */
  async getTrbxStickers(supplyId: string, trbxIds: string[], type: 'svg' | 'png' | 'zplv' | 'zplh' = 'png'): Promise<Array<{ trbxId: string; file: string }>> {
    const { data } = await firstValueFrom(
      this.httpService.post<{ stickers?: Array<{ trbxId: string; file: string }> }>(
        `${this.MARKETPLACE_API}/api/v3/supplies/${encodeURIComponent(supplyId)}/trbx/stickers`,
        { trbxIds },
        {
          headers: { ...this.authHeader(), 'Content-Type': 'application/json' },
          params: { type },
        },
      ),
    );
    return data?.stickers ?? [];
  }

  /** Получить ID заказов в поставке. GET /api/marketplace/v3/supplies/{supplyId}/order-ids */
  async getSupplyOrderIds(supplyId: string): Promise<string[]> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{ orderIds?: number[] }>(
          `${this.MARKETPLACE_API}/api/marketplace/v3/supplies/${encodeURIComponent(supplyId)}/order-ids`,
          { headers: this.authHeader() },
        ),
      );
      const ids = data?.orderIds ?? [];
      return ids.map((n) => String(n));
    } catch {
      return [];
    }
  }

  /** Сдать поставку в доставку. PATCH /api/v3/supplies/{supplyId}/deliver */
  async deliverSupply(supplyId: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.httpService.patch(
          `${this.MARKETPLACE_API}/api/v3/supplies/${encodeURIComponent(supplyId)}/deliver`,
          {},
          { headers: this.authHeader() },
        ),
      );
      return true;
    } catch (error) {
      this.logError(error, 'deliverSupply');
      return false;
    }
  }

  /** Получить QR-код поставки для СЦ. GET /api/v3/supplies/{supplyId}/barcode (только после deliver). При сдаче на ПВЗ не требуется. */
  async getSupplyBarcode(supplyId: string, type: 'svg' | 'png' | 'zplv' | 'zplh' = 'png'): Promise<{ barcode: string; file: string } | null> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<{ barcode?: string; file?: string }>(
          `${this.MARKETPLACE_API}/api/v3/supplies/${encodeURIComponent(supplyId)}/barcode`,
          { headers: this.authHeader(), params: { type } },
        ),
      );
      if (data?.barcode && data?.file) return { barcode: data.barcode, file: data.file };
      return null;
    } catch (error) {
      this.logError(error, 'getSupplyBarcode');
      return null;
    }
  }

  /** Список грузомест поставки. GET /api/v3/supplies/{supplyId}/trbx */
  async getSupplyTrbx(supplyId: string): Promise<Array<{ id: string }>> {
    const { data } = await firstValueFrom(
      this.httpService.get<{ trbxes?: Array<{ id: string }> }>(
        `${this.MARKETPLACE_API}/api/v3/supplies/${encodeURIComponent(supplyId)}/trbx`,
        { headers: this.authHeader() },
      ),
    );
    return data?.trbxes ?? [];
  }

  private mapStatusToWB(status: string): number {
    const statusMap: Record<string, number> = {
      NEW: 1,
      IN_PROGRESS: 2,
      CONFIRMED: 2,
      SHIPPED: 3,
      READY_FOR_PICKUP: 3, // WB: готов к выдаче — тот же код, что и shipped
      DELIVERED: 4,
      CANCELLED: 5,
    };
    return statusMap[status] ?? 1;
  }

  async syncProducts(products: ProductData[]): Promise<SyncResult> {
    const result: SyncResult = { success: true, syncedCount: 0, failedCount: 0, errors: [], createdMappings: [] };
    for (const product of products) {
      try {
        let nmId: string | undefined;
        if (product.wbNmId != null && product.wbNmId > 0) {
          nmId = String(product.wbNmId);
        } else {
          const wbMatch = product.sku?.match(/^WB-[^-]+-(\d+)$/);
          nmId = wbMatch?.[1];
        }
        if (nmId) {
          const ok = await this.updateProduct(nmId, product);
          if (ok) result.syncedCount++;
          else {
            result.failedCount++;
            result.errors?.push(`Товар ${product.name}: ошибка обновления на WB`);
          }
        } else {
          // Ищем существующую карточку по vendorCode перед созданием новой
          const vendorCode = (product.vendorCode ?? product.sku)?.toString().trim();
          const existingNmId = vendorCode ? await this.findNmIdByVendorCode(vendorCode) : undefined;
          
          if (existingNmId) {
            // Нашли карточку на WB — обновляем вместо создания
            console.log(`[WildberriesAdapter] Найдена существующая карточка nmId=${existingNmId} для vendorCode=${vendorCode}, обновляем`);
            const ok = await this.updateProduct(String(existingNmId), product);
            if (ok) {
              result.syncedCount++;
              // Сохраняем маппинг для будущих синхронизаций
              result.createdMappings?.push({ productId: product.id, externalSystemId: String(existingNmId) });
            } else {
              result.failedCount++;
              result.errors?.push(`Товар ${product.name}: ошибка обновления на WB`);
            }
          } else {
            // Карточки нет — создаём новую
            const extId = await this.uploadProduct(product);
            result.syncedCount++;
            result.createdMappings?.push({ productId: product.id, externalSystemId: extId });
          }
        }
      } catch (error) {
        result.failedCount++;
        result.errors?.push(`Товар ${product.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    result.success = result.failedCount === 0;
    return result;
  }

  /**
   * Получение списка товаров с Wildberries для импорта в каталог.
   * WB Content API: POST /content/v2/get/cards/list
   */
  async getProductsFromWb(): Promise<
    Array<{
      nmId: number;
      vendorCode: string;
      name: string;
      description?: string;
      imageUrl?: string;
      price?: number;
      brand?: string;
      color?: string;
      weight?: number;
      width?: number;
      length?: number;
      height?: number;
      itemsPerPack?: number;
      countryOfOrigin?: string;
      material?: string;
      craftType?: string;
      packageContents?: string;
      richContent?: string;
    }>
  > {
    try {
      let pricesList: unknown[] = [];
      try {
        const pricesRes = await firstValueFrom(
          this.httpService.get(`${this.PRICES_API}/public/api/v1/prices`, {
            headers: this.authHeader(),
            timeout: 5000,
          }),
        );
        pricesList = Array.isArray(pricesRes?.data) ? pricesRes.data : [];
      } catch {
        // Цены опциональны — при ошибке импортируем с price 0
      }
      const priceMap = new Map<number, number>();
      for (const p of pricesList as Array<{ nmID?: number; nmId?: number; price?: number }>) {
        const nmId = p?.nmID ?? p?.nmId;
        if (nmId != null && p?.price != null) priceMap.set(Number(nmId), Number(p.price) / 100);
      }

      const allCards: Record<string, unknown>[] = [];
      let cursor: { updatedAt?: string; nmID?: number; limit?: number } = { limit: 100 };
      const sort = { ascending: true };

      do {
        const cardsRes = await firstValueFrom(
          this.httpService.post(
            `${this.CONTENT_API}/content/v2/get/cards/list`,
            {
              settings: { cursor, sort, filter: { withPhoto: -1 } },
            },
            { headers: { ...this.authHeader(), 'Content-Type': 'application/json' }, timeout: 15000 },
          ),
        );
        const data = cardsRes?.data;
        if (data && typeof data === 'object' && (data as { error?: boolean }).error) {
          const errMsg = (data as { errorText?: string }).errorText ?? 'Ошибка WB API';
          throw new Error(errMsg);
        }
        const pageCards = (
          Array.isArray(data?.cards) ? data.cards
          : Array.isArray((data as { data?: { cards?: unknown[] } })?.data?.cards) ? (data as { data: { cards: unknown[] } }).data.cards
          : []
        ) as Record<string, unknown>[];
        allCards.push(...pageCards);
        const respCursor = (data?.cursor ?? {}) as { updatedAt?: string; nmID?: number; total?: number };
        const total = respCursor?.total ?? 0;
        if (pageCards.length === 0 || total < (cursor.limit ?? 100)) break;
        cursor = { updatedAt: respCursor.updatedAt, nmID: respCursor.nmID, limit: 100 };
      } while (true);

      /** Нормализует элемент addin/characteristics: WB может возвращать name/value или attributeName/attributeValue */
      const norm = (a: Record<string, unknown>): { name: string; value: string } => ({
        name: String((a.name ?? a.attributeName ?? a.attribute ?? '')).trim(),
        value: String((a.value ?? a.attributeValue ?? a.val ?? a.text ?? '')).trim(),
      });

      /** Собирает все источники характеристик: card.characteristics, goods[].addin, goods[].characteristics, card.addin */
      const collectAddin = (c: Record<string, unknown>): Array<{ name: string; value: string }> => {
        const raw: Array<Record<string, unknown>> = [];
        const cardChars = c.characteristics as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(cardChars)) raw.push(...cardChars);
        const cardAddin = c.addin as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(cardAddin)) raw.push(...cardAddin);
        const goodsList = c.goods as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(goodsList)) {
          for (const g of goodsList) {
            const ga = g.addin ?? g.characteristics;
            if (Array.isArray(ga)) raw.push(...ga);
          }
        }
        return raw.map(norm).filter((x) => x.name || x.value);
      };

      return allCards.map((card: Record<string, unknown>) => {
        const nmId = Number(card.nmID ?? card.nmId ?? 0);
        const goods = (card.goods as Array<{
          addin?: Array<Record<string, unknown>>;
          characteristics?: Array<Record<string, unknown>>;
          vendorCode?: string;
          width?: number;
          height?: number;
          length?: number;
          weightBrutto?: number;
        }>) ?? [];
        const good = goods[0];
        const addin = collectAddin(card);

        const findByKey = (key: string) =>
          addin.find((a) => (a.name || '').toLowerCase().includes(key.toLowerCase()))?.value;

        /** Поиск по нескольким вариантам ключа */
        const findByAnyKey = (keys: string[]) => {
          for (const k of keys) {
            const v = findByKey(k);
            if (v && String(v).trim()) return v;
          }
          return undefined;
        };

        const name =
          (card.title as string)?.trim() ||
          findByKey('наименование') ||
          String(card.vendorCode ?? good?.vendorCode ?? nmId);
        const description =
          (typeof card.description === 'string' && card.description.trim()) || findByKey('описание');
        const mediaFiles = (card.mediaFiles as Array<{ url?: string }>) ?? [];
        const imageUrl = mediaFiles[0]?.url;

        // Dimensions: WB возвращает cm и kg, Product хранит mm и g
        const dims = (card.dimensions ?? good) as { width?: number; height?: number; length?: number; weightBrutto?: number } | undefined;
        const wCm = dims?.width ?? good?.width;
        const hCm = dims?.height ?? good?.height;
        const lCm = dims?.length ?? good?.length;
        const weightKg = dims?.weightBrutto ?? good?.weightBrutto;
        const weight = weightKg != null ? Math.round(weightKg * 1000) : undefined;
        const width = wCm != null ? Math.round(wCm * 10) : undefined;
        const height = hCm != null ? Math.round(hCm * 10) : undefined;
        const length = lCm != null ? Math.round(lCm * 10) : undefined;

        const itemsPerPackVal = findByAnyKey(['количество предметов в упаковке', 'предметов в упаковке', 'в упаковке']);
        const itemsPerPack = itemsPerPackVal ? parseInt(String(itemsPerPackVal).replace(/\D/g, '') || '0', 10) : undefined;

        const seo = card.seoText as { description?: string } | undefined;
        const richVal =
          findByAnyKey(['рич контент', 'рич-контент', 'расширенное описание']) ??
          (card.extendedDescription as string) ??
          seo?.description;
        const richContent = typeof richVal === 'string' && richVal.trim() ? richVal.trim() : undefined;

        return {
          nmId,
          vendorCode: String(good?.vendorCode ?? card.vendorCode ?? nmId),
          name,
          description,
          imageUrl: imageUrl || undefined,
          price: priceMap.get(nmId),
          brand: (card.brand as string)?.trim() || undefined,
          color: findByAnyKey(['цвет'])?.trim() || undefined,
          weight: weight && weight > 0 ? weight : undefined,
          width: width && width > 0 ? width : undefined,
          length: length && length > 0 ? length : undefined,
          height: height && height > 0 ? height : undefined,
          itemsPerPack: itemsPerPack && itemsPerPack > 0 ? itemsPerPack : undefined,
          countryOfOrigin:
            ((card.countryProduction as string) ?? findByAnyKey(['страна производства', 'страна']))?.trim() || undefined,
          material: findByAnyKey(['материал изделия', 'материал'])?.trim() || undefined,
          craftType: findByAnyKey(['вид творчества', 'творчество', 'handmade'])?.trim() || undefined,
          packageContents: findByAnyKey(['комплектация', 'что входит'])?.trim() || undefined,
          richContent,
        };
      });
    } catch (error) {
      const axErr = error as { response?: { status?: number; data?: { detail?: string; title?: string; errors?: string[]; errorText?: string } } };
      const wbDetail = axErr?.response?.data?.errorText ?? axErr?.response?.data?.detail ?? axErr?.response?.data?.title;
      const wbErrors = axErr?.response?.data?.errors;
      const status = axErr?.response?.status;
      let msg = error instanceof Error ? error.message : String(error);
      if (status === 401) msg = 'Токен WB невалиден или истёк. Обновите токен в настройках.';
      else if (status === 403) msg = 'Нет доступа к Content API. Проверьте права токена.';
      else if (wbDetail) msg = wbDetail;
      else if (Array.isArray(wbErrors) && wbErrors.length) msg = wbErrors.join('; ');
      this.logError(error, 'getProductsFromWb');
      throw new Error(msg);
    }
  }

  /**
   * Отчёт о продажах — логистика и комиссии по заказам.
   * Требует statsToken (категория «Статистика и Аналитика»). Лимит: 1 запрос/мин.
   * @returns Map<srid, { logisticsCost, commissionAmount }> — агрегация по заказу
   */
  async getOrderCostsFromReport(
    dateFrom: Date,
    dateTo: Date,
  ): Promise<Map<string, { logisticsCost: number; commissionAmount: number }>> {
    const token = this.config.statsToken ?? this.config.apiKey;
    const result = new Map<string, { logisticsCost: number; commissionAmount: number }>();
    let rrdid = 0;
    const limit = 10000;

    while (true) {
      const res = await firstValueFrom(
        this.httpService.get<Array<Record<string, unknown>>>(
          `${this.STATISTICS_API}/api/v5/supplier/reportDetailByPeriod`,
          {
            headers: this.authHeader(token),
            params: {
              dateFrom: dateFrom.toISOString(),
              dateTo: dateTo.toISOString(),
              rrdid,
              limit,
            },
          },
        ),
      );
      const data = res.data;
      if (res.status === 204 || !Array.isArray(data) || data.length === 0) break;

      for (const row of data) {
        const qty = Number(row.quantity ?? 0);
        const docType = String(row.doc_type_name ?? '').toLowerCase();
        if (qty <= 0 || !docType.includes('продажа')) continue;

        const srid = String(row.srid ?? '').trim();
        if (!srid) continue;

        const deliveryRub = Number(row.delivery_rub ?? 0);
        const commission = Number(row.ppvz_sales_commission ?? 0);

        const existing = result.get(srid);
        if (existing) {
          existing.logisticsCost += deliveryRub;
          existing.commissionAmount += commission;
        } else {
          result.set(srid, { logisticsCost: deliveryRub, commissionAmount: commission });
        }
      }

      const last = data[data.length - 1];
      const nextRrdid = Number(last?.rrd_id ?? 0);
      if (nextRrdid <= 0 || data.length < limit) break;
      rrdid = nextRrdid;
      // WB: 1 запрос/мин. Ждём перед следующей страницей.
      await new Promise((r) => setTimeout(r, 65000));
    }

    return result;
  }

  async getStatistics(): Promise<{
    totalProducts: number;
    totalOrders: number;
    revenue: number;
    lastSyncAt: Date;
  }> {
    try {
      const [productsRes, ordersRes] = await Promise.all([
        firstValueFrom(
          this.httpService.post(
            `${this.CONTENT_API}/content/v2/get/cards/list`,
            {
              settings: { cursor: { limit: 100 }, filter: { withPhoto: -1 } },
            },
            { headers: { ...this.authHeader(), 'Content-Type': 'application/json' } },
          ),
        ),
        firstValueFrom(
          this.httpService.get(`${this.MARKETPLACE_API}/api/v3/orders`, {
            headers: this.authHeader(),
            // Календарный месяц: с 1-го числа текущего месяца
            params: {
              date_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
              limit: 1000,
            },
          }),
        ),
      ]);

      const cards = productsRes.data?.cards ?? [];
      const orders = ordersRes.data?.orders ?? [];
      const revenue = orders.reduce((sum: number, o: { totalPrice: number }) => sum + o.totalPrice / 100, 0);

      return {
        totalProducts: cards.length,
        totalOrders: orders.length,
        revenue,
        lastSyncAt: new Date(),
      };
    } catch (error) {
      this.logError(error, 'getStatistics');
      return { totalProducts: 0, totalOrders: 0, revenue: 0, lastSyncAt: new Date() };
    }
  }
}
