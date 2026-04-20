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

export class DellinAdapter implements CarrierAdapter {
  private readonly logger = new Logger(DellinAdapter.name);
  readonly descriptor: CarrierDescriptor = {
    id: 'dellin',
    code: 'DELLIN',
    name: 'Деловые Линии',
    modes: ['ROAD'],
    supportedFlags: ['EXPRESS', 'CONSOLIDATED'],
    supportsTracking: false,
    supportsBooking: false,
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

  async book({ quote }: CarrierBookInput): Promise<{
    shipment: Omit<ShipmentRecord, 'id' | 'userId' | 'createdAt'>;
    tracking: Array<Omit<TrackingEventRecord, 'id'>>;
  }> {
    return {
      shipment: {
        requestId: quote.requestId,
        carrierId: quote.carrierId,
        carrierName: quote.carrierName,
        trackingNumber: `DELLIN-PENDING-${Date.now().toString().slice(-6)}`,
        status: 'CREATED',
        priceRub: quote.priceRub,
        etaDays: quote.etaDays,
      },
      tracking: [
        {
          shipmentId: '',
          status: 'CREATED',
          description: 'Тариф Деловых Линий выбран. Бронирование выполняется следующим шагом.',
          occurredAt: new Date().toISOString(),
        },
      ],
    };
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
