import { Logger } from '@nestjs/common';
import type {
  CarrierDescriptor,
  CarrierQuote,
  CreateShipmentRequestInput,
  InternalCarrierCredentials,
  ShipmentDocumentRecord,
  ShipmentRecord,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';
import type {
  CarrierAdapter,
  CarrierBookInput,
  CarrierDocumentDownloadInput,
  CarrierQuoteContext,
} from './base-carrier.adapter';

/** Публичный калькулятор ДЛ: https://api.dellin.ru/v1/public/calculator.json (см. dev.dellin.ru, примеры интеграций). */
const DELLIN_PUBLIC_CALCULATOR_PATH = '/v1/public/calculator';
/** Поиск КЛАДР для сопоставления строки адреса с кодом населённого пункта. */
const DELLIN_PUBLIC_KLADR_PATH = '/v2/public/kladr';
/** Логин в личный кабинет ДЛ для получения sessionID. */
const DELLIN_AUTH_LOGIN_PATH = '/v3/auth/login';
/** Создание/черновик заявки на перевозку. */
const DELLIN_REQUEST_PATH = '/v2/request';
/** Справочник контрагентов (включая ОПФ/form) для текущей сессии. */
const DELLIN_COUNTERAGENTS_PATH = '/v2/counteragents';
/** Печатные формы по заявке/накладной. */
const DELLIN_REQUEST_PDF_PATH = '/v1/customers/request/pdf';
/** UID России из справочника ДЛ `/v1/references/countries`. */
const DELLIN_RUSSIA_COUNTRY_UID = '0x8f51001438c4d49511dbd774581edb7a';

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function dellinJsonUrl(base: string, path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}.json`;
}

function withRequestIdHeaders(
  headers: Record<string, string>,
  requestId?: string | null,
): Record<string, string> {
  const trimmed = (requestId ?? '').trim();
  if (!trimmed) return headers;
  return { ...headers, 'x-request-id': trimmed };
}

function stripPostalPrefix(value: string): string {
  return value.replace(/^\s*\d{6}\s*,?\s*/u, '').trim();
}

/** Варианты строки для поиска по КЛАДР (от более информативных к более коротким). */
function kladrSearchVariants(label: string | null | undefined): string[] {
  if (!label) return [];
  let s = label.replace(/\s+/g, ' ').trim();
  if (!s) return [];

  const out: string[] = [];
  const push = (x: string) => {
    const t = stripPostalPrefix(x).replace(/\s+/g, ' ').trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };

  if (/MANUAL/i.test(s)) {
    const before = s.split(/MANUAL/i)[0]?.replace(/[/\s,-]+$/u, '').trim();
    if (before) push(before);
  }

  if (s.includes('->')) {
    for (const part of s.split('->')) push(part);
  }

  push(s);

  for (const part of s.split(',').map((p) => p.trim())) {
    if (part) push(part);
  }

  const cityInG = /(?:г\.?|город)\s*([А-Яа-яЁё0-9\-. ]{1,80})/giu;
  let m: RegExpExecArray | null;
  while ((m = cityInG.exec(s)) != null) {
    push(m[1].trim());
  }

  const settlement =
    /(?:деревня|д\.?|посёлок|пгт\.?|село|с\.)\s*([А-Яа-яЁё0-9\-. ]{1,80})/giu;
  while ((m = settlement.exec(s)) != null) {
    push(m[1].trim());
  }

  return out;
}

function parseKladrFirstCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const citiesRaw =
    (root.cities as unknown) ??
    ((root.data as Record<string, unknown> | undefined)?.cities as unknown) ??
    ((root.data as Record<string, unknown> | undefined)?.city as unknown);
  const cities = Array.isArray(citiesRaw) ? citiesRaw : citiesRaw ? [citiesRaw] : [];
  for (const item of cities) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const code = o.code ?? o.aString ?? o.cityUID ?? o.uid ?? o.kladrCode;
    if (typeof code === 'string' && /^\d{10,}/u.test(code.replace(/\s/g, ''))) {
      return code.replace(/\s/g, '');
    }
    if (typeof code === 'number' && String(code).length >= 10) {
      return String(code);
    }
  }
  return null;
}

function parsePublicCalculator(
  payload: unknown,
): { priceRub: number; etaDays: number; insuranceRub: number | null } | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;

  if (root.errors) {
    return null;
  }

  const priceRub = asNumber(root.price);
  if (!priceRub || priceRub <= 0) {
    return null;
  }

  const insuranceRub = asNumber(root.insurance ?? root.insurancePrice ?? root.insuranceCost);

  const time = root.time as Record<string, unknown> | undefined;
  let etaDays = 2;
  if (time) {
    const std = asNumber(time.standard ?? time.value ?? time.days);
    if (std != null && std > 0) {
      etaDays = Math.max(1, Math.round(std));
    } else if (typeof time.nominative === 'string') {
      const digits = time.nominative.match(/\d+/u);
      if (digits) etaDays = Math.max(1, parseInt(digits[0], 10));
    }
  }

  return { priceRub, etaDays, insuranceRub: insuranceRub && insuranceRub > 0 ? insuranceRub : null };
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstNonEmptyStringOrNumber(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function parseDellinSessionId(payload: unknown): string | null {
  const root = asObject(payload);
  if (!root) return null;
  const data = asObject(root.data);
  return (
    firstNonEmptyString(
      root.sessionID,
      root.sessionId,
      data?.sessionID,
      data?.sessionId,
      data?.session,
      data?.session_id,
    ) ?? null
  );
}

function parseDellinRequesterUid(payload: unknown): string | null {
  const root = asObject(payload);
  if (!root) return null;
  const data = asObject(root.data);
  const direct =
    firstNonEmptyString(
      root.requesterUID,
      root.requesterUid,
      root.counteragentUID,
      root.counteragentUid,
      root.uid,
      root.userUID,
      root.userUid,
      data?.requesterUID,
      data?.requesterUid,
      data?.counteragentUID,
      data?.counteragentUid,
      data?.uid,
      data?.userUID,
      data?.userUid,
    ) ?? null;
  if (isDellinUid(direct)) return direct;

  // Fallback: рекурсивно ищем UID по всему auth payload, т.к. формат ответа ДЛ может отличаться по аккаунтам.
  const seen = new Set<unknown>();
  const walk = (node: unknown): string | null => {
    if (!node || seen.has(node)) return null;
    if (typeof node === 'string') {
      return isDellinUid(node) ? node.trim() : null;
    }
    if (Array.isArray(node)) {
      seen.add(node);
      for (const item of node) {
        const hit = walk(item);
        if (hit) return hit;
      }
      return null;
    }
    const obj = asObject(node);
    if (!obj) return null;
    seen.add(obj);
    // Сначала пробуем ключи, где обычно лежит UID.
    const priorityKeys = [
      'requesterUID',
      'requesterUid',
      'counteragentUID',
      'counteragentUid',
      'uid',
      'userUID',
      'userUid',
      'senderUID',
      'senderUid',
    ];
    for (const key of priorityKeys) {
      const val = obj[key];
      if (typeof val === 'string' && isDellinUid(val)) return val.trim();
    }
    // Затем обходим все поля.
    for (const val of Object.values(obj)) {
      const hit = walk(val);
      if (hit) return hit;
    }
    return null;
  };
  return walk(root);
}

function parseDellinErrors(payload: unknown): string[] {
  const root = asObject(payload);
  if (!root) return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim()) out.push(v.trim());
  };
  const walk = (node: unknown) => {
    if (!node) return;
    if (typeof node === 'string') return push(node);
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    const obj = asObject(node);
    if (!obj) return;
    const code = typeof obj.code === 'number' || typeof obj.code === 'string' ? String(obj.code) : null;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const detail = typeof obj.detail === 'string' ? obj.detail.trim() : '';
    const fields = Array.isArray(obj.fields)
      ? obj.fields
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          .map((v) => v.trim())
      : [];
    if (code || title || detail || fields.length > 0) {
      const parts = [
        code ? `code=${code}` : null,
        title || null,
        detail || null,
        fields.length > 0 ? `fields=${fields.join(',')}` : null,
      ].filter(Boolean);
      if (parts.length > 0) out.push(parts.join(' | '));
    }
    push(obj.message);
    push(obj.error);
    push(obj.hint);
    if (obj.path && (obj.message || obj.error)) {
      push(`${String(obj.path)}: ${String(obj.message ?? obj.error)}`);
    }
  };
  walk(root.errors);
  walk(root.error);
  walk(asObject(root.metadata)?.errors);
  return [...new Set(out)];
}

function requiredDellinFieldErrors(input: CreateShipmentRequestInput): string[] {
  const fromAddress = (input.draft.originLabel || input.snapshot.originLabel || '').trim();
  const toAddress = (input.draft.destinationLabel || input.snapshot.destinationLabel || '').trim();
  const shipperName = input.snapshot.contacts?.shipper?.name?.trim() || '';
  const shipperPhone = input.snapshot.contacts?.shipper?.phone?.trim() || '';
  const recipientName = input.snapshot.contacts?.recipient?.name?.trim() || '';
  const recipientPhone = input.snapshot.contacts?.recipient?.phone?.trim() || '';
  const cargoTitle = input.snapshot.itemSummary[0]?.title?.trim() || '';

  const missing: string[] = [];
  if (!fromAddress) missing.push('адрес отправителя');
  if (!toAddress) missing.push('адрес получателя');
  if (!shipperName) missing.push('имя/название отправителя');
  if (!shipperPhone) missing.push('телефон отправителя');
  if (!recipientName) missing.push('имя/название получателя');
  if (!recipientPhone) missing.push('телефон получателя');
  if (!cargoTitle) missing.push('описание груза');
  return missing;
}

type DellinDraftValidation = {
  requestId: string | null;
  state: string | null;
  draftOnly: boolean;
};

type DellinAuthSession = {
  sessionID: string;
  requesterUid: string | null;
};

type DellinJsonResponse = {
  res: Response | null;
  data: Record<string, unknown> | null;
};

type DellinCounteragentProfile = {
  uid: string;
  name: string | null;
  inn: string | null;
  juridical: boolean | null;
  isCurrent: boolean;
};

function maskPhone(value: string): string {
  const digits = value.replace(/\D+/g, '');
  if (digits.length < 6) return '***';
  return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
}

function truncate(value: string, max = 180): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function normalizeDellinPhone(value: string | null | undefined): string {
  const digits = (value ?? '').replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return digits;
  if (digits.length > 11) {
    const tail = digits.slice(-10);
    return `7${tail}`;
  }
  return `7${digits.padStart(10, '0').slice(-10)}`;
}

function ymdInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function isValidYmd(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\d{4}-\d{2}-\d{2}$/u.test(value.trim());
}

function isValidHm(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^([01]\d|2[0-3]):[0-5]\d$/u.test(value.trim());
}

type DellinCounteragentForm = string | number | Record<string, unknown> | null;

function dellinCounteragentPatch(value: DellinCounteragentForm): Record<string, unknown> {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value) && 'customForm' in value) {
    return value;
  }
  return { form: value };
}

function dellinCustomForm(formName: string, juridical: boolean): Record<string, unknown> {
  return {
    formName,
    countryUID: process.env.DELLIN_COUNTRY_UID?.trim() || DELLIN_RUSSIA_COUNTRY_UID,
    juridical,
  };
}

function defaultDellinLegalFormName(name: string | null | undefined): string {
  const value = (name ?? '').trim();
  const prefix = value.match(/^(АО|ОАО|ЗАО|ПАО|ООО|ИП)\b/iu)?.[1];
  return prefix?.toUpperCase() || 'Юридическое лицо';
}

function dellinReceiverDocument(): Record<string, unknown> {
  return {
    type: process.env.DELLIN_RECEIVER_DOCUMENT_TYPE?.trim() || 'foreignPassport',
    serial: process.env.DELLIN_RECEIVER_DOCUMENT_SERIAL?.trim() || '0000',
    number: process.env.DELLIN_RECEIVER_DOCUMENT_NUMBER?.trim() || '000000',
  };
}

function findDellinCounteragentProfiles(node: unknown, out: DellinCounteragentProfile[] = []): DellinCounteragentProfile[] {
  if (!node) return out;
  if (Array.isArray(node)) {
    for (const item of node) findDellinCounteragentProfiles(item, out);
    return out;
  }
  if (typeof node !== 'object') return out;
  const obj = node as Record<string, unknown>;
  const uid = firstNonEmptyString(obj.uid, obj.counteragentUID, obj.counteragentUid);
  const name = firstNonEmptyString(obj.name, obj.fullName, obj.shortName);
  const safeUid = uid?.trim();
  if (safeUid && isDellinUid(safeUid) && name) {
    out.push({
      uid: safeUid,
      name,
      inn: firstNonEmptyString(obj.inn),
      juridical: typeof obj.juridical === 'boolean' ? obj.juridical : null,
      isCurrent: obj.isCurrent === true,
    });
  }
  for (const value of Object.values(obj)) {
    findDellinCounteragentProfiles(value, out);
  }
  return out;
}

function collectDellinForms(node: unknown, out: Array<string | number | Record<string, unknown>>): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectDellinForms(item, out);
    return;
  }
  if (typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const form = obj.form;
  if (typeof form === 'string' && form.trim()) out.push(form.trim());
  if (typeof form === 'number' && Number.isFinite(form)) out.push(form);
  if (form && typeof form === 'object' && !Array.isArray(form)) out.push(form as Record<string, unknown>);
  for (const value of Object.values(obj)) {
    collectDellinForms(value, out);
  }
}

function findDellinFormByUid(node: unknown, uid: string): unknown {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findDellinFormByUid(item, uid);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  const candidateUid = firstNonEmptyString(obj.uid, obj.counteragentUID, obj.counteragentUid);
  if (candidateUid?.trim() === uid.trim()) {
    const form = obj.form;
    if (form != null) return form;
  }
  for (const value of Object.values(obj)) {
    const hit = findDellinFormByUid(value, uid);
    if (hit) return hit;
  }
  return null;
}

function findDellinCounteragentIdByUid(node: unknown, uid: string): number | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findDellinCounteragentIdByUid(item, uid);
      if (hit != null) return hit;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  const candidateUid = firstNonEmptyString(obj.uid, obj.counteragentUID, obj.counteragentUid);
  if (candidateUid?.trim() === uid.trim()) {
    const idRaw = obj.id ?? obj.counteragentID ?? obj.counteragentId;
    if (typeof idRaw === 'number' && Number.isInteger(idRaw)) return idRaw;
    if (typeof idRaw === 'string' && /^\d+$/u.test(idRaw.trim())) return parseInt(idRaw.trim(), 10);
  }
  for (const value of Object.values(obj)) {
    const hit = findDellinCounteragentIdByUid(value, uid);
    if (hit != null) return hit;
  }
  return null;
}

function findFirstDellinCounteragentId(node: unknown): number | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findFirstDellinCounteragentId(item);
      if (hit != null) return hit;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  const idRaw = obj.id ?? obj.counteragentID ?? obj.counteragentId;
  if (typeof idRaw === 'number' && Number.isInteger(idRaw)) return idRaw;
  if (typeof idRaw === 'string' && /^\d+$/u.test(idRaw.trim())) return parseInt(idRaw.trim(), 10);
  for (const value of Object.values(obj)) {
    const hit = findFirstDellinCounteragentId(value);
    if (hit != null) return hit;
  }
  return null;
}

function extractDellinFormVariants(value: unknown): DellinCounteragentForm[] {
  if (value == null) return [];
  const out: DellinCounteragentForm[] = [];
  if (typeof value === 'string' && value.trim()) out.push(value.trim());
  if (typeof value === 'number' && Number.isFinite(value)) out.push(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    out.push(obj);
    for (const key of ['uid', 'id', 'code', 'value', 'name', 'shortName']) {
      const candidate = obj[key];
      if (typeof candidate === 'string' && candidate.trim()) out.push(candidate.trim());
      if (typeof candidate === 'number' && Number.isFinite(candidate)) out.push(candidate);
    }
  }
  return out;
}

function pushUniqueForm(
  list: DellinCounteragentForm[],
  value: DellinCounteragentForm,
): void {
  const normalized =
    value == null
      ? 'null'
      : typeof value === 'object'
      ? `obj:${JSON.stringify(value)}`
      : `${typeof value}:${String(value)}`;
  const exists = list.some((current) => {
    const currentNorm =
      current == null
        ? 'null'
        : typeof current === 'object'
        ? `obj:${JSON.stringify(current)}`
        : `${typeof current}:${String(current)}`;
    return currentNorm === normalized;
  });
  if (!exists) list.push(value);
}

function isDellinUid(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  if (!v) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

function extractDellinUidDeep(payload: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown): string | null => {
    if (!node || seen.has(node)) return null;
    if (typeof node === 'string') return isDellinUid(node) ? node.trim() : null;
    if (Array.isArray(node)) {
      seen.add(node);
      for (const item of node) {
        const hit = walk(item);
        if (hit) return hit;
      }
      return null;
    }
    const obj = asObject(node);
    if (!obj) return null;
    seen.add(obj);
    const priorityKeys = [
      'requesterUID',
      'requesterUid',
      'counteragentUID',
      'counteragentUid',
      'uid',
      'userUID',
      'userUid',
      'senderUID',
      'senderUid',
    ];
    for (const key of priorityKeys) {
      const val = obj[key];
      if (typeof val === 'string' && isDellinUid(val)) return val.trim();
    }
    for (const val of Object.values(obj)) {
      const hit = walk(val);
      if (hit) return hit;
    }
    return null;
  };
  return walk(payload);
}

function isLikelyPdf(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 16) return false;
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

function parseDellinDocMarker(content: string): { kind: 'waybill' | 'request'; requestId: string } | null {
  const parts = (content ?? '').trim().split(':');
  if (parts.length < 3) return null;
  if (parts[0] !== 'dellin-doc') return null;
  const kind = parts[1] === 'waybill' ? 'waybill' : parts[1] === 'request' ? 'request' : null;
  const requestId = parts.slice(2).join(':').trim();
  if (!kind || !requestId) return null;
  return { kind, requestId };
}

function findPdfLikeString(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') return payload.trim() || null;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const hit = findPdfLikeString(item);
      if (hit) return hit;
    }
    return null;
  }
  const obj = asObject(payload);
  if (!obj) return null;
  const directKeys = [
    'pdf',
    'file',
    'base64',
    'pdfBase64',
    'content',
    'url',
    'link',
    'downloadUrl',
    'downloadURL',
  ];
  for (const key of directKeys) {
    const hit = findPdfLikeString(obj[key]);
    if (hit) return hit;
  }
  const nestedKeys = ['data', 'result', 'document', 'documents', 'payload'];
  for (const key of nestedKeys) {
    const hit = findPdfLikeString(obj[key]);
    if (hit) return hit;
  }
  return null;
}

export class DellinAdapter implements CarrierAdapter {
  private readonly logger = new Logger(DellinAdapter.name);
  private readonly dellinDebug =
    process.env.TMS_DELLIN_DEBUG === '1' || process.env.TMS_DELLIN_DEBUG === 'true';
  private readonly counteragentFormCache = new Map<string, { value: DellinCounteragentForm; expiresAt: number }>();
  private readonly counteragentIdCache = new Map<string, { value: number | null; expiresAt: number }>();
  readonly descriptor: CarrierDescriptor = {
    id: 'dellin',
    code: 'DELLIN',
    name: 'Деловые Линии',
    modes: ['ROAD'],
    supportedFlags: ['EXPRESS', 'CONSOLIDATED'],
    supportsTracking: false,
    supportsBooking: process.env.DELLIN_ENABLE_BOOKING !== 'false',
    requiresCredentials: true,
  };

  async quote(
    input: CreateShipmentRequestInput,
    requestId: string,
    context: CarrierQuoteContext,
  ): Promise<CarrierQuote[]> {
    const traceId = context.requestId ?? requestId;
    const credentials = await this.loadCredentials(context, requestId);
    if (!credentials) {
      this.logger.warn(`Dellin quote skipped: missing credentials context; requestId=${requestId}`);
      return [];
    }

    const appKey = (credentials.appKey ?? '').trim() || process.env.DELLIN_APP_KEY?.trim();
    if (!appKey) {
      this.logger.warn(`Dellin quote skipped: missing appKey; requestId=${requestId}`);
      return [];
    }

    const base = (process.env.DELLIN_API_BASE ?? 'https://api.dellin.ru').replace(/\/+$/, '');

    const originLabel = input.draft.originLabel || input.snapshot.originLabel;
    const destLabel = input.draft.destinationLabel || input.snapshot.destinationLabel;

    const defaultDerivalKladr = process.env.DELLIN_DEFAULT_DERIVAL_KLADR?.trim();
    const originCode =
      (await this.resolveKladrCode(base, appKey, kladrSearchVariants(originLabel), requestId)) ??
      defaultDerivalKladr ??
      (await this.resolveKladrCode(base, appKey, ['Москва'], requestId));

    const destCode = await this.resolveKladrCode(base, appKey, kladrSearchVariants(destLabel), requestId);

    if (!originCode || !destCode) {
      this.logger.warn(
        `Dellin quote skipped: KLADR resolution failed; requestId=${requestId}; originResolved=${Boolean(
          originCode,
        )}; destResolved=${Boolean(destCode)}`,
      );
      return [];
    }

    const cargo = input.snapshot.cargo;
    const weightKg = Math.max(cargo.weightGrams / 1000, 0.01);
    const volM3 = Math.max(
      ((cargo.lengthMm ?? 300) / 1000) * ((cargo.widthMm ?? 210) / 1000) * ((cargo.heightMm ?? 500) / 1000),
      0.0001,
    );
    const statedValue = Math.max(cargo.declaredValueRub, 1);

    const lenM = Math.max((cargo.lengthMm ?? 0) / 1000, 0.01);
    const widM = Math.max((cargo.widthMm ?? 0) / 1000, 0.01);
    const hgtM = Math.max((cargo.heightMm ?? 0) / 1000, 0.01);
    const calcUrl = dellinJsonUrl(base, DELLIN_PUBLIC_CALCULATOR_PATH);
    const serviceFlags = input.draft.serviceFlags.filter((flag) =>
      this.descriptor.supportedFlags.includes(flag),
    );
    const variants = [
      { key: 'door-door', label: 'Дверь → дверь', derivalDoor: true, arrivalDoor: true },
      { key: 'door-terminal', label: 'Дверь → терминал', derivalDoor: true, arrivalDoor: false },
      { key: 'terminal-terminal', label: 'Терминал → терминал', derivalDoor: false, arrivalDoor: false },
      { key: 'terminal-door', label: 'Терминал → дверь', derivalDoor: false, arrivalDoor: true },
    ] as const;

    const quotes: CarrierQuote[] = [];
    for (const variant of variants) {
      const calcBody: Record<string, unknown> = {
        appkey: appKey,
        derivalPoint: originCode,
        arrivalPoint: destCode,
        derivalDoor: variant.derivalDoor,
        arrivalDoor: variant.arrivalDoor,
        sizedVolume: Number(volM3.toFixed(4)),
        sizedWeight: Number(weightKg.toFixed(3)),
        statedValue,
      };
      if (cargo.lengthMm && cargo.widthMm && cargo.heightMm) {
        calcBody.length = Number(lenM.toFixed(3));
        calcBody.width = Number(widM.toFixed(3));
        calcBody.height = Number(hgtM.toFixed(3));
      }
      const res = await fetch(calcUrl, {
        method: 'POST',
        headers: withRequestIdHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' }, traceId),
        body: JSON.stringify(calcBody),
        cache: 'no-store',
      }).catch(() => null);
      if (!res?.ok) {
        this.logger.warn(
          `Dellin calculator HTTP failed: status=${res?.status ?? 'n/a'}; url=${calcUrl}; requestId=${requestId}; variant=${variant.key}`,
        );
        continue;
      }
      const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!data) continue;
      const parsed = parsePublicCalculator(data);
      if (!parsed) continue;
      const { priceRub, etaDays, insuranceRub } = parsed;
      const insNote = insuranceRub != null ? ` · страховка ~${insuranceRub} ₽` : '';
      quotes.push({
        id: `${requestId}:${this.descriptor.id}:${variant.key}`,
        requestId,
        carrierId: this.descriptor.id,
        carrierName: this.descriptor.name,
        mode: this.descriptor.modes[0],
        priceRub,
        etaDays,
        serviceFlags,
        notes: `${variant.label} · ${credentials.accountLabel ?? 'Договор'} · КЛАДР ${originCode.slice(0, 13)}…→${destCode.slice(0, 13)}… · оценка ${statedValue} ₽${insNote}`,
        priceDetails: {
          source: 'carrier_total',
          totalRub: priceRub,
          insuranceRub: insuranceRub ?? undefined,
          currency: 'RUB',
          comment: `Dellin public calculator (${variant.label})`,
        },
        score: Math.round((100000 / Math.max(priceRub, 1)) * 100) / 100,
      });
    }
    return quotes;
  }

  async book({ quote, input, context }: CarrierBookInput): Promise<{
    shipment: Omit<ShipmentRecord, 'id' | 'userId' | 'createdAt'>;
    tracking: Array<Omit<TrackingEventRecord, 'id'>>;
    documents?: Array<Pick<ShipmentDocumentRecord, 'type' | 'title' | 'content'>>;
  }> {
    const draftOnly = process.env.DELLIN_DRAFT_ONLY === 'true';
    const traceId = context.requestId ?? quote.requestId;
    const credentials = await this.loadCredentials(context, quote.requestId);
    if (!credentials) {
      throw new Error('Dellin booking failed: missing credentials');
    }
    const draft = await this.validateDraftRequest(input, credentials, quote.requestId, traceId);
    const trackingNumber = draft.requestId
      ? `DELLIN-REQ-${draft.requestId}`
      : `DELLIN-PENDING-${Date.now().toString().slice(-6)}`;
    return {
      shipment: {
        requestId: quote.requestId,
        carrierId: quote.carrierId,
        carrierName: quote.carrierName,
        trackingNumber,
        carrierOrderReference: draft.requestId ?? undefined,
        status: draft.draftOnly ? 'CREATED' : 'CONFIRMED',
        priceRub: quote.priceRub,
        etaDays: quote.etaDays,
      },
      tracking: [
        {
          shipmentId: '',
          status: draft.draftOnly ? 'CREATED' : 'CONFIRMED',
          description: draft.draftOnly
            ? `Черновик заявки в ДЛ проверен (inOrder=false). requestId=${draft.requestId ?? 'n/a'}`
            : `Заявка в ДЛ отправлена. requestId=${draft.requestId ?? 'n/a'}`,
          occurredAt: new Date().toISOString(),
        },
      ],
      documents: draft.requestId ? this.createDocumentStubs(draft.requestId) : undefined,
    };
  }

  async downloadDocument({
    shipment,
    document,
    context,
  }: CarrierDocumentDownloadInput): Promise<{ content: Buffer; mimeType: string; fileName: string }> {
    const traceId = context.requestId ?? shipment.requestId;
    const marker = parseDellinDocMarker(document.content ?? '');
    if (!marker) {
      return {
        content: Buffer.from(document.content ?? '', 'utf-8'),
        mimeType: 'text/plain; charset=utf-8',
        fileName: `${shipment.trackingNumber || shipment.id}-${document.type.toLowerCase()}.txt`,
      };
    }
    const credentials = await this.loadCredentials(context, shipment.requestId);
    if (!credentials) {
      throw new Error('Dellin document download failed: missing credentials');
    }
    const appKey = (credentials.appKey ?? '').trim() || process.env.DELLIN_APP_KEY?.trim();
    if (!appKey) {
      throw new Error('Dellin document download failed: missing appKey');
    }
    const base = (process.env.DELLIN_API_BASE ?? 'https://api.dellin.ru').replace(/\/+$/, '');
    const auth = await this.getSessionAuth(
      base,
      appKey,
      credentials.login,
      credentials.password,
      shipment.requestId,
      traceId,
    );
    const sessionID = auth.sessionID;
    const pdf = await this.fetchPrintableFormPdf(base, appKey, sessionID, marker.requestId, marker.kind, traceId);
    return {
      content: pdf,
      mimeType: 'application/pdf',
      fileName: `${marker.requestId}-dellin-${marker.kind}.pdf`,
    };
  }

  private async validateDraftRequest(
    input: CreateShipmentRequestInput,
    credentials: InternalCarrierCredentials,
    requestId: string,
    traceId?: string | null,
  ): Promise<DellinDraftValidation> {
    const appKey = (credentials.appKey ?? '').trim() || process.env.DELLIN_APP_KEY?.trim();
    if (!appKey) throw new Error('Dellin booking failed: missing appKey');
    if (!credentials.login?.trim() || !credentials.password?.trim()) {
      throw new Error('Dellin booking failed: missing login/password');
    }
    const base = (process.env.DELLIN_API_BASE ?? 'https://api.dellin.ru').replace(/\/+$/, '');
    const auth = await this.getSessionAuth(base, appKey, credentials.login, credentials.password, requestId, traceId);
    const sessionID = auth.sessionID;

    const fromAddress = (input.draft.originLabel || input.snapshot.originLabel || '').trim();
    const toAddress = (input.draft.destinationLabel || input.snapshot.destinationLabel || '').trim();
    const shipperName = input.snapshot.contacts?.shipper?.name?.trim();
    const shipperPhoneRaw = input.snapshot.contacts?.shipper?.phone?.trim();
    const recipientName = input.snapshot.contacts?.recipient?.name?.trim();
    const recipientPhoneRaw = input.snapshot.contacts?.recipient?.phone?.trim();
    const shipperPhone = normalizeDellinPhone(shipperPhoneRaw);
    const recipientPhone = normalizeDellinPhone(recipientPhoneRaw);
    const requesterUid = await this.resolveRequesterUid(base, appKey, sessionID, auth.requesterUid, requestId);
    if (!isDellinUid(requesterUid)) {
      throw new Error(
        'Dellin booking failed: отсутствует валидный UID контрагента (members.requester.uid). Укажите DELLIN_REQUESTER_UID или проверьте ответ auth/login.',
      );
    }
    const requesterUidSafe = requesterUid as string;
    const missingFields = requiredDellinFieldErrors(input);
    if (missingFields.length > 0) {
      throw new Error(
        `Dellin booking failed: заполните обязательные поля (${missingFields.join(', ')}) в заказе для оценки доставки`,
      );
    }

    const cargo = input.snapshot.cargo;
    const cargoTitle = input.snapshot.itemSummary[0]?.title?.trim() || 'Груз';
    const totalWeight = Math.max(cargo.weightGrams / 1000, 0.01);
    const totalVolume = Math.max(
      ((cargo.lengthMm ?? 100) / 1000) * ((cargo.widthMm ?? 100) / 1000) * ((cargo.heightMm ?? 100) / 1000),
      0.0001,
    );
    const cargoLength = Math.max((cargo.lengthMm ?? 100) / 1000, 0.01);
    const cargoWidth = Math.max((cargo.widthMm ?? 100) / 1000, 0.01);
    const cargoHeight = Math.max((cargo.heightMm ?? 100) / 1000, 0.01);
    const draftOnlyByEnv = process.env.DELLIN_DRAFT_ONLY === 'true';
    const enforceRealBooking = process.env.DELLIN_ENFORCE_REAL_BOOKING === 'true';
    if (draftOnlyByEnv && enforceRealBooking) {
      throw new Error(
        'Dellin booking readiness failed: DELLIN_DRAFT_ONLY=true conflicts with DELLIN_ENFORCE_REAL_BOOKING=true. Disable draft-only mode to place real orders.',
      );
    }

    const deliveryType = input.draft.serviceFlags.includes('EXPRESS') ? 'express' : 'auto';
    const logisticsTimeZone = process.env.TMS_LOGISTICS_TIMEZONE?.trim() || 'Europe/Moscow';
    const preferredProduceDate =
      isValidYmd(input.draft.pickupDate) ? input.draft.pickupDate!.trim() : addDaysYmd(ymdInTimeZone(new Date(), logisticsTimeZone), 1);
    const produceDateAttempts = Array.from({ length: 7 }, (_, idx) => addDaysYmd(preferredProduceDate, idx));
    const produceDateError = (errors: string[]): boolean =>
      errors.some((line) => line.includes('code=180012') || line.includes('delivery.derival.produceDate'));
    const formError = (errors: string[]): boolean =>
      errors.some(
        (line) =>
          line.includes('code=180007') ||
          line.includes('members.sender.counteragent.form') ||
          line.includes('members.receiver.counteragent.form'),
      );
    const counteragentPresenceError = (errors: string[]): boolean =>
      errors.some(
        (line) =>
          line.includes('code=110004') &&
          (line.includes('members.sender.counteragentID') ||
            line.includes('members.sender.counteragent') ||
            line.includes('members.receiver.counteragentID') ||
            line.includes('members.receiver.counteragent')),
      );
    const discoveredForm = await this.resolveCounteragentForm(
      base,
      appKey,
      sessionID,
      requesterUidSafe,
      requestId,
      traceId,
    );
    const discoveredCounteragentId = await this.resolveCounteragentId(
      base,
      appKey,
      sessionID,
      requesterUidSafe,
      requestId,
      traceId,
    );
    const counteragentProfile = await this.resolveCounteragentProfile(
      base,
      appKey,
      sessionID,
      requesterUidSafe,
      requestId,
      traceId,
    );
    const senderCandidates: DellinCounteragentForm[] = [];
    pushUniqueForm(senderCandidates, {
      customForm: dellinCustomForm(
        process.env.DELLIN_SENDER_CUSTOM_FORM_NAME?.trim() ||
          defaultDellinLegalFormName(counteragentProfile?.name ?? shipperName),
        counteragentProfile?.juridical ?? true,
      ),
      ...(counteragentProfile?.inn ? { inn: counteragentProfile.inn } : {}),
    });
    for (const variant of extractDellinFormVariants(discoveredForm)) {
      pushUniqueForm(senderCandidates, variant);
    }
    pushUniqueForm(senderCandidates, null);
    const receiverCandidates: DellinCounteragentForm[] = [];
    pushUniqueForm(receiverCandidates, {
      customForm: dellinCustomForm(
        process.env.DELLIN_RECEIVER_CUSTOM_FORM_NAME?.trim() || 'Физическое лицо',
        false,
      ),
      document: dellinReceiverDocument(),
    });
    pushUniqueForm(receiverCandidates, null);
    const formAttempts: Array<{
      sender: DellinCounteragentForm;
      receiver: DellinCounteragentForm;
      useSenderReceiverCounteragent: boolean;
      useCounteragentIdOnly: boolean;
      label: string;
    }> = [];
    for (const sender of senderCandidates) {
      for (const receiver of receiverCandidates) {
        if (formAttempts.length >= 12) break;
        formAttempts.push({
          sender,
          receiver,
          useSenderReceiverCounteragent: true,
          useCounteragentIdOnly: false,
          label: `sender=${sender == null ? 'null' : typeof sender === 'object' ? 'object' : String(sender)};receiver=${receiver == null ? 'null' : typeof receiver === 'object' ? 'object' : String(receiver)}`,
        });
      }
      if (formAttempts.length >= 12) break;
    }
    formAttempts.push({
      sender: null,
      receiver: null,
      useSenderReceiverCounteragent: false,
      useCounteragentIdOnly: false,
      label: 'no-sender-receiver-counteragent',
    });
    if (discoveredCounteragentId != null) {
      formAttempts.push({
        sender: null,
        receiver: null,
        useSenderReceiverCounteragent: false,
        useCounteragentIdOnly: true,
        label: 'counteragent-id-only',
      });
    }
    const makePayload = (
      draftOnly: boolean,
      produceDate: string,
      senderForm: DellinCounteragentForm,
      receiverForm: DellinCounteragentForm,
      useSenderReceiverCounteragent: boolean,
      useCounteragentIdOnly: boolean,
    ): Record<string, unknown> => ({
      appkey: appKey,
      sessionID,
      inOrder: !draftOnly,
      payment: { type: 'cash', primaryPayer: 'sender' },
      members: {
        requester: { role: 'sender', uid: requesterUid },
        sender: {
          ...(useCounteragentIdOnly && discoveredCounteragentId != null
            ? { counteragentID: discoveredCounteragentId }
            : {}),
          ...(useSenderReceiverCounteragent
            ? {
                counteragent: {
                  uid: requesterUid,
                  ...dellinCounteragentPatch(senderForm),
                  name: shipperName,
                  phone: shipperPhone,
                },
              }
            : {}),
          dataForReceipt: { send: false },
          contactPersons: [{ name: shipperName }],
          phoneNumbers: [{ number: shipperPhone }],
        },
        receiver: {
          ...(useCounteragentIdOnly && discoveredCounteragentId != null
            ? { counteragentID: discoveredCounteragentId }
            : {}),
          ...(useSenderReceiverCounteragent
            ? {
                counteragent: {
                  ...dellinCounteragentPatch(receiverForm),
                  name: recipientName,
                  phone: recipientPhone,
                },
              }
            : {}),
          contactPersons: [{ name: recipientName }],
          phoneNumbers: [{ number: recipientPhone }],
        },
      },
      delivery: {
        deliveryType: { type: deliveryType },
        variant: 'address',
        derival: {
          variant: 'address',
          produceDate,
          time: {
            worktimeStart: isValidHm(input.draft.pickupTimeStart) ? input.draft.pickupTimeStart : '09:00',
            worktimeEnd: isValidHm(input.draft.pickupTimeEnd) ? input.draft.pickupTimeEnd : '18:00',
          },
          address: { search: fromAddress },
        },
        arrival: { variant: 'address', address: { search: toAddress } },
      },
      cargo: {
        quantity: 1,
        freightName: cargoTitle,
        totalWeight,
        totalVolume,
        length: cargoLength,
        width: cargoWidth,
        height: cargoHeight,
      },
    });
    const url = dellinJsonUrl(base, DELLIN_REQUEST_PATH);
    let lastStatus: number | null = null;
    let lastErrors: string[] = [];
    let lastRaw = '';
    for (let idx = 0; idx < produceDateAttempts.length; idx += 1) {
      const produceDate = produceDateAttempts[idx];
      for (let formIdx = 0; formIdx < formAttempts.length; formIdx += 1) {
        const formChoice = formAttempts[formIdx];
        let effectiveDraftOnly = draftOnlyByEnv;
        let payload = makePayload(
          effectiveDraftOnly,
          produceDate,
          formChoice.sender,
          formChoice.receiver,
          formChoice.useSenderReceiverCounteragent,
          formChoice.useCounteragentIdOnly,
        );
        if (this.dellinDebug) {
          this.logger.log(
            `[dellin-booking] payload requestId=${requestId} attempt=${idx + 1} produceDate=${produceDate} form=${formChoice.label} data=${JSON.stringify({
              appkey: appKey ? '***' : null,
              sessionID: sessionID ? '***' : null,
              inOrder: !effectiveDraftOnly,
              delivery: {
                deliveryType: { type: deliveryType },
                variant: 'address',
                derival: {
                  variant: 'address',
                  produceDate,
                  time: { worktimeStart: '09:00', worktimeEnd: '18:00' },
                  search: truncate(fromAddress),
                },
                arrival: { variant: 'address', search: truncate(toAddress) },
              },
              forms: formChoice,
            })}`,
          );
        }
        let { res, data } = await this.postDellinJsonWithRetry(
          url,
          payload,
          traceId ?? requestId,
          requestId,
          `request:create produceDate=${produceDate} form=${formChoice.label} inOrder=${!effectiveDraftOnly}`,
        );
        if (!effectiveDraftOnly && res?.status === 400) {
          if (enforceRealBooking) {
            const strictErrors = parseDellinErrors(data).join('; ');
            throw new Error(
              `Dellin booking readiness failed: inOrder validation rejected by carrier${strictErrors ? `; ${strictErrors}` : ''}. Keep DELLIN_DRAFT_ONLY=false and fix mandatory sender/receiver/members payload fields.`,
            );
          }
          effectiveDraftOnly = true;
          payload = makePayload(
            true,
            produceDate,
            formChoice.sender,
            formChoice.receiver,
            formChoice.useSenderReceiverCounteragent,
            formChoice.useCounteragentIdOnly,
          );
          ({ res, data } = await this.postDellinJsonWithRetry(
            url,
            payload,
            traceId ?? requestId,
            requestId,
            `request:fallback-draft produceDate=${produceDate} form=${formChoice.label}`,
          ));
          this.logger.warn(
            `[dellin-booking] inOrder=true failed with 400, fallback to draft mode; requestId=${requestId}; produceDate=${produceDate}; form=${formChoice.label}`,
          );
        }
        const businessErrors = parseDellinErrors(data);
        const requestUid = firstNonEmptyStringOrNumber(
          data?.requestID,
          data?.requestId,
          asObject(data?.data)?.requestID,
          asObject(data?.data)?.requestId,
        );
        const state = firstNonEmptyString(data?.state, asObject(data?.data)?.state);
        if (res?.ok && requestUid) {
          if (this.dellinDebug) {
            this.logger.log(
              `[dellin-booking] request ok requestId=${requestId} dellinRequestId=${requestUid} state=${state ?? 'n/a'} produceDate=${produceDate} form=${formChoice.label}`,
            );
          }
          return { requestId: requestUid, state, draftOnly: effectiveDraftOnly };
        }

        lastStatus = res?.status ?? null;
        lastErrors = businessErrors;
        lastRaw = JSON.stringify(data ?? {}).slice(0, 400);
        if (this.dellinDebug) {
          this.logger.warn(
            `[dellin-booking] request error requestId=${requestId} produceDate=${produceDate} form=${formChoice.label} status=${res?.status ?? 'n/a'} raw=${JSON.stringify(data ?? {}).slice(0, 1200)}`,
          );
        }
        if ((formError(businessErrors) || counteragentPresenceError(businessErrors)) && formIdx < formAttempts.length - 1) {
          this.logger.warn(
            `[dellin-booking] counteragent profile rejected, retrying with next form profile requestId=${requestId} produceDate=${produceDate} current=${formChoice.label}`,
          );
          continue;
        }
        if (!produceDateError(businessErrors)) {
          const details = businessErrors.join('; ');
          throw new Error(
            `Dellin request failed: HTTP ${res?.status ?? 'n/a'}${details ? `; ${details}` : lastRaw ? `; ${lastRaw}` : ''}`,
          );
        }
      }
      this.logger.warn(
        `[dellin-booking] produceDate unavailable, retrying next day requestId=${requestId} produceDate=${produceDate}`,
      );
    }
    const details = lastErrors.join('; ');
    throw new Error(
      `Dellin request failed: HTTP ${lastStatus ?? 'n/a'}${details ? `; ${details}` : lastRaw ? `; ${lastRaw}` : ''}; triedProduceDates=${produceDateAttempts.join(',')}`,
    );
  }

  private async getSessionAuth(
    base: string,
    appKey: string,
    login: string,
    password: string,
    requestId: string,
    traceId?: string | null,
  ): Promise<DellinAuthSession> {
    const url = dellinJsonUrl(base, DELLIN_AUTH_LOGIN_PATH);
    const maxAttemptsRaw = Number.parseInt(process.env.DELLIN_AUTH_MAX_ATTEMPTS ?? '3', 10);
    const maxAttempts = Number.isFinite(maxAttemptsRaw) ? Math.min(Math.max(maxAttemptsRaw, 1), 6) : 3;
    const baseDelayRaw = Number.parseInt(process.env.DELLIN_AUTH_RETRY_DELAY_MS ?? '1200', 10);
    const baseDelayMs = Number.isFinite(baseDelayRaw) ? Math.min(Math.max(baseDelayRaw, 250), 10_000) : 1200;
    let lastFailure = 'unknown auth failure';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const res = await fetch(url, {
        method: 'POST',
        headers: withRequestIdHeaders(
          { Accept: 'application/json', 'Content-Type': 'application/json' },
          traceId ?? requestId,
        ),
        body: JSON.stringify({ appkey: appKey, login, password }),
        cache: 'no-store',
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
      const details = parseDellinErrors(data).join('; ');
      const sessionID = parseDellinSessionId(data);

      if (res?.ok && sessionID) {
        if (this.dellinDebug) {
          this.logger.log(`[dellin-booking] auth ok requestId=${requestId} attempt=${attempt}/${maxAttempts}`);
        }
        return {
          sessionID,
          requesterUid: parseDellinRequesterUid(data),
        };
      }

      const status = res?.status ?? 0;
      const retryableStatus = !res || status === 429 || status >= 500;
      const retryableDetail = /rate|too many requests|timeout|temporar|unavailable|session/i.test(details);
      const missingSessionWithOk = Boolean(res?.ok && !sessionID);
      const retryable = retryableStatus || retryableDetail || missingSessionWithOk;
      lastFailure = `status=${status || 'n/a'}${details ? `; ${details}` : ''}${missingSessionWithOk ? '; missing sessionID' : ''}`;

      if (attempt < maxAttempts && retryable) {
        const delayMs = baseDelayMs * attempt;
        this.logger.warn(
          `Dellin auth retry ${attempt}/${maxAttempts}: requestId=${requestId}; ${lastFailure}; nextDelayMs=${delayMs}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      this.logger.warn(`Dellin auth failed: requestId=${requestId}; ${lastFailure}`);
      throw new Error(`Dellin auth failed: ${lastFailure}`);
    }

    this.logger.warn(`Dellin auth failed: requestId=${requestId}; ${lastFailure}`);
    throw new Error(`Dellin auth failed: ${lastFailure}`);
  }

  private async postDellinJsonWithRetry(
    url: string,
    body: Record<string, unknown>,
    traceId: string,
    requestId: string,
    op: string,
  ): Promise<DellinJsonResponse> {
    const maxAttemptsRaw = Number.parseInt(process.env.DELLIN_REQUEST_MAX_ATTEMPTS ?? '3', 10);
    const maxAttempts = Number.isFinite(maxAttemptsRaw) ? Math.min(Math.max(maxAttemptsRaw, 1), 6) : 3;
    const baseDelayRaw = Number.parseInt(process.env.DELLIN_REQUEST_RETRY_DELAY_MS ?? '1500', 10);
    const baseDelayMs = Number.isFinite(baseDelayRaw) ? Math.min(Math.max(baseDelayRaw, 250), 10_000) : 1500;
    let last: DellinJsonResponse = { res: null, data: null };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const res = await fetch(url, {
        method: 'POST',
        headers: withRequestIdHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' }, traceId),
        body: JSON.stringify(body),
        cache: 'no-store',
      }).catch(() => null);
      const data = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
      last = { res, data };
      if (res?.ok) return last;

      const status = res?.status ?? 0;
      const details = parseDellinErrors(data).join('; ');
      const retryableStatus = !res || status === 429 || status >= 500;
      const retryableDetail = /rate|too many requests|timeout|temporar|unavailable|overload/i.test(details);
      const retryable = retryableStatus || retryableDetail;
      if (attempt >= maxAttempts || !retryable) return last;

      const delayMs = baseDelayMs * attempt;
      this.logger.warn(
        `[dellin-booking] retry ${attempt}/${maxAttempts} op=${op} requestId=${requestId} status=${status || 'n/a'}${details ? ` details=${details}` : ''} nextDelayMs=${delayMs}`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return last;
  }

  private async resolveRequesterUid(
    base: string,
    appKey: string,
    sessionID: string,
    authRequesterUid: string | null,
    requestId: string,
  ): Promise<string | null> {
    const fromEnv = process.env.DELLIN_REQUESTER_UID?.trim() || '';
    if (isDellinUid(fromEnv)) return fromEnv;
    const fromAuth = (authRequesterUid ?? '').trim();
    const fromCounteragents = await this.fetchCounteragentUid(base, appKey, sessionID, requestId);
    if (isDellinUid(fromCounteragents)) return fromCounteragents;
    if (isDellinUid(fromAuth)) return fromAuth;
    return null;
  }

  private async fetchCounteragentUid(
    base: string,
    appKey: string,
    sessionID: string,
    requestId: string,
  ): Promise<string | null> {
    const paths = [
      '/v2/customers/counteragents',
      '/v1/customers/counteragents',
      '/v2/customers/counterparties',
      '/v1/customers/counterparties',
    ];
    for (const p of paths) {
      const url = dellinJsonUrl(base, p);
      // Try POST first.
      const postRes = await fetch(url, {
        method: 'POST',
        headers: withRequestIdHeaders(
          { Accept: 'application/json', 'Content-Type': 'application/json' },
          requestId,
        ),
        body: JSON.stringify({ appkey: appKey, sessionID }),
        cache: 'no-store',
      }).catch(() => null);
      if (postRes?.ok) {
        const data = await postRes.json().catch(() => null);
        const uid = extractDellinUidDeep(data);
        if (isDellinUid(uid)) return uid;
      }
      // Fallback to GET with query params.
      const q = new URL(url);
      q.searchParams.set('appkey', appKey);
      q.searchParams.set('sessionID', sessionID);
      const getRes = await fetch(q.toString(), {
        method: 'GET',
        headers: withRequestIdHeaders({ Accept: 'application/json' }, requestId),
        cache: 'no-store',
      }).catch(() => null);
      if (getRes?.ok) {
        const data = await getRes.json().catch(() => null);
        const uid = extractDellinUidDeep(data);
        if (isDellinUid(uid)) return uid;
      }
    }
    this.logger.warn(`[dellin-booking] counteragent uid probe failed requestId=${requestId}`);
    return null;
  }

  private async resolveCounteragentForm(
    base: string,
    appKey: string,
    sessionID: string,
    requesterUid: string,
    requestId: string,
    traceId?: string | null,
  ): Promise<DellinCounteragentForm> {
    const cacheKey = `${appKey}:${sessionID}:${requesterUid}`;
    const now = Date.now();
    const cached = this.counteragentFormCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;

    const url = dellinJsonUrl(base, DELLIN_COUNTERAGENTS_PATH);
    const res = await fetch(url, {
      method: 'POST',
      headers: withRequestIdHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' }, traceId ?? requestId),
      body: JSON.stringify({ appkey: appKey, sessionID, fullInfo: true }),
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      this.logger.warn(
        `[dellin-booking] counteragents form lookup failed requestId=${requestId} status=${res?.status ?? 'n/a'}`,
      );
      this.counteragentFormCache.set(cacheKey, { value: null, expiresAt: now + 5 * 60_000 });
      return null;
    }
    const data = (await res.json().catch(() => null)) as unknown;
    const exactForm = findDellinFormByUid(data, requesterUid) as DellinCounteragentForm;
    const resolved: DellinCounteragentForm = exactForm ?? (() => {
      const known: Array<string | number | Record<string, unknown>> = [];
      collectDellinForms(data, known);
      return (known[0] as DellinCounteragentForm) ?? null;
    })();
    this.counteragentFormCache.set(cacheKey, { value: resolved, expiresAt: now + 10 * 60_000 });
    if (this.dellinDebug && resolved != null) {
      const formLog = typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
      this.logger.log(`[dellin-booking] counteragent form resolved requestId=${requestId} form=${formLog}`);
    }
    return resolved;
  }

  private async resolveCounteragentProfile(
    base: string,
    appKey: string,
    sessionID: string,
    requesterUid: string,
    requestId: string,
    traceId?: string | null,
  ): Promise<DellinCounteragentProfile | null> {
    const url = dellinJsonUrl(base, DELLIN_COUNTERAGENTS_PATH);
    const res = await fetch(url, {
      method: 'POST',
      headers: withRequestIdHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' }, traceId ?? requestId),
      body: JSON.stringify({ appkey: appKey, sessionID, fullInfo: true }),
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      this.logger.warn(
        `[dellin-booking] counteragent profile lookup failed requestId=${requestId} status=${res?.status ?? 'n/a'}`,
      );
      return null;
    }

    const data = (await res.json().catch(() => null)) as unknown;
    const profiles = findDellinCounteragentProfiles(data);
    const exact = profiles.find((profile) => profile.uid.trim().toLowerCase() === requesterUid.trim().toLowerCase());
    const resolved = exact ?? profiles.find((profile) => profile.isCurrent) ?? profiles[0] ?? null;
    if (this.dellinDebug && resolved) {
      this.logger.log(
        `[dellin-booking] counteragent profile resolved requestId=${requestId} uid=${resolved.uid} name=${resolved.name ?? 'n/a'} hasInn=${Boolean(resolved.inn)} juridical=${resolved.juridical ?? 'n/a'}`,
      );
    }
    return resolved;
  }

  private async resolveCounteragentId(
    base: string,
    appKey: string,
    sessionID: string,
    requesterUid: string,
    requestId: string,
    traceId?: string | null,
  ): Promise<number | null> {
    const cacheKey = `${appKey}:${sessionID}:${requesterUid}`;
    const now = Date.now();
    const cached = this.counteragentIdCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;

    const paths = [
      DELLIN_COUNTERAGENTS_PATH,
      '/v2/customers/counteragents',
      '/v1/customers/counteragents',
      '/v2/customers/counterparties',
      '/v1/customers/counterparties',
    ];
    for (const path of paths) {
      const url = dellinJsonUrl(base, path);
      const postBodies: Array<Record<string, unknown>> = [
        { appkey: appKey, sessionID, fullInfo: true },
        { appkey: appKey, sessionID, fullInfo: false },
        { appkey: appKey, sessionId: sessionID, fullInfo: true },
        { appkey: appKey, sessionId: sessionID, fullInfo: false },
        { appkey: appKey, sessionID },
        { appkey: appKey, sessionId: sessionID },
      ];
      for (const postBody of postBodies) {
        const postRes = await fetch(url, {
          method: 'POST',
          headers: withRequestIdHeaders(
            { Accept: 'application/json', 'Content-Type': 'application/json' },
            traceId ?? requestId,
          ),
          body: JSON.stringify(postBody),
          cache: 'no-store',
        }).catch(() => null);
        if (!postRes?.ok) continue;
        const data = (await postRes.json().catch(() => null)) as unknown;
        const id = findDellinCounteragentIdByUid(data, requesterUid) ?? findFirstDellinCounteragentId(data);
        if (id != null) {
          this.counteragentIdCache.set(cacheKey, { value: id, expiresAt: now + 10 * 60_000 });
          if (this.dellinDebug) {
            this.logger.log(
              `[dellin-booking] counteragent id resolved requestId=${requestId} id=${id} path=${path} method=POST`,
            );
          }
          return id;
        }
      }

      const getVariants = [
        { sessionKey: 'sessionID', fullInfo: 'true' },
        { sessionKey: 'sessionID', fullInfo: 'false' },
        { sessionKey: 'sessionId', fullInfo: 'true' },
        { sessionKey: 'sessionId', fullInfo: 'false' },
        { sessionKey: 'sessionID', fullInfo: null },
        { sessionKey: 'sessionId', fullInfo: null },
      ] as const;
      for (const variant of getVariants) {
        const q = new URL(url);
        q.searchParams.set('appkey', appKey);
        q.searchParams.set(variant.sessionKey, sessionID);
        if (variant.fullInfo != null) q.searchParams.set('fullInfo', variant.fullInfo);
        const getRes = await fetch(q.toString(), {
          method: 'GET',
          headers: withRequestIdHeaders({ Accept: 'application/json' }, traceId ?? requestId),
          cache: 'no-store',
        }).catch(() => null);
        if (!getRes?.ok) continue;
        const data = (await getRes.json().catch(() => null)) as unknown;
        const id = findDellinCounteragentIdByUid(data, requesterUid) ?? findFirstDellinCounteragentId(data);
        if (id == null) continue;
        this.counteragentIdCache.set(cacheKey, { value: id, expiresAt: now + 10 * 60_000 });
        if (this.dellinDebug) {
          this.logger.log(
            `[dellin-booking] counteragent id resolved requestId=${requestId} id=${id} path=${path} method=GET`,
          );
        }
        return id;
      }
    }

    this.counteragentIdCache.set(cacheKey, { value: null, expiresAt: now + 5 * 60_000 });
    return null;
  }

  private async resolveKladrCode(
    base: string,
    appKey: string,
    variants: string[],
    requestId: string,
  ): Promise<string | null> {
    const url = dellinJsonUrl(base, DELLIN_PUBLIC_KLADR_PATH);
    for (const q of variants) {
      if (!q) continue;
      const res = await fetch(url, {
        method: 'POST',
        headers: withRequestIdHeaders({ Accept: 'application/json', 'Content-Type': 'application/json' }, requestId),
        body: JSON.stringify({ appkey: appKey, q, limit: 8 }),
        cache: 'no-store',
      }).catch(() => null);
      if (!res?.ok) {
        this.logger.warn(`Dellin kladr HTTP failed: status=${res?.status ?? 'n/a'}; q="${q.slice(0, 80)}"`);
        continue;
      }
      const data = await res.json().catch(() => null);
      const code = parseKladrFirstCode(data);
      if (code) {
        return code;
      }
      this.logger.warn(
        `Dellin kladr no code for q="${q.slice(0, 120)}"; requestId=${requestId}; snippet=${JSON.stringify(data).slice(0, 280)}`,
      );
    }
    return null;
  }

  private async loadCredentials(
    context: CarrierQuoteContext,
    requestId: string,
  ): Promise<InternalCarrierCredentials | null> {
    if (!context.authToken) return null;

    const coreBase = (process.env.CORE_API_URL ?? 'http://localhost:4000').replace(/\/api\/?$/, '');
    const internalKey = process.env.TMS_INTERNAL_KEY?.trim();
    if (!internalKey) return null;

    const res = await fetch(`${coreBase}/api/tms/carrier-connections/internal/DELLIN/default?serviceType=EXPRESS`, {
      headers: {
        Authorization: `Bearer ${context.authToken}`,
        'x-tms-internal-key': internalKey,
        ...withRequestIdHeaders({}, context.requestId ?? requestId),
      },
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      this.logger.warn(
        `Dellin credentials fetch failed: status=${res?.status ?? 'n/a'}; coreBase=${coreBase}; requestId=${requestId}`,
      );
      return null;
    }
    return (await res.json()) as InternalCarrierCredentials;
  }

  private createDocumentStubs(
    dellinRequestId: string,
  ): Array<Pick<ShipmentDocumentRecord, 'type' | 'title' | 'content'>> {
    return [
      {
        type: 'WAYBILL',
        title: 'Накладная Деловых Линий (PDF)',
        content: `dellin-doc:waybill:${dellinRequestId}`,
      },
      {
        type: 'LABEL',
        title: 'Ярлык/заявка Деловых Линий (PDF)',
        content: `dellin-doc:request:${dellinRequestId}`,
      },
    ];
  }

  private async fetchPrintableFormPdf(
    base: string,
    appKey: string,
    sessionID: string,
    dellinRequestId: string,
    kind: 'waybill' | 'request',
    traceId?: string | null,
  ): Promise<Buffer> {
    const url = dellinJsonUrl(base, DELLIN_REQUEST_PDF_PATH);
    const docIds = kind === 'waybill' ? ['waybill', 'bill', 'consignmentNote'] : ['request', 'pickupRequest'];
    const payloads: Array<Record<string, unknown>> = [];
    for (const docID of docIds) {
      payloads.push(
        { appkey: appKey, sessionID, requestID: dellinRequestId, docID },
        { appkey: appKey, sessionID, requestId: dellinRequestId, docID },
        { appkey: appKey, sessionID, requestID: dellinRequestId, docType: docID },
      );
    }
    payloads.push(
      { appkey: appKey, sessionID, requestID: dellinRequestId },
      { appkey: appKey, sessionID, requestId: dellinRequestId },
    );
    let lastError = 'unknown';
    for (const body of payloads) {
      const res = await fetch(url, {
        method: 'POST',
        headers: withRequestIdHeaders(
          { Accept: 'application/pdf, application/json', 'Content-Type': 'application/json' },
          traceId ?? dellinRequestId,
        ),
        body: JSON.stringify(body),
        cache: 'no-store',
      }).catch(() => null);
      if (!res?.ok) {
        const data = await res?.json().catch(() => null);
        const details = parseDellinErrors(data).join('; ');
        lastError = `HTTP ${res?.status ?? 'n/a'}${details ? `; ${details}` : ''}`;
        continue;
      }
      const ctype = (res.headers.get('content-type') ?? '').toLowerCase();
      if (ctype.includes('application/pdf')) {
        const pdf = Buffer.from(await res.arrayBuffer());
        if (isLikelyPdf(pdf)) return pdf;
      }
      const payload = await res.json().catch(() => null);
      const hint = findPdfLikeString(payload);
      if (!hint) {
        lastError = `no pdf payload; ${parseDellinErrors(payload).join('; ')}`;
        continue;
      }
      if (/^https?:\/\//i.test(hint)) {
        const fileRes = await fetch(hint, {
          headers: withRequestIdHeaders({ Accept: 'application/pdf' }, traceId ?? dellinRequestId),
          cache: 'no-store',
        }).catch(() => null);
        if (!fileRes?.ok) {
          lastError = `pdf link fetch failed HTTP ${fileRes?.status ?? 'n/a'}`;
          continue;
        }
        const pdf = Buffer.from(await fileRes.arrayBuffer());
        if (isLikelyPdf(pdf)) return pdf;
        lastError = 'linked file is not a valid PDF';
        continue;
      }
      const cleaned = hint.replace(/^data:application\/pdf;base64,/i, '').replace(/\s+/g, '');
      const pdf = Buffer.from(cleaned, 'base64');
      if (isLikelyPdf(pdf)) return pdf;
      lastError = 'base64 payload is not a valid PDF';
    }
    throw new Error(`Dellin document download failed: ${lastError}`);
  }
}
