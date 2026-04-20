import { Logger } from '@nestjs/common';
import type {
  CarrierDescriptor,
  CarrierQuote,
  CreateShipmentRequestInput,
  InternalCarrierCredentials,
  ShipmentRecord,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';
import type { CarrierAdapter, CarrierBookInput, CarrierQuoteContext } from './base-carrier.adapter';

/** Публичный калькулятор ДЛ: https://api.dellin.ru/v1/public/calculator.json (см. dev.dellin.ru, примеры интеграций). */
const DELLIN_PUBLIC_CALCULATOR_PATH = '/v1/public/calculator';
/** Поиск КЛАДР для сопоставления строки адреса с кодом населённого пункта. */
const DELLIN_PUBLIC_KLADR_PATH = '/v2/public/kladr';
/** Логин в личный кабинет ДЛ для получения sessionID. */
const DELLIN_AUTH_LOGIN_PATH = '/v3/auth/login';
/** Создание/черновик заявки на перевозку. */
const DELLIN_REQUEST_PATH = '/v2/request';

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
};

function maskPhone(value: string): string {
  const digits = value.replace(/\D+/g, '');
  if (digits.length < 6) return '***';
  return `${digits.slice(0, 2)}***${digits.slice(-2)}`;
}

function truncate(value: string, max = 180): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export class DellinAdapter implements CarrierAdapter {
  private readonly logger = new Logger(DellinAdapter.name);
  private readonly dellinDebug =
    process.env.TMS_DELLIN_DEBUG === '1' || process.env.TMS_DELLIN_DEBUG === 'true';
  readonly descriptor: CarrierDescriptor = {
    id: 'dellin',
    code: 'DELLIN',
    name: 'Деловые Линии',
    modes: ['ROAD'],
    supportedFlags: ['EXPRESS', 'CONSOLIDATED'],
    supportsTracking: false,
    supportsBooking: process.env.DELLIN_ENABLE_BOOKING === 'true',
    requiresCredentials: true,
  };

  async quote(
    input: CreateShipmentRequestInput,
    requestId: string,
    context: CarrierQuoteContext,
  ): Promise<CarrierQuote[]> {
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
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
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
  }> {
    const draftOnly = process.env.DELLIN_DRAFT_ONLY !== 'false';
    const credentials = await this.loadCredentials(context, quote.requestId);
    if (!credentials) {
      throw new Error('Dellin booking failed: missing credentials');
    }
    const draft = await this.validateDraftRequest(input, credentials, quote.requestId);
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
        status: draftOnly ? 'CREATED' : 'CONFIRMED',
        priceRub: quote.priceRub,
        etaDays: quote.etaDays,
      },
      tracking: [
        {
          shipmentId: '',
          status: draftOnly ? 'CREATED' : 'CONFIRMED',
          description: draftOnly
            ? `Черновик заявки в ДЛ проверен (inOrder=false). requestId=${draft.requestId ?? 'n/a'}`
            : `Заявка в ДЛ отправлена. requestId=${draft.requestId ?? 'n/a'}`,
          occurredAt: new Date().toISOString(),
        },
      ],
    };
  }

  private async validateDraftRequest(
    input: CreateShipmentRequestInput,
    credentials: InternalCarrierCredentials,
    requestId: string,
  ): Promise<DellinDraftValidation> {
    const appKey = (credentials.appKey ?? '').trim() || process.env.DELLIN_APP_KEY?.trim();
    if (!appKey) throw new Error('Dellin booking failed: missing appKey');
    if (!credentials.login?.trim() || !credentials.password?.trim()) {
      throw new Error('Dellin booking failed: missing login/password');
    }
    const base = (process.env.DELLIN_API_BASE ?? 'https://api.dellin.ru').replace(/\/+$/, '');
    const sessionID = await this.getSessionId(base, appKey, credentials.login, credentials.password, requestId);
    if (!sessionID) throw new Error('Dellin booking failed: cannot obtain sessionID');

    const fromAddress = (input.draft.originLabel || input.snapshot.originLabel || '').trim();
    const toAddress = (input.draft.destinationLabel || input.snapshot.destinationLabel || '').trim();
    const shipperName = input.snapshot.contacts?.shipper?.name?.trim();
    const shipperPhone = input.snapshot.contacts?.shipper?.phone?.trim();
    const recipientName = input.snapshot.contacts?.recipient?.name?.trim();
    const recipientPhone = input.snapshot.contacts?.recipient?.phone?.trim();
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
    const draftOnly = process.env.DELLIN_DRAFT_ONLY !== 'false';

    const payload: Record<string, unknown> = {
      appkey: appKey,
      sessionID,
      inOrder: !draftOnly,
      delivery: {
        variant: 'address',
        derival: { variant: 'address', address: { search: fromAddress } },
        arrival: { variant: 'address', address: { search: toAddress } },
      },
      members: {
        sender: {
          counteragent: {
            isAnonym: true,
            name: shipperName,
            phone: shipperPhone,
          },
        },
        receiver: {
          counteragent: {
            isAnonym: true,
            name: recipientName,
            phone: recipientPhone,
          },
        },
      },
      cargo: {
        quantity: 1,
        freightName: cargoTitle,
        totalWeight,
        totalVolume,
      },
    };
    if (this.dellinDebug) {
      this.logger.log(
        `[dellin-booking] payload requestId=${requestId} data=${JSON.stringify({
          appkey: appKey ? '***' : null,
          sessionID: sessionID ? '***' : null,
          inOrder: !draftOnly,
          delivery: {
            variant: 'address',
            derival: { variant: 'address', search: truncate(fromAddress) },
            arrival: { variant: 'address', search: truncate(toAddress) },
          },
          members: {
            sender: {
              isAnonym: true,
              name: truncate(shipperName ?? ''),
              phone: maskPhone(shipperPhone ?? ''),
            },
            receiver: {
              isAnonym: true,
              name: truncate(recipientName ?? ''),
              phone: maskPhone(recipientPhone ?? ''),
            },
          },
          cargo: {
            quantity: 1,
            freightName: truncate(cargoTitle),
            totalWeight,
            totalVolume,
          },
        })}`,
      );
    }
    const url = dellinJsonUrl(base, DELLIN_REQUEST_PATH);
    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res?.ok) {
      const details = parseDellinErrors(data).join('; ');
      if (this.dellinDebug) {
        this.logger.warn(
          `[dellin-booking] request error requestId=${requestId} status=${res?.status ?? 'n/a'} raw=${JSON.stringify(data ?? {}).slice(0, 1200)}`,
        );
      }
      throw new Error(`Dellin request failed: HTTP ${res?.status ?? 'n/a'}${details ? `; ${details}` : ''}`);
    }
    const businessErrors = parseDellinErrors(data);
    const requestUid = firstNonEmptyString(
      data?.requestID,
      data?.requestId,
      asObject(data?.data)?.requestID,
      asObject(data?.data)?.requestId,
    );
    const state = firstNonEmptyString(data?.state, asObject(data?.data)?.state);
    if (!requestUid && businessErrors.length > 0) {
      throw new Error(`Dellin request failed: ${businessErrors.join('; ')}`);
    }
    if (!requestUid) {
      throw new Error('Dellin request failed: API response does not contain requestId');
    }
    if (this.dellinDebug) {
      this.logger.log(
        `[dellin-booking] request ok requestId=${requestId} dellinRequestId=${requestUid ?? 'n/a'} state=${state ?? 'n/a'}`,
      );
    }
    return { requestId: requestUid, state };
  }

  private async getSessionId(
    base: string,
    appKey: string,
    login: string,
    password: string,
    requestId: string,
  ): Promise<string | null> {
    const url = dellinJsonUrl(base, DELLIN_AUTH_LOGIN_PATH);
    const res = await fetch(url, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ appkey: appKey, login, password }),
      cache: 'no-store',
    }).catch(() => null);
    const data = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res?.ok) {
      const details = parseDellinErrors(data).join('; ');
      this.logger.warn(
        `Dellin auth failed: status=${res?.status ?? 'n/a'}; requestId=${requestId}${details ? `; ${details}` : ''}`,
      );
      return null;
    }
    if (this.dellinDebug) {
      this.logger.log(`[dellin-booking] auth ok requestId=${requestId}`);
    }
    return parseDellinSessionId(data);
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
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
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
}
