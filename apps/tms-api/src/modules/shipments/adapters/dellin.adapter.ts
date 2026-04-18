import type {
  CarrierDescriptor,
  CarrierQuote,
  CreateShipmentRequestInput,
  InternalCarrierCredentials,
  ShipmentRecord,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';
import type { CarrierAdapter, CarrierQuoteContext } from './base-carrier.adapter';

type DellinCalcResponse = {
  price?: number | string;
  term?: number | string;
  data?: {
    price?: number | string;
    term?: number | string;
  };
};

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export class DellinAdapter implements CarrierAdapter {
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
  ): Promise<CarrierQuote | null> {
    const credentials = await this.loadCredentials(context);
    if (!credentials) return null;

    const appKey = process.env.DELLIN_APP_KEY?.trim();
    if (!appKey) return null;

    const base = (process.env.DELLIN_API_BASE ?? 'https://api.dellin.ru').replace(/\/+$/, '');
    const endpoint = process.env.DELLIN_CALC_PATH?.trim() || '/v2/calculator.json';

    // Минимальный payload калькулятора. Структура поддерживается через env endpoint/path.
    const body = {
      appkey: appKey,
      delivery: {
        derival: { address: { search: input.draft.originLabel || input.snapshot.originLabel || 'Москва' } },
        arrival: {
          address: { search: input.draft.destinationLabel || input.snapshot.destinationLabel || 'Санкт-Петербург' },
        },
      },
      cargo: {
        quantity: Math.max(input.snapshot.cargo.places, 1),
        totalWeight: Math.max(input.snapshot.cargo.weightGrams / 1000, 0.1),
        totalVolume:
          Math.max(
            (input.snapshot.cargo.lengthMm ?? 100) *
              (input.snapshot.cargo.widthMm ?? 100) *
              (input.snapshot.cargo.heightMm ?? 100),
            1,
          ) / 1_000_000_000,
      },
      auth: {
        login: credentials.login,
        password: credentials.password,
      },
    };

    const res = await fetch(`${base}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AppKey': appKey },
      body: JSON.stringify(body),
      cache: 'no-store',
    }).catch(() => null);

    if (!res?.ok) return null;
    const data = (await res.json().catch(() => null)) as DellinCalcResponse | null;
    if (!data) return null;

    const priceRub = asNumber(data.data?.price ?? data.price);
    const etaDays = asNumber(data.data?.term ?? data.term);
    if (!priceRub || priceRub <= 0) return null;

    return {
      id: `${requestId}:${this.descriptor.id}`,
      requestId,
      carrierId: this.descriptor.id,
      carrierName: this.descriptor.name,
      mode: this.descriptor.modes[0],
      priceRub,
      etaDays: Math.max(Math.round(etaDays ?? 2), 1),
      serviceFlags: input.draft.serviceFlags.filter((flag) =>
        this.descriptor.supportedFlags.includes(flag),
      ),
      notes: `${credentials.accountLabel ?? 'Договор клиента'} · тариф по API Деловых Линий`,
      score: Math.round((100000 / Math.max(priceRub, 1)) * 100) / 100,
    };
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

  private async loadCredentials(
    context: CarrierQuoteContext,
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
    });
    if (!res.ok) return null;
    return (await res.json()) as InternalCarrierCredentials;
  }
}
