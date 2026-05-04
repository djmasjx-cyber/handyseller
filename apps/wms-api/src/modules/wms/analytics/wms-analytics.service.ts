import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { classifyTransferOrderLine } from '@handyseller/wms-domain';
import type {
  WmsBiImportBatchRecord,
  WmsBiRawRowRecord,
  WmsBiReplenishmentRiskRow,
  WmsBiTouristRow,
  WmsBiTransferByOpRow,
  WmsBiTransferFilterOptions,
  WmsBiTransferFilters,
  WmsBiTransferImportInput,
  WmsBiTransferImportResult,
  WmsBiTransferOrderKind,
  WmsBiTransferOrderLineInput,
  WmsBiTransferOrderLineRecord,
  WmsBiTransferSummary,
} from '@handyseller/wms-sdk';
import { createHash } from 'crypto';
import { Pool } from 'pg';
import * as XLSX from 'xlsx';

type JsonRow<T> = { payload: T };
type DbClient = Pick<Pool, 'query'>;

const REQUIRED_COLUMNS = [
  'Ссылка',
  'Номер',
  'Дата',
  'СкладОтправитель',
  'СкладПолучатель',
  'Номенклатура',
  'НоменклатураКод',
  'Цена',
] as const;

const HEADER_ALIASES: Record<string, string> = {
  ссылка: 'Ссылка',
  номер: 'Номер',
  дата: 'Дата',
  складотправитель: 'СкладОтправитель',
  'склад отправитель': 'СкладОтправитель',
  складполучатель: 'СкладПолучатель',
  'склад получатель': 'СкладПолучатель',
  номенклатура: 'Номенклатура',
  назначение: 'Назначение',
  номенклатураартикул: 'НоменклатураАртикул',
  'номенклатура артикул': 'НоменклатураАртикул',
  номенклатуракод: 'НоменклатураКод',
  'номенклатура код': 'НоменклатураКод',
  документоснование: 'ДокументОснование',
  'документ основание': 'ДокументОснование',
  эторозничнаяцена: 'ЭтоРозничнаяЦена',
  'это розничная цена': 'ЭтоРозничнаяЦена',
  цена: 'Цена',
  количество: 'Количество',
  розничнаяцена: 'РозничнаяЦена',
  'розничная цена': 'РозничнаяЦена',
  себестоимость: 'Себестоимость',
  контрогент: 'Контрогент',
};

const WAREHOUSE_TYPE_PREFIXES = [
  'Склад Недостачи/Пересортицы запчастей',
  'Склад для производства Спецтехники',
  'Склад ЦРД Коммерческие работы',
  'Склад ответ. хранения техники',
  'Склад Некондиция Запчасти',
  'Склад временного хранения',
  'Склад Товары в пути',
  'Склад Техники USED',
  'Склад Хоз. Нужды',
  'Склад на Контракт',
  'Склад Некондиция',
  'Склад Недопоставка',
  'Склад Генераторы',
  'Склад Запчасти',
  'Склад Гарантия',
  'Склад Техники',
  'Склад Реклама',
].sort((a, b) => b.length - a.length);

function nowIso(): string {
  return new Date().toISOString();
}

function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function buildPool(conn: string): Pool {
  const url = new URL(conn);
  const sslMode = url.searchParams.get('sslmode')?.toLowerCase();
  const usesManagedDbSsl = sslMode === 'require' || sslMode === 'prefer' || sslMode === 'verify-ca';
  if (usesManagedDbSsl) {
    url.searchParams.delete('sslmode');
  }
  return new Pool({
    connectionString: usesManagedDbSsl ? url.toString() : conn,
    ssl: usesManagedDbSsl ? { rejectUnauthorized: false } : undefined,
  });
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function canonHeader(value: unknown): string {
  const normalized = normalizeHeader(value);
  return HEADER_ALIASES[normalized] ?? String(value ?? '').trim();
}

function cleanString(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function nullableString(value: unknown): string | null {
  const cleaned = cleanString(value);
  return cleaned ? cleaned : null;
}

/** Парсит число из ячейки Excel (пробелы, запятая как десятичный разделитель). */
function parseMoneyRaw(value: unknown): number {
  const cleaned = String(value ?? '')
    .replace(/\s/g, '')
    .replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Денежные поля в файле могут содержать копейки после запятой; для аналитики приводим к целым рублям
 * с округлением вверх (по модулю для отрицательных значений — вниз по модулю).
 */
function ceilRubles(value: unknown): number {
  const raw = parseMoneyRaw(value);
  if (!Number.isFinite(raw) || raw === 0) return 0;
  return raw > 0 ? Math.ceil(raw - 1e-9) : -Math.ceil(-raw - 1e-9);
}

function parseQuantity(value: unknown): number {
  const cleaned = String(value ?? '')
    .replace(/\s/g, '')
    .replace(',', '.');
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseBooleanRu(value: unknown): boolean | null {
  const cleaned = cleanString(value).toLowerCase();
  if (!cleaned) return null;
  if (['да', 'true', '1', 'yes'].includes(cleaned)) return true;
  if (['нет', 'false', '0', 'no'].includes(cleaned)) return false;
  return null;
}

function parseWarehouseDimension(raw: string): { warehouseType: string; op: string } {
  const cleaned = cleanString(raw);
  if (!cleaned) {
    return { warehouseType: '', op: '' };
  }
  const normalized = cleaned.toLowerCase();
  const prefix = WAREHOUSE_TYPE_PREFIXES.find((candidate) => {
    const lower = candidate.toLowerCase();
    return normalized === lower || normalized.startsWith(`${lower} `);
  });
  if (prefix) {
    return {
      warehouseType: prefix,
      op: cleaned.slice(prefix.length).trim() || cleaned,
    };
  }
  const parts = cleaned.split(' ').filter(Boolean);
  if (parts.length >= 3 && parts[0].toLowerCase() === 'склад') {
    return {
      warehouseType: `${parts[0]} ${parts[1]}`,
      op: parts.slice(2).join(' '),
    };
  }
  if (parts.length >= 2 && parts[0].toLowerCase() === 'склад') {
    return {
      warehouseType: parts[0],
      op: parts.slice(1).join(' '),
    };
  }
  return { warehouseType: 'Без типа склада', op: cleaned };
}

function parseOrderDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, Math.floor(parsed.S))).toISOString();
    }
  }
  const cleaned = cleanString(value);
  const match = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh = '0', min = '0', ss = '0'] = match;
  return new Date(
    Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min), Number(ss)),
  ).toISOString();
}

function dateKey(value: string): string {
  return value.slice(0, 10);
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function matchesFilters(line: WmsBiTransferOrderLineRecord, filters: WmsBiTransferFilters): boolean {
  const normalized = normalizeTransferLine(line);
  if (filters.batchId && line.batchId !== filters.batchId) return false;
  if (filters.kind && line.kind !== filters.kind) return false;
  if (filters.from && line.orderDate < filters.from) return false;
  if (filters.to && line.orderDate > filters.to) return false;
  if (filters.receiverWarehouse && !normalized.receiverOp.toLowerCase().includes(filters.receiverWarehouse.toLowerCase())) {
    return false;
  }
  if (filters.senderWarehouse && !normalized.senderOp.toLowerCase().includes(filters.senderWarehouse.toLowerCase())) {
    return false;
  }
  if (filters.receiverOps?.length && !filters.receiverOps.includes(normalized.receiverOp)) {
    return false;
  }
  if (filters.senderOps?.length && !filters.senderOps.includes(normalized.senderOp)) {
    return false;
  }
  if (
    filters.warehouseTypes?.length &&
    !filters.warehouseTypes.includes(normalized.receiverWarehouseType) &&
    !filters.warehouseTypes.includes(normalized.senderWarehouseType)
  ) {
    return false;
  }
  if (filters.counterparties?.length) {
    const cp = normalized.counterparty?.trim() ?? '';
    if (!filters.counterparties.includes(cp)) return false;
  }
  if (filters.qtyMin != null && normalized.quantity < filters.qtyMin) return false;
  if (filters.qtyMax != null && normalized.quantity > filters.qtyMax) return false;
  if (filters.retailMin != null) {
    if (normalized.retailPrice == null || normalized.retailPrice < filters.retailMin) return false;
  }
  if (filters.retailMax != null) {
    if (normalized.retailPrice == null || normalized.retailPrice > filters.retailMax) return false;
  }
  if (filters.costMin != null) {
    if (normalized.costPrice == null || normalized.costPrice < filters.costMin) return false;
  }
  if (filters.costMax != null) {
    if (normalized.costPrice == null || normalized.costPrice > filters.costMax) return false;
  }
  if (filters.item) {
    const q = filters.item.toLowerCase();
    if (
      !line.itemName.toLowerCase().includes(q) &&
      !line.itemCode.toLowerCase().includes(q) &&
      !(line.itemArticle ?? '').toLowerCase().includes(q)
    ) {
      return false;
    }
  }
  return true;
}

function optionalMoneyFromLine(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const s = cleanString(value);
  if (!s) return null;
  const n = parseMoneyRaw(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTransferLine(line: WmsBiTransferOrderLineRecord): WmsBiTransferOrderLineRecord {
  const sender = parseWarehouseDimension(line.senderWarehouse);
  const receiver = parseWarehouseDimension(line.receiverWarehouse);
  const qty = (line as { quantity?: unknown }).quantity;
  const cp = (line as { counterparty?: unknown }).counterparty;
  return {
    ...line,
    senderWarehouseType: line.senderWarehouseType || sender.warehouseType,
    senderOp: line.senderOp || sender.op,
    receiverWarehouseType: line.receiverWarehouseType || receiver.warehouseType,
    receiverOp: line.receiverOp || receiver.op,
    quantity: typeof qty === 'number' && Number.isFinite(qty) ? qty : parseQuantity(qty),
    retailPrice: optionalMoneyFromLine((line as { retailPrice?: unknown }).retailPrice),
    costPrice: optionalMoneyFromLine((line as { costPrice?: unknown }).costPrice),
    counterparty: typeof cp === 'string' && cp.trim() ? cp.trim() : null,
  };
}

/** Сводка / SQL-агрегаты без полного скана строк в Node (только batch/период/тип). */
function summaryFiltersSqlOnly(filters: WmsBiTransferFilters): boolean {
  if (filters.receiverWarehouse?.trim()) return false;
  if (filters.senderWarehouse?.trim()) return false;
  if (filters.receiverOps?.length) return false;
  if (filters.senderOps?.length) return false;
  if (filters.warehouseTypes?.length) return false;
  if (filters.item?.trim()) return false;
  if (filters.counterparties?.length) return false;
  if (filters.qtyMin != null || filters.qtyMax != null) return false;
  if (filters.retailMin != null || filters.retailMax != null) return false;
  if (filters.costMin != null || filters.costMax != null) return false;
  return true;
}

function buildTransferAnalyticsWhere(userId: string, filters: WmsBiTransferFilters): { whereSql: string; params: unknown[] } {
  const params: unknown[] = [userId];
  const conds = ['user_id = $1'];
  if (filters.batchId?.trim()) {
    params.push(filters.batchId.trim());
    conds.push(`batch_id = $${params.length}`);
  }
  if (filters.from) {
    params.push(filters.from);
    conds.push(`order_date >= $${params.length}::timestamptz`);
  }
  if (filters.to) {
    params.push(filters.to);
    conds.push(`order_date <= $${params.length}::timestamptz`);
  }
  if (filters.kind === 'REPLENISHMENT' || filters.kind === 'TOURIST') {
    params.push(filters.kind);
    conds.push(`kind = $${params.length}`);
  }
  return { whereSql: conds.join(' AND '), params };
}

function clampLimit(value: number | undefined, fallback: number, min: number, max: number): number {
  const v = value == null || !Number.isFinite(value) ? fallback : value;
  return Math.min(max, Math.max(min, Math.floor(v)));
}

function clampOffset(value: number | undefined, max: number): number {
  const v = value == null || !Number.isFinite(value) ? 0 : value;
  return Math.min(max, Math.max(0, Math.floor(v)));
}

function numFromDb(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function isoDate(d: unknown): string {
  if (d instanceof Date && Number.isFinite(d.getTime())) return d.toISOString();
  return String(d ?? '');
}

type RelationalLineRow = {
  id: string;
  user_id: string;
  batch_id: string;
  row_number: number;
  order_ref: string | null;
  order_number: string;
  order_date: Date;
  sender_warehouse: string;
  receiver_warehouse: string;
  sender_warehouse_type: string | null;
  sender_op: string | null;
  receiver_warehouse_type: string | null;
  receiver_op: string | null;
  item_name: string;
  item_article: string | null;
  item_code: string;
  purpose: string | null;
  base_document: string | null;
  is_retail_price: boolean | null;
  price: unknown;
  kind: string;
  created_at: Date;
  quantity: unknown;
  retail_price: unknown;
  cost_price: unknown;
  counterparty: string | null;
};

function relationalRowToLine(row: RelationalLineRow): WmsBiTransferOrderLineRecord {
  const line: WmsBiTransferOrderLineRecord = {
    id: row.id,
    userId: row.user_id,
    batchId: row.batch_id,
    rowNumber: row.row_number,
    orderRef: row.order_ref,
    orderNumber: row.order_number,
    orderDate: isoDate(row.order_date),
    senderWarehouse: row.sender_warehouse,
    receiverWarehouse: row.receiver_warehouse,
    itemName: row.item_name,
    itemArticle: row.item_article,
    itemCode: row.item_code,
    purpose: row.purpose,
    baseDocument: row.base_document,
    isRetailPrice: row.is_retail_price,
    price: numFromDb(row.price),
    kind: (row.kind === 'REPLENISHMENT' || row.kind === 'TOURIST' ? row.kind : 'TOURIST') as WmsBiTransferOrderKind,
    createdAt: isoDate(row.created_at),
    quantity: numFromDb(row.quantity),
    retailPrice: row.retail_price == null ? null : numFromDb(row.retail_price),
    costPrice: row.cost_price == null ? null : numFromDb(row.cost_price),
    counterparty: row.counterparty?.trim() ? row.counterparty.trim() : null,
    senderWarehouseType: row.sender_warehouse_type?.trim() ?? '',
    senderOp: row.sender_op?.trim() ?? '',
    receiverWarehouseType: row.receiver_warehouse_type?.trim() ?? '',
    receiverOp: row.receiver_op?.trim() ?? '',
  };
  return normalizeTransferLine(line);
}

@Injectable()
export class WmsAnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(WmsAnalyticsService.name);
  private readonly pool: Pool | null;
  private readonly batches = new Map<string, WmsBiImportBatchRecord>();
  private readonly rawRows: WmsBiRawRowRecord[] = [];
  private readonly transferLines: WmsBiTransferOrderLineRecord[] = [];

  constructor() {
    const conn = process.env.WMS_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || '';
    this.pool = conn ? buildPool(conn) : null;
  }

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      this.logger.warn('WMS_DATABASE_URL is not set; WMS BI analytics runs with in-memory state only.');
      return;
    }
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS wms_bi_import_batch (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_name TEXT NOT NULL,
        file_name TEXT,
        checksum TEXT,
        status TEXT NOT NULL,
        raw_row_count INTEGER NOT NULL DEFAULT 0,
        imported_row_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_wms_bi_import_batch_user_created ON wms_bi_import_batch(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS ix_wms_bi_import_batch_checksum ON wms_bi_import_batch(user_id, checksum);

      CREATE TABLE IF NOT EXISTS wms_bi_raw_row (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        row_number INTEGER NOT NULL,
        payload JSONB NOT NULL,
        errors JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ix_wms_bi_raw_row_batch ON wms_bi_raw_row(batch_id, row_number);

      CREATE TABLE IF NOT EXISTS wms_bi_transfer_order_line (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        batch_id TEXT NOT NULL,
        row_number INTEGER NOT NULL,
        order_ref TEXT,
        order_number TEXT NOT NULL,
        order_date TIMESTAMPTZ NOT NULL,
        sender_warehouse TEXT NOT NULL,
        receiver_warehouse TEXT NOT NULL,
        item_name TEXT NOT NULL,
        item_article TEXT,
        item_code TEXT NOT NULL,
        purpose TEXT,
        base_document TEXT,
        is_retail_price BOOLEAN,
        price NUMERIC(18, 4) NOT NULL DEFAULT 0,
        kind TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        payload JSONB NOT NULL
      );
      CREATE INDEX IF NOT EXISTS ix_wms_bi_transfer_user_date ON wms_bi_transfer_order_line(user_id, order_date DESC);
      CREATE INDEX IF NOT EXISTS ix_wms_bi_transfer_batch ON wms_bi_transfer_order_line(batch_id);
      CREATE INDEX IF NOT EXISTS ix_wms_bi_transfer_receiver ON wms_bi_transfer_order_line(user_id, receiver_warehouse);
      CREATE INDEX IF NOT EXISTS ix_wms_bi_transfer_route ON wms_bi_transfer_order_line(user_id, sender_warehouse, receiver_warehouse);
      CREATE INDEX IF NOT EXISTS ix_wms_bi_transfer_item ON wms_bi_transfer_order_line(user_id, item_code);
      CREATE INDEX IF NOT EXISTS ix_wms_bi_transfer_kind ON wms_bi_transfer_order_line(user_id, kind);
      CREATE INDEX IF NOT EXISTS ix_wms_bi_transfer_user_batch ON wms_bi_transfer_order_line(user_id, batch_id);
    `);
    await this.pool.query(`
      ALTER TABLE wms_bi_transfer_order_line ADD COLUMN IF NOT EXISTS sender_warehouse_type TEXT NOT NULL DEFAULT '';
      ALTER TABLE wms_bi_transfer_order_line ADD COLUMN IF NOT EXISTS sender_op TEXT NOT NULL DEFAULT '';
      ALTER TABLE wms_bi_transfer_order_line ADD COLUMN IF NOT EXISTS receiver_warehouse_type TEXT NOT NULL DEFAULT '';
      ALTER TABLE wms_bi_transfer_order_line ADD COLUMN IF NOT EXISTS receiver_op TEXT NOT NULL DEFAULT '';
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ix_wms_bi_transfer_user_receiver_op ON wms_bi_transfer_order_line(user_id, receiver_op);
      CREATE INDEX IF NOT EXISTS ix_wms_bi_transfer_user_sender_op ON wms_bi_transfer_order_line(user_id, sender_op);
      CREATE INDEX IF NOT EXISTS ix_wms_bi_transfer_tourist_route ON wms_bi_transfer_order_line(user_id, kind, receiver_op, sender_op, item_code);
    `);
    // Do not await: backfill can touch many rows; blocking onModuleInit delays HTTP listen and fails staging deploy health checks.
    void this.backfillDenormWarehouseDimensions().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`WMS BI warehouse dimension backfill failed: ${msg}`);
    });
  }

  /** Заполняет denorm-колонки ОП/типа склада для строк, импортированных до появления колонок. */
  private async backfillDenormWarehouseDimensions(): Promise<void> {
    if (!this.pool) return;
    const CHUNK = 3000;
    const MAX_CHUNKS = 80;
    for (let i = 0; i < MAX_CHUNKS; i += 1) {
      const res = await this.pool.query<{ id: string; sender_warehouse: string; receiver_warehouse: string }>(
        `SELECT id, sender_warehouse, receiver_warehouse
         FROM wms_bi_transfer_order_line
         WHERE sender_op = '' OR receiver_op = '' OR sender_warehouse_type = '' OR receiver_warehouse_type = ''
         LIMIT $1`,
        [CHUNK],
      );
      if (res.rows.length === 0) return;
      const ids: string[] = [];
      const senderTypes: string[] = [];
      const senderOps: string[] = [];
      const receiverTypes: string[] = [];
      const receiverOps: string[] = [];
      for (const row of res.rows) {
        const s = parseWarehouseDimension(row.sender_warehouse);
        const r = parseWarehouseDimension(row.receiver_warehouse);
        ids.push(row.id);
        senderTypes.push(s.warehouseType);
        senderOps.push(s.op);
        receiverTypes.push(r.warehouseType);
        receiverOps.push(r.op);
      }
      await this.pool.query(
        `UPDATE wms_bi_transfer_order_line AS t
         SET sender_warehouse_type = u.swt,
             sender_op = u.so,
             receiver_warehouse_type = u.rwt,
             receiver_op = u.ro
         FROM (
           SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[])
             AS u(id, swt, so, rwt, ro)
         ) u
         WHERE t.id = u.id`,
        [ids, senderTypes, senderOps, receiverTypes, receiverOps],
      );
      if (res.rows.length < CHUNK) return;
    }
    this.logger.warn(
      `WMS BI: warehouse dimension backfill stopped after ${MAX_CHUNKS * CHUNK} rows; remaining rows use JS parse on read.`,
    );
  }

  async importTransferOrders(userId: string, input: WmsBiTransferImportInput): Promise<WmsBiTransferImportResult> {
    const buffer = Buffer.from(input.contentBase64, 'base64');
    if (!buffer.length) {
      throw new BadRequestException('Файл пустой или не прочитан.');
    }
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const workbook = XLSX.read(buffer, { cellDates: true, type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException('В Excel-файле не найден ни один лист.');
    }
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { blankrows: false, defval: '', header: 1, raw: true });
    if (rows.length < 2) {
      throw new BadRequestException('В файле нет строк данных.');
    }

    const headers = rows[0].map(canonHeader);
    const headerIndex = new Map(headers.map((h, index) => [h, index] as const));
    const missing = REQUIRED_COLUMNS.filter((col) => !headerIndex.has(col));
    if (missing.length) {
      throw new BadRequestException(`В файле нет обязательных колонок: ${missing.join(', ')}.`);
    }

    const ts = nowIso();
    const batch: WmsBiImportBatchRecord = {
      id: id('wmsbi_batch'),
      userId,
      sourceType: 'FILE',
      sourceName: 'transfer-orders',
      fileName: input.fileName.trim() || 'transfer-orders.xlsx',
      checksum,
      status: 'IMPORTED',
      rawRowCount: 0,
      importedRowCount: 0,
      errorCount: 0,
      createdAt: ts,
      updatedAt: ts,
    };

    const rawRows: WmsBiRawRowRecord[] = [];
    const lines: WmsBiTransferOrderLineRecord[] = [];
    for (let r = 1; r < rows.length; r += 1) {
      const row = rows[r];
      const rowNumber = r + 1;
      const rawPayload: Record<string, unknown> = {};
      for (const [idx, header] of headers.entries()) {
        if (!header) continue;
        rawPayload[header] = row[idx] ?? '';
      }
      const errors: string[] = [];
      const lineInput = this.rowToTransferLineInput(rawPayload, rowNumber, errors);
      const raw: WmsBiRawRowRecord = {
        id: id('wmsbi_raw'),
        userId,
        batchId: batch.id,
        rowNumber,
        payload: rawPayload,
        errors,
        createdAt: ts,
      };
      rawRows.push(raw);
      if (!lineInput || errors.length) continue;
      lines.push(this.buildTransferLine(userId, batch.id, lineInput, ts));
    }

    batch.rawRowCount = rawRows.length;
    batch.importedRowCount = lines.length;
    batch.errorCount = rawRows.filter((row) => row.errors.length > 0).length;
    batch.status = batch.errorCount === rawRows.length ? 'FAILED' : 'IMPORTED';
    batch.updatedAt = nowIso();

    await this.saveImport(batch, rawRows, lines);
    const summary = this.buildSummary(lines);
    return { batch, summary };
  }

  async listImports(userId: string): Promise<WmsBiImportBatchRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsBiImportBatchRecord>>(
        'SELECT payload FROM wms_bi_import_batch WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
        [userId],
      );
      return res.rows.map((r) => r.payload);
    }
    return [...this.batches.values()].filter((b) => b.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Удаляет партию импорта и все связанные строки (сырые и нормализованные) для пользователя.
   */
  async deleteImportBatch(userId: string, batchId: string): Promise<{ deleted: true }> {
    const id = batchId.trim();
    if (!id) {
      throw new BadRequestException('Не указан идентификатор партии.');
    }

    if (this.pool) {
      const exists = await this.pool.query<{ id: string }>(
        'SELECT id FROM wms_bi_import_batch WHERE id = $1 AND user_id = $2',
        [id, userId],
      );
      if (exists.rowCount === 0) {
        throw new NotFoundException('Партия не найдена.');
      }
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM wms_bi_transfer_order_line WHERE user_id = $1 AND batch_id = $2', [userId, id]);
        await client.query('DELETE FROM wms_bi_raw_row WHERE user_id = $1 AND batch_id = $2', [userId, id]);
        await client.query('DELETE FROM wms_bi_import_batch WHERE user_id = $1 AND id = $2', [userId, id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return { deleted: true };
    }

    const batch = this.batches.get(id);
    if (!batch || batch.userId !== userId) {
      throw new NotFoundException('Партия не найдена.');
    }
    this.batches.delete(id);
    for (let i = this.rawRows.length - 1; i >= 0; i -= 1) {
      const row = this.rawRows[i];
      if (row.batchId === id && row.userId === userId) {
        this.rawRows.splice(i, 1);
      }
    }
    for (let i = this.transferLines.length - 1; i >= 0; i -= 1) {
      const line = this.transferLines[i];
      if (line.batchId === id && line.userId === userId) {
        this.transferLines.splice(i, 1);
      }
    }
    return { deleted: true };
  }

  async getTransferSummary(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiTransferSummary> {
    if (this.pool && summaryFiltersSqlOnly(filters)) {
      return this.getTransferSummarySql(userId, filters);
    }
    return this.buildSummary(await this.filteredLines(userId, filters));
  }

  private async getTransferSummarySql(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiTransferSummary> {
    const { whereSql: where, params } = buildTransferAnalyticsWhere(userId, filters);
    const sql = `
      SELECT
        COUNT(*)::bigint AS rows_total,
        COUNT(DISTINCT order_number)::bigint AS orders_total,
        COUNT(*) FILTER (WHERE kind = 'REPLENISHMENT')::bigint AS replenishment_rows,
        COUNT(DISTINCT CASE WHEN kind = 'REPLENISHMENT' THEN order_number END)::bigint AS replenishment_orders,
        COALESCE(SUM(price) FILTER (WHERE kind = 'REPLENISHMENT'), 0)::float8 AS replenishment_value,
        COUNT(*) FILTER (WHERE kind = 'TOURIST')::bigint AS tourist_rows,
        COUNT(DISTINCT CASE WHEN kind = 'TOURIST' THEN order_number END)::bigint AS tourist_orders,
        COALESCE(SUM(price) FILTER (WHERE kind = 'TOURIST'), 0)::float8 AS tourist_value,
        COALESCE(SUM(price), 0)::float8 AS value_total,
        MIN((order_date AT TIME ZONE 'UTC')::date)::text AS min_d,
        MAX((order_date AT TIME ZONE 'UTC')::date)::text AS max_d
      FROM wms_bi_transfer_order_line
      WHERE ${where}
    `;
    const res = await this.pool!.query<{
      rows_total: string;
      orders_total: string;
      replenishment_rows: string;
      replenishment_orders: string;
      replenishment_value: string;
      tourist_rows: string;
      tourist_orders: string;
      tourist_value: string;
      value_total: string;
      min_d: string | null;
      max_d: string | null;
    }>(sql, params);
    const r = res.rows[0];
    if (!r) {
      return {
        rowsTotal: 0,
        ordersTotal: 0,
        replenishmentRows: 0,
        replenishmentOrders: 0,
        replenishmentValue: 0,
        touristRows: 0,
        touristOrders: 0,
        touristValue: 0,
        valueTotal: 0,
        minDate: null,
        maxDate: null,
      };
    }
    return {
      rowsTotal: Number(r.rows_total),
      ordersTotal: Number(r.orders_total),
      replenishmentRows: Number(r.replenishment_rows),
      replenishmentOrders: Number(r.replenishment_orders),
      replenishmentValue: numFromDb(r.replenishment_value),
      touristRows: Number(r.tourist_rows),
      touristOrders: Number(r.tourist_orders),
      touristValue: numFromDb(r.tourist_value),
      valueTotal: numFromDb(r.value_total),
      minDate: r.min_d ?? null,
      maxDate: r.max_d ?? null,
    };
  }

  /**
   * Варианты для фильтров. Если передан batchId — только по строкам этой партии
   * (согласовано с сводками при выбранной партии).
   */
  async getTransferOptions(userId: string, batchId?: string | null): Promise<WmsBiTransferFilterOptions> {
    const narrow: WmsBiTransferFilters = batchId?.trim() ? { batchId: batchId.trim() } : {};
    if (this.pool && summaryFiltersSqlOnly(narrow)) {
      return this.getTransferOptionsSql(userId, narrow);
    }
    const scope = batchId?.trim() || undefined;
    const lines = await this.listLines(userId, scope);
    return {
      warehouseTypes: uniqueSorted(
        lines.flatMap((line) => [line.senderWarehouseType, line.receiverWarehouseType]).filter(Boolean),
      ),
      receiverOps: uniqueSorted(lines.map((line) => line.receiverOp).filter(Boolean)),
      senderOps: uniqueSorted(lines.map((line) => line.senderOp).filter(Boolean)),
      counterparties: uniqueSortedCounterparties(
        lines.map((line) => normalizeTransferLine(line).counterparty ?? ''),
      ),
    };
  }

  private async getTransferOptionsSql(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiTransferFilterOptions> {
    const { whereSql, params } = buildTransferAnalyticsWhere(userId, filters);
    const [recvTypes, sendTypes, recvOps, sendOps, cps] = await Promise.all([
      this.pool!.query<{ v: string }>(
        `SELECT DISTINCT receiver_warehouse_type AS v FROM wms_bi_transfer_order_line WHERE ${whereSql} AND COALESCE(receiver_warehouse_type, '') <> '' ORDER BY 1`,
        params,
      ),
      this.pool!.query<{ v: string }>(
        `SELECT DISTINCT sender_warehouse_type AS v FROM wms_bi_transfer_order_line WHERE ${whereSql} AND COALESCE(sender_warehouse_type, '') <> '' ORDER BY 1`,
        params,
      ),
      this.pool!.query<{ v: string }>(
        `SELECT DISTINCT receiver_op AS v FROM wms_bi_transfer_order_line WHERE ${whereSql} AND COALESCE(receiver_op, '') <> '' ORDER BY 1`,
        params,
      ),
      this.pool!.query<{ v: string }>(
        `SELECT DISTINCT sender_op AS v FROM wms_bi_transfer_order_line WHERE ${whereSql} AND COALESCE(sender_op, '') <> '' ORDER BY 1`,
        params,
      ),
      this.pool!.query<{ v: string | null }>(
        `SELECT DISTINCT trim(COALESCE(payload->>'counterparty','')) AS v FROM wms_bi_transfer_order_line WHERE ${whereSql}`,
        params,
      ),
    ]);
    const warehouseTypes = uniqueSorted([
      ...recvTypes.rows.map((r) => r.v),
      ...sendTypes.rows.map((r) => r.v),
    ]);
    return {
      warehouseTypes,
      receiverOps: uniqueSorted(recvOps.rows.map((r) => r.v)),
      senderOps: uniqueSorted(sendOps.rows.map((r) => r.v)),
      counterparties: uniqueSortedCounterparties(cps.rows.map((r) => (r.v ?? '').trim())),
    };
  }

  private async getTransfersByOpSql(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiTransferByOpRow[]> {
    const { whereSql, params } = buildTransferAnalyticsWhere(userId, filters);
    const limit = clampLimit(filters.byOpLimit, 500, 1, 2000);
    const offset = clampOffset(filters.byOpOffset, 500_000);
    const limParam = params.length + 1;
    const offParam = params.length + 2;
    const sql = `
      WITH g AS (
        SELECT
          receiver_op,
          MIN(receiver_warehouse) AS receiver_warehouse,
          MIN(receiver_warehouse_type) AS receiver_warehouse_type,
          COUNT(*)::bigint AS rows_n,
          COUNT(DISTINCT order_number)::bigint AS orders_n,
          COUNT(*) FILTER (WHERE kind = 'REPLENISHMENT')::bigint AS replenishment_rows,
          COUNT(*) FILTER (WHERE kind = 'TOURIST')::bigint AS tourist_rows,
          COALESCE(SUM(price), 0)::float8 AS value_total,
          COALESCE(SUM(price) FILTER (WHERE kind = 'TOURIST'), 0)::float8 AS tourist_value,
          MIN((order_date AT TIME ZONE 'UTC')::date)::text AS first_d,
          MAX((order_date AT TIME ZONE 'UTC')::date)::text AS last_d
        FROM wms_bi_transfer_order_line
        WHERE ${whereSql}
        GROUP BY receiver_op
      )
      SELECT * FROM g
      ORDER BY tourist_rows DESC, value_total DESC
      LIMIT $${limParam} OFFSET $${offParam}
    `;
    const res = await this.pool!.query<{
      receiver_op: string;
      receiver_warehouse: string;
      receiver_warehouse_type: string;
      rows_n: string;
      orders_n: string;
      replenishment_rows: string;
      tourist_rows: string;
      value_total: string;
      tourist_value: string;
      first_d: string | null;
      last_d: string | null;
    }>(sql, [...params, limit, offset]);
    return res.rows.map((r) => ({
      receiverWarehouse: r.receiver_warehouse,
      receiverWarehouseType: r.receiver_warehouse_type,
      receiverOp: r.receiver_op,
      rows: Number(r.rows_n),
      orders: Number(r.orders_n),
      replenishmentRows: Number(r.replenishment_rows),
      touristRows: Number(r.tourist_rows),
      valueTotal: numFromDb(r.value_total),
      touristValue: numFromDb(r.tourist_value),
      firstDate: r.first_d ?? null,
      lastDate: r.last_d ?? null,
    }));
  }

  private async getTouristsSql(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiTouristRow[]> {
    const { whereSql, params } = buildTransferAnalyticsWhere(userId, filters);
    const limit = clampLimit(filters.touristsLimit, 300, 1, 2000);
    const offset = clampOffset(filters.touristsOffset, 500_000);
    const limParam = params.length + 1;
    const offParam = params.length + 2;
    const sql = `
      SELECT
        receiver_op,
        MIN(receiver_warehouse) AS receiver_warehouse,
        MIN(receiver_warehouse_type) AS receiver_warehouse_type,
        sender_op,
        MIN(sender_warehouse) AS sender_warehouse,
        MIN(sender_warehouse_type) AS sender_warehouse_type,
        item_code,
        MAX(item_name) AS item_name,
        MAX(item_article) AS item_article,
        COUNT(*)::bigint AS rows_n,
        COUNT(DISTINCT order_number)::bigint AS orders_n,
        COALESCE(SUM(price), 0)::float8 AS value_total,
        MIN((order_date AT TIME ZONE 'UTC')::date)::text AS first_d,
        MAX((order_date AT TIME ZONE 'UTC')::date)::text AS last_d
      FROM wms_bi_transfer_order_line
      WHERE ${whereSql}
      GROUP BY receiver_op, sender_op, item_code
      ORDER BY value_total DESC, rows_n DESC
      LIMIT $${limParam} OFFSET $${offParam}
    `;
    const res = await this.pool!.query<{
      receiver_op: string;
      receiver_warehouse: string;
      receiver_warehouse_type: string;
      sender_op: string;
      sender_warehouse: string;
      sender_warehouse_type: string;
      item_code: string;
      item_name: string;
      item_article: string | null;
      rows_n: string;
      orders_n: string;
      value_total: string;
      first_d: string | null;
      last_d: string | null;
    }>(sql, [...params, limit, offset]);
    return res.rows.map((r) => ({
      receiverWarehouse: r.receiver_warehouse,
      receiverWarehouseType: r.receiver_warehouse_type,
      receiverOp: r.receiver_op,
      senderWarehouse: r.sender_warehouse,
      senderWarehouseType: r.sender_warehouse_type,
      senderOp: r.sender_op,
      itemCode: r.item_code,
      itemArticle: r.item_article,
      itemName: r.item_name,
      rows: Number(r.rows_n),
      orders: Number(r.orders_n),
      valueTotal: numFromDb(r.value_total),
      firstDate: r.first_d ?? null,
      lastDate: r.last_d ?? null,
    }));
  }

  async getTransfersByOp(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiTransferByOpRow[]> {
    if (this.pool && summaryFiltersSqlOnly(filters)) {
      try {
        return await this.getTransfersByOpSql(userId, filters);
      } catch (err) {
        this.logger.warn(`getTransfersByOpSql fallback: ${(err as Error).message}`);
      }
    }
    const groups = new Map<string, WmsBiTransferOrderLineRecord[]>();
    for (const line of await this.filteredLines(userId, filters)) {
      const group = groups.get(line.receiverOp) ?? [];
      group.push(line);
      groups.set(line.receiverOp, group);
    }
    const limit = clampLimit(filters.byOpLimit, 500, 1, 2000);
    const offset = clampOffset(filters.byOpOffset, 500_000);
    const sorted = [...groups.entries()]
      .map(([receiverOp, lines]) => {
        const first = lines[0];
        return {
          receiverWarehouse: first.receiverWarehouse,
          receiverWarehouseType: first.receiverWarehouseType,
          receiverOp,
          rows: lines.length,
          orders: new Set(lines.map((l) => l.orderNumber)).size,
          replenishmentRows: lines.filter((l) => l.kind === 'REPLENISHMENT').length,
          touristRows: lines.filter((l) => l.kind === 'TOURIST').length,
          valueTotal: sum(lines.map((l) => l.price)),
          touristValue: sum(lines.filter((l) => l.kind === 'TOURIST').map((l) => l.price)),
          firstDate: minDate(lines),
          lastDate: maxDate(lines),
        };
      })
      .sort((a, b) => b.touristRows - a.touristRows || b.valueTotal - a.valueTotal);
    return sorted.slice(offset, offset + limit);
  }

  async getTourists(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiTouristRow[]> {
    const merged = { ...filters, kind: 'TOURIST' as const };
    if (this.pool && summaryFiltersSqlOnly(merged)) {
      try {
        return await this.getTouristsSql(userId, merged);
      } catch (err) {
        this.logger.warn(`getTouristsSql fallback: ${(err as Error).message}`);
      }
    }
    const groups = new Map<string, WmsBiTransferOrderLineRecord[]>();
    for (const line of await this.filteredLines(userId, merged)) {
      const key = [line.receiverOp, line.senderOp, line.itemCode].join('\t');
      const group = groups.get(key) ?? [];
      group.push(line);
      groups.set(key, group);
    }
    const limit = clampLimit(filters.touristsLimit, 300, 1, 2000);
    const offset = clampOffset(filters.touristsOffset, 500_000);
    const sorted = [...groups.values()]
      .map((lines) => {
        const first = lines[0];
        return {
          receiverWarehouse: first.receiverWarehouse,
          receiverWarehouseType: first.receiverWarehouseType,
          receiverOp: first.receiverOp,
          senderWarehouse: first.senderWarehouse,
          senderWarehouseType: first.senderWarehouseType,
          senderOp: first.senderOp,
          itemCode: first.itemCode,
          itemArticle: first.itemArticle,
          itemName: first.itemName,
          rows: lines.length,
          orders: new Set(lines.map((l) => l.orderNumber)).size,
          valueTotal: sum(lines.map((l) => l.price)),
          firstDate: minDate(lines),
          lastDate: maxDate(lines),
        };
      })
      .sort((a, b) => b.valueTotal - a.valueTotal || b.rows - a.rows);
    return sorted.slice(offset, offset + limit);
  }

  async getReplenishmentRisks(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiReplenishmentRiskRow[]> {
    const groups = new Map<string, WmsBiTransferOrderLineRecord[]>();
    for (const line of await this.filteredLines(userId, filters)) {
      const key = [line.receiverOp, line.itemCode].join('\t');
      const group = groups.get(key) ?? [];
      group.push(line);
      groups.set(key, group);
    }
    const risks: WmsBiReplenishmentRiskRow[] = [];
    for (const lines of groups.values()) {
      const sorted = [...lines].sort((a, b) => a.orderDate.localeCompare(b.orderDate));
      let lastReplenishment: WmsBiTransferOrderLineRecord | null = null;
      let tourists: WmsBiTransferOrderLineRecord[] = [];
      const flush = (nextReplenishmentDate: string | null) => {
        if (!lastReplenishment || tourists.length === 0) return;
        risks.push({
          receiverWarehouse: lastReplenishment.receiverWarehouse,
          receiverWarehouseType: lastReplenishment.receiverWarehouseType,
          receiverOp: lastReplenishment.receiverOp,
          itemCode: lastReplenishment.itemCode,
          itemArticle: lastReplenishment.itemArticle,
          itemName: lastReplenishment.itemName,
          replenishmentDate: lastReplenishment.orderDate,
          nextReplenishmentDate,
          touristRowsUntilNextReplenishment: tourists.length,
          touristOrdersUntilNextReplenishment: new Set(tourists.map((t) => t.orderNumber)).size,
          touristValueUntilNextReplenishment: sum(tourists.map((t) => t.price)),
        });
      };
      for (const line of sorted) {
        if (line.kind === 'REPLENISHMENT') {
          flush(line.orderDate);
          lastReplenishment = line;
          tourists = [];
        } else if (lastReplenishment) {
          tourists.push(line);
        }
      }
      flush(null);
    }
    const lim = clampLimit(filters.risksLimit, 250, 1, 2000);
    const off = clampOffset(filters.risksOffset, 500_000);
    return risks
      .sort(
        (a, b) =>
          b.touristValueUntilNextReplenishment - a.touristValueUntilNextReplenishment ||
          b.touristRowsUntilNextReplenishment - a.touristRowsUntilNextReplenishment,
      )
      .slice(off, off + lim);
  }

  private rowToTransferLineInput(
    row: Record<string, unknown>,
    rowNumber: number,
    errors: string[],
  ): WmsBiTransferOrderLineInput | null {
    const orderDate = parseOrderDate(row['Дата']);
    const input: WmsBiTransferOrderLineInput = {
      rowNumber,
      orderRef: nullableString(row['Ссылка']),
      orderNumber: cleanString(row['Номер']),
      orderDate: orderDate ?? '',
      senderWarehouse: cleanString(row['СкладОтправитель']),
      receiverWarehouse: cleanString(row['СкладПолучатель']),
      itemName: cleanString(row['Номенклатура']),
      itemArticle: nullableString(row['НоменклатураАртикул']),
      itemCode: cleanString(row['НоменклатураКод']),
      purpose: nullableString(row['Назначение']),
      baseDocument: nullableString(row['ДокументОснование']),
      isRetailPrice: parseBooleanRu(row['ЭтоРозничнаяЦена']),
      quantity: parseQuantity(row['Количество']),
      retailPrice: cleanString(row['РозничнаяЦена']) ? ceilRubles(row['РозничнаяЦена']) : null,
      costPrice: cleanString(row['Себестоимость']) ? ceilRubles(row['Себестоимость']) : null,
      counterparty: nullableString(row['Контрогент']),
      price: ceilRubles(row['Цена']),
    };
    if (!input.orderNumber) errors.push('Не заполнен номер заказа.');
    if (!input.orderDate) errors.push('Не удалось распознать дату заказа.');
    if (!input.senderWarehouse) errors.push('Не заполнен склад-отправитель.');
    if (!input.receiverWarehouse) errors.push('Не заполнен склад-получатель.');
    if (!input.itemName) errors.push('Не заполнена номенклатура.');
    if (!input.itemCode) errors.push('Не заполнен код номенклатуры.');
    return errors.length ? null : input;
  }

  private buildTransferLine(
    userId: string,
    batchId: string,
    input: WmsBiTransferOrderLineInput,
    createdAt: string,
  ): WmsBiTransferOrderLineRecord {
    const kind = classifyTransferOrderLine({
      purpose: input.purpose,
      baseDocument: input.baseDocument,
    });
    const sender = parseWarehouseDimension(input.senderWarehouse);
    const receiver = parseWarehouseDimension(input.receiverWarehouse);
    return {
      id: id('wmsbi_line'),
      userId,
      batchId,
      rowNumber: input.rowNumber,
      orderRef: input.orderRef ?? null,
      orderNumber: input.orderNumber.trim(),
      orderDate: input.orderDate,
      senderWarehouse: input.senderWarehouse.trim(),
      senderWarehouseType: sender.warehouseType,
      senderOp: sender.op,
      receiverWarehouse: input.receiverWarehouse.trim(),
      receiverWarehouseType: receiver.warehouseType,
      receiverOp: receiver.op,
      itemName: input.itemName.trim(),
      itemArticle: input.itemArticle?.trim() || null,
      itemCode: input.itemCode.trim(),
      purpose: input.purpose?.trim() || null,
      baseDocument: input.baseDocument?.trim() || null,
      isRetailPrice: input.isRetailPrice ?? null,
      quantity: input.quantity ?? 0,
      retailPrice: input.retailPrice ?? null,
      costPrice: input.costPrice ?? null,
      counterparty: input.counterparty?.trim() || null,
      price: input.price ?? 0,
      kind,
      createdAt,
    };
  }

  private async saveImport(
    batch: WmsBiImportBatchRecord,
    rawRows: WmsBiRawRowRecord[],
    lines: WmsBiTransferOrderLineRecord[],
  ): Promise<void> {
    this.batches.set(batch.id, batch);
    this.rawRows.push(...rawRows);
    this.transferLines.push(...lines);
    if (!this.pool) return;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO wms_bi_import_batch
         (id, user_id, source_type, source_name, file_name, checksum, status, raw_row_count, imported_row_count, error_count, created_at, updated_at, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)`,
        [
          batch.id,
          batch.userId,
          batch.sourceType,
          batch.sourceName,
          batch.fileName,
          batch.checksum,
          batch.status,
          batch.rawRowCount,
          batch.importedRowCount,
          batch.errorCount,
          batch.createdAt,
          batch.updatedAt,
          JSON.stringify(batch),
        ],
      );
      await this.insertRawRows(client, rawRows);
      await this.insertTransferLines(client, lines);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertRawRows(client: DbClient, rawRows: WmsBiRawRowRecord[]): Promise<void> {
    for (const part of chunks(rawRows, 500)) {
      const values: unknown[] = [];
      const placeholders = part.map((row, rowIndex) => {
        const base = rowIndex * 7;
        values.push(
          row.id,
          row.userId,
          row.batchId,
          row.rowNumber,
          JSON.stringify(row.payload),
          JSON.stringify(row.errors),
          row.createdAt,
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}::jsonb, $${base + 6}::jsonb, $${base + 7})`;
      });
      await client.query(
        `INSERT INTO wms_bi_raw_row (id, user_id, batch_id, row_number, payload, errors, created_at)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }
  }

  private async insertTransferLines(client: DbClient, lines: WmsBiTransferOrderLineRecord[]): Promise<void> {
    for (const part of chunks(lines, 300)) {
      const values: unknown[] = [];
      const placeholders = part.map((line, rowIndex) => {
        const base = rowIndex * 23;
        values.push(
          line.id,
          line.userId,
          line.batchId,
          line.rowNumber,
          line.orderRef,
          line.orderNumber,
          line.orderDate,
          line.senderWarehouse,
          line.receiverWarehouse,
          line.senderWarehouseType,
          line.senderOp,
          line.receiverWarehouseType,
          line.receiverOp,
          line.itemName,
          line.itemArticle,
          line.itemCode,
          line.purpose,
          line.baseDocument,
          line.isRetailPrice,
          line.price,
          line.kind,
          line.createdAt,
          JSON.stringify(line),
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}, $${base + 20}, $${base + 21}, $${base + 22}, $${base + 23}::jsonb)`;
      });
      await client.query(
        `INSERT INTO wms_bi_transfer_order_line
         (id, user_id, batch_id, row_number, order_ref, order_number, order_date, sender_warehouse, receiver_warehouse,
          sender_warehouse_type, sender_op, receiver_warehouse_type, receiver_op,
          item_name, item_article, item_code, purpose, base_document, is_retail_price, price, kind, created_at, payload)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }
  }

  private async filteredLines(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiTransferOrderLineRecord[]> {
    const batchScope = filters.batchId?.trim() || undefined;
    const lines = await this.listLines(userId, batchScope);
    return lines.filter((line) => matchesFilters(line, filters));
  }

  /**
   * Загружает строки без полного JSON payload (только колонки + нужные поля из payload),
   * чтобы большие импорты не вытягивали мегабайты дублей в память приложения.
   * @param restrictBatchId если задан — только эта партия (WHERE batch_id).
   */
  private async listLines(userId: string, restrictBatchId?: string | null): Promise<WmsBiTransferOrderLineRecord[]> {
    const batch = restrictBatchId?.trim() || null;
    if (this.pool) {
      const params: unknown[] = [userId];
      let where = 'user_id = $1';
      if (batch) {
        params.push(batch);
        where += ` AND batch_id = $${params.length}`;
      }
      const sql = `
        SELECT
          id, user_id, batch_id, row_number, order_ref, order_number, order_date,
          sender_warehouse, receiver_warehouse,
          sender_warehouse_type, sender_op, receiver_warehouse_type, receiver_op,
          item_name, item_article, item_code,
          purpose, base_document, is_retail_price, price, kind, created_at,
          COALESCE((NULLIF(trim(COALESCE(payload->>'quantity', '')), ''))::double precision, 0) AS quantity,
          CASE
            WHEN NULLIF(trim(COALESCE(payload->>'retailPrice', '')), '') IS NULL THEN NULL
            ELSE (NULLIF(trim(COALESCE(payload->>'retailPrice', '')), ''))::double precision
          END AS retail_price,
          CASE
            WHEN NULLIF(trim(COALESCE(payload->>'costPrice', '')), '') IS NULL THEN NULL
            ELSE (NULLIF(trim(COALESCE(payload->>'costPrice', '')), ''))::double precision
          END AS cost_price,
          NULLIF(trim(COALESCE(payload->>'counterparty', '')), '') AS counterparty
        FROM wms_bi_transfer_order_line
        WHERE ${where}
        ORDER BY order_date DESC
      `;
      const res = await this.pool.query<RelationalLineRow>(sql, params);
      return res.rows.map(relationalRowToLine);
    }
    let lines = this.transferLines.filter((line) => line.userId === userId).map(normalizeTransferLine);
    if (batch) {
      lines = lines.filter((line) => line.batchId === batch);
    }
    return lines;
  }

  private buildSummary(lines: WmsBiTransferOrderLineRecord[]): WmsBiTransferSummary {
    const replenishment = lines.filter((line) => line.kind === 'REPLENISHMENT');
    const tourists = lines.filter((line) => line.kind === 'TOURIST');
    return {
      rowsTotal: lines.length,
      ordersTotal: new Set(lines.map((line) => line.orderNumber)).size,
      replenishmentRows: replenishment.length,
      replenishmentOrders: new Set(replenishment.map((line) => line.orderNumber)).size,
      replenishmentValue: sum(replenishment.map((line) => line.price)),
      touristRows: tourists.length,
      touristOrders: new Set(tourists.map((line) => line.orderNumber)).size,
      touristValue: sum(tourists.map((line) => line.price)),
      valueTotal: sum(lines.map((line) => line.price)),
      minDate: minDate(lines),
      maxDate: maxDate(lines),
    };
  }
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
}

/** Уникальные контрагенты; пустая строка — строки без контрагента (для фильтра). */
function uniqueSortedCounterparties(values: string[]): string[] {
  const set = new Set(values.map((v) => v.trim()));
  return [...set].sort((a, b) => {
    if (a === '' && b !== '') return 1;
    if (b === '' && a !== '') return -1;
    return a.localeCompare(b, 'ru');
  });
}

function minDate(lines: WmsBiTransferOrderLineRecord[]): string | null {
  if (!lines.length) return null;
  return dateKey(lines.reduce((min, line) => (line.orderDate < min ? line.orderDate : min), lines[0].orderDate));
}

function maxDate(lines: WmsBiTransferOrderLineRecord[]): string | null {
  if (!lines.length) return null;
  return dateKey(lines.reduce((max, line) => (line.orderDate > max ? line.orderDate : max), lines[0].orderDate));
}
