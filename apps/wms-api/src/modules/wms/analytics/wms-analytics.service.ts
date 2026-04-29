import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
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

function parsePrice(value: unknown): number {
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

function normalizeTransferLine(line: WmsBiTransferOrderLineRecord): WmsBiTransferOrderLineRecord {
  const sender = parseWarehouseDimension(line.senderWarehouse);
  const receiver = parseWarehouseDimension(line.receiverWarehouse);
  return {
    ...line,
    senderWarehouseType: line.senderWarehouseType || sender.warehouseType,
    senderOp: line.senderOp || sender.op,
    receiverWarehouseType: line.receiverWarehouseType || receiver.warehouseType,
    receiverOp: line.receiverOp || receiver.op,
  };
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
    `);
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

  async getTransferSummary(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiTransferSummary> {
    return this.buildSummary(await this.filteredLines(userId, filters));
  }

  async getTransferOptions(userId: string): Promise<WmsBiTransferFilterOptions> {
    const lines = await this.listLines(userId);
    return {
      warehouseTypes: uniqueSorted(
        lines.flatMap((line) => [line.senderWarehouseType, line.receiverWarehouseType]).filter(Boolean),
      ),
      receiverOps: uniqueSorted(lines.map((line) => line.receiverOp).filter(Boolean)),
      senderOps: uniqueSorted(lines.map((line) => line.senderOp).filter(Boolean)),
    };
  }

  async getTransfersByOp(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiTransferByOpRow[]> {
    const groups = new Map<string, WmsBiTransferOrderLineRecord[]>();
    for (const line of await this.filteredLines(userId, filters)) {
      const group = groups.get(line.receiverOp) ?? [];
      group.push(line);
      groups.set(line.receiverOp, group);
    }
    return [...groups.entries()]
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
  }

  async getTourists(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiTouristRow[]> {
    const groups = new Map<string, WmsBiTransferOrderLineRecord[]>();
    for (const line of await this.filteredLines(userId, { ...filters, kind: 'TOURIST' })) {
      const key = [line.receiverOp, line.senderOp, line.itemCode].join('\t');
      const group = groups.get(key) ?? [];
      group.push(line);
      groups.set(key, group);
    }
    return [...groups.values()]
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
      .sort((a, b) => b.valueTotal - a.valueTotal || b.rows - a.rows)
      .slice(0, 250);
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
    return risks
      .sort(
        (a, b) =>
          b.touristValueUntilNextReplenishment - a.touristValueUntilNextReplenishment ||
          b.touristRowsUntilNextReplenishment - a.touristRowsUntilNextReplenishment,
      )
      .slice(0, 250);
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
      price: parsePrice(row['Цена']),
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
        const base = rowIndex * 19;
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
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}, $${base + 15}, $${base + 16}, $${base + 17}, $${base + 18}, $${base + 19}::jsonb)`;
      });
      await client.query(
        `INSERT INTO wms_bi_transfer_order_line
         (id, user_id, batch_id, row_number, order_ref, order_number, order_date, sender_warehouse, receiver_warehouse,
          item_name, item_article, item_code, purpose, base_document, is_retail_price, price, kind, created_at, payload)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }
  }

  private async filteredLines(userId: string, filters: WmsBiTransferFilters): Promise<WmsBiTransferOrderLineRecord[]> {
    const lines = await this.listLines(userId);
    return lines.filter((line) => matchesFilters(line, filters));
  }

  private async listLines(userId: string): Promise<WmsBiTransferOrderLineRecord[]> {
    if (this.pool) {
      const res = await this.pool.query<JsonRow<WmsBiTransferOrderLineRecord>>(
        'SELECT payload FROM wms_bi_transfer_order_line WHERE user_id = $1 ORDER BY order_date DESC',
        [userId],
      );
      return res.rows.map((r) => normalizeTransferLine(r.payload));
    }
    return this.transferLines.filter((line) => line.userId === userId).map(normalizeTransferLine);
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
  return Math.round(values.reduce((acc, v) => acc + v, 0) * 100) / 100;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
}

function minDate(lines: WmsBiTransferOrderLineRecord[]): string | null {
  if (!lines.length) return null;
  return dateKey(lines.reduce((min, line) => (line.orderDate < min ? line.orderDate : min), lines[0].orderDate));
}

function maxDate(lines: WmsBiTransferOrderLineRecord[]): string | null {
  if (!lines.length) return null;
  return dateKey(lines.reduce((max, line) => (line.orderDate > max ? line.orderDate : max), lines[0].orderDate));
}
