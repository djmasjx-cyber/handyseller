import { Logger } from '@nestjs/common';
import type {
  CarrierDescriptor,
  CarrierQuote,
  CreateShipmentRequestInput,
  InternalCarrierCredentials,
  ShipmentRecord,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';
import type { CarrierAdapter, CarrierQuoteContext } from './base-carrier.adapter';

type CdekTariff = {
  tariff_code?: number;
  tariff_name?: string;
  delivery_sum?: number;
  period_min?: number;
  period_max?: number;
  calendar_min?: number;
  calendar_max?: number;
};

type CdekCity = { code?: number; city?: string };

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cdekCityCandidates(label: string | null | undefined): string[] {
  if (!label) return [];
  const out: string[] = [];
  const push = (v: string) => {
    const t = v.replace(/^\s*\d{6}\s*,?\s*/u, '').replace(/\s+/g, ' ').trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };
  push(label);
  for (const part of label.split(',').map((x) => x.trim())) if (part) push(part);
  const m = label.match(/(?:г\.?|город)\s*([А-Яа-яЁёA-Za-z\- ]{2,80})/u);
  if (m?.[1]) push(m[1]);
  return out;
}

export class CdekAdapter implements CarrierAdapter {
  private readonly logger = new Logger(CdekAdapter.name);
  readonly descriptor: CarrierDescriptor = {
    id: 'cdek',
    code: 'CDEK',
    name: 'CDEK',
    modes: ['ROAD', 'COURIER', 'PICKUP'],
    supportedFlags: ['EXPRESS', 'CONSOLIDATED'],
    supportsTracking: true,
    supportsBooking: false,
    requiresCredentials: true,
  };

  async quote(
    input: CreateShipmentRequestInput,
    requestId: string,
    context: CarrierQuoteContext,
  ): Promise<CarrierQuote[]> {
    const credentials = await this.loadCredentials(context, requestId);
    if (!credentials) return [];
    const token = await this.getAccessToken(credentials, requestId);
    if (!token) return [];

    const base = (process.env.CDEK_API_BASE ?? 'https://api.cdek.ru').replace(/\/+$/, '');
    const fromCode = await this.resolveCityCode(base, token, input.draft.originLabel || input.snapshot.originLabel);
    const toCode = await this.resolveCityCode(
      base,
      token,
      input.draft.destinationLabel || input.snapshot.destinationLabel,
    );
    if (!fromCode || !toCode) {
      this.logger.warn(
        `CDEK city resolve failed; requestId=${requestId}; fromResolved=${Boolean(fromCode)}; toResolved=${Boolean(toCode)}`,
      );
      return [];
    }
    const payload = {
      type: 2,
      currency: 1,
      from_location: { code: fromCode },
      to_location: { code: toCode },
      packages: [
        {
          weight: Math.max(Math.round(input.snapshot.cargo.weightGrams || 100), 100),
          length: Math.max(Math.round((input.snapshot.cargo.lengthMm ?? 100) / 10), 1),
          width: Math.max(Math.round((input.snapshot.cargo.widthMm ?? 100) / 10), 1),
          height: Math.max(Math.round((input.snapshot.cargo.heightMm ?? 100) / 10), 1),
        },
      ],
    };

    const res = await fetch(`${base}/v2/calculator/tarifflist`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      this.logger.warn(`CDEK calculator HTTP failed: status=${res?.status ?? 'n/a'}; requestId=${requestId}`);
      return [];
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const tariffsRaw = Array.isArray(data.tariff_codes)
      ? data.tariff_codes
      : Array.isArray(data.tariffs)
        ? data.tariffs
        : [];
    const tariffs = tariffsRaw as CdekTariff[];
    if (!tariffs.length) return [];

    const serviceFlags = input.draft.serviceFlags.filter((f) => this.descriptor.supportedFlags.includes(f));
    const quotes: CarrierQuote[] = [];
    for (const t of tariffs) {
      const priceRub = asNum(t.delivery_sum);
      if (!priceRub || priceRub <= 0) continue;
      const etaMin = asNum(t.calendar_min) ?? asNum(t.period_min) ?? 1;
      const etaMax = asNum(t.calendar_max) ?? asNum(t.period_max) ?? etaMin;
      const etaDays = Math.max(1, Math.round((etaMin + etaMax) / 2));
      const code = t.tariff_code ?? Math.round(priceRub);
      const name = t.tariff_name ?? `Тариф ${code}`;
      quotes.push({
        id: `${requestId}:${this.descriptor.id}:${code}`,
        requestId,
        carrierId: this.descriptor.id,
        carrierName: this.descriptor.name,
        mode: this.descriptor.modes[0],
        priceRub,
        etaDays,
        serviceFlags,
        notes: `${name} · CDEK API`,
        priceDetails: {
          source: 'carrier_total',
          totalRub: priceRub,
          currency: 'RUB',
          comment: `CDEK tariff ${code}`,
        },
        score: Math.round((100000 / Math.max(priceRub, 1)) * 100) / 100,
      });
    }
    return quotes.sort((a, b) => a.priceRub - b.priceRub);
  }

  private async resolveCityCode(base: string, token: string, label: string | null | undefined): Promise<number | null> {
    const candidates = cdekCityCandidates(label);
    for (const city of candidates) {
      const url = new URL('/v2/location/cities', base);
      url.searchParams.set('country_codes', 'RU');
      url.searchParams.set('city', city);
      url.searchParams.set('size', '1');
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
      }).catch(() => null);
      if (!res?.ok) continue;
      const data = (await res.json().catch(() => [])) as unknown;
      const row = Array.isArray(data) && data.length ? (data[0] as CdekCity) : null;
      if (row && typeof row.code === 'number' && Number.isFinite(row.code)) return row.code;
    }
    return null;
  }

  async book(quote: CarrierQuote): Promise<{
    shipment: Omit<ShipmentRecord, 'id' | 'userId' | 'createdAt'>;
    tracking: Array<Omit<TrackingEventRecord, 'id'>>;
  }> {
    return {
      shipment: {
        requestId: quote.requestId,
        carrierId: quote.carrierId,
        carrierName: quote.carrierName,
        trackingNumber: `CDEK-PENDING-${Date.now().toString().slice(-6)}`,
        status: 'CREATED',
        priceRub: quote.priceRub,
        etaDays: quote.etaDays,
      },
      tracking: [
        {
          shipmentId: '',
          status: 'CREATED',
          description: 'Тариф CDEK выбран. Подтверждение отгрузки следующим шагом.',
          occurredAt: new Date().toISOString(),
        },
      ],
    };
  }

  private async loadCredentials(
    context: CarrierQuoteContext,
    requestId: string,
  ): Promise<InternalCarrierCredentials | null> {
    if (!context.authToken) return null;
    const coreBase = (process.env.CORE_API_URL ?? 'http://localhost:4000').replace(/\/api\/?$/, '');
    const internalKey = process.env.TMS_INTERNAL_KEY?.trim();
    if (!internalKey) return null;
    const res = await fetch(`${coreBase}/api/tms/carrier-connections/internal/CDEK/default?serviceType=EXPRESS`, {
      headers: {
        Authorization: `Bearer ${context.authToken}`,
        'x-tms-internal-key': internalKey,
      },
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      this.logger.warn(
        `CDEK credentials fetch failed: status=${res?.status ?? 'n/a'}; coreBase=${coreBase}; requestId=${requestId}`,
      );
      return null;
    }
    return (await res.json()) as InternalCarrierCredentials;
  }

  private async getAccessToken(
    credentials: InternalCarrierCredentials,
    requestId: string,
  ): Promise<string | null> {
    const base = (process.env.CDEK_API_BASE ?? 'https://api.cdek.ru').replace(/\/+$/, '');
    const url = new URL('/v2/oauth/token', base);
    url.searchParams.set('grant_type', 'client_credentials');
    url.searchParams.set('client_id', credentials.login);
    url.searchParams.set('client_secret', credentials.password);
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      this.logger.warn(`CDEK auth failed: status=${res?.status ?? 'n/a'}; requestId=${requestId}`);
      return null;
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return typeof data.access_token === 'string' ? data.access_token : null;
  }
}
