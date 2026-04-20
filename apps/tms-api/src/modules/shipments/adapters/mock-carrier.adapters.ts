import { computeQuoteScore } from '@handyseller/tms-domain';
import type {
  CarrierDescriptor,
  CarrierQuote,
  CreateShipmentRequestInput,
  ShipmentRecord,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';
import type { CarrierAdapter, CarrierQuoteContext } from './base-carrier.adapter';

function quoteId(requestId: string, carrierId: string) {
  return `${requestId}:${carrierId}`;
}

function buildQuote(
  descriptor: CarrierDescriptor,
  requestId: string,
  input: CreateShipmentRequestInput,
  priceRub: number,
  etaDays: number,
  notes?: string,
): CarrierQuote {
  const serviceFlags = input.draft.serviceFlags.filter((flag) =>
    descriptor.supportedFlags.includes(flag),
  );
  return {
    id: quoteId(requestId, descriptor.id),
    requestId,
    carrierId: descriptor.id,
    carrierName: descriptor.name,
    mode: descriptor.modes[0],
    priceRub,
    etaDays,
    serviceFlags,
    notes,
    priceDetails: {
      source: 'mock',
      totalRub: priceRub,
      currency: 'RUB',
      comment: 'Mock carrier formula',
    },
    score: computeQuoteScore({ priceRub, etaDays, serviceFlags }),
  };
}

function buildBooking(
  quote: CarrierQuote,
  status: ShipmentRecord['status'] = 'CONFIRMED',
): {
  shipment: Omit<ShipmentRecord, 'id' | 'userId' | 'createdAt'>;
  tracking: Array<Omit<TrackingEventRecord, 'id'>>;
} {
  return {
    shipment: {
      requestId: quote.requestId,
      carrierId: quote.carrierId,
      carrierName: quote.carrierName,
      trackingNumber: `${quote.carrierId.toUpperCase()}-${Date.now().toString().slice(-8)}`,
      status,
      priceRub: quote.priceRub,
      etaDays: quote.etaDays,
    },
    tracking: [
      {
        shipmentId: '',
        status: 'CREATED',
        description: 'Заявка зарегистрирована в TMS',
        occurredAt: new Date().toISOString(),
      },
      {
        shipmentId: '',
        status,
        description: 'Перевозчик подтвердил бронирование',
        occurredAt: new Date().toISOString(),
      },
    ],
  };
}

abstract class BaseMockCarrierAdapter implements CarrierAdapter {
  abstract readonly descriptor: CarrierDescriptor;
  abstract quote(
    input: CreateShipmentRequestInput,
    requestId: string,
    context: CarrierQuoteContext,
  ): Promise<CarrierQuote[]>;

  async book(quote: CarrierQuote) {
    return buildBooking(quote);
  }
}

export class CdekMockCarrierAdapter extends BaseMockCarrierAdapter {
  readonly descriptor: CarrierDescriptor = {
    id: 'cdek-mock',
    name: 'CDEK Mock',
    modes: ['ROAD', 'COURIER', 'PICKUP'],
    supportedFlags: ['EXPRESS', 'CONSOLIDATED'],
    supportsTracking: true,
    supportsBooking: true,
  };

  async quote(input: CreateShipmentRequestInput, requestId: string, _context: CarrierQuoteContext) {
    const weightFactor = Math.max(input.snapshot.cargo.weightGrams / 1000, 1);
    const priceRub = Math.round(280 + weightFactor * 55 + input.draft.serviceFlags.length * 35);
    const etaDays = input.draft.serviceFlags.includes('EXPRESS') ? 1 : 3;
    return [buildQuote(this.descriptor, requestId, input, priceRub, etaDays, 'Сильный региональный охват')];
  }
}

export class BoxberryMockCarrierAdapter extends BaseMockCarrierAdapter {
  readonly descriptor: CarrierDescriptor = {
    id: 'boxberry',
    name: 'Boxberry Mock',
    modes: ['ROAD', 'PICKUP'],
    supportedFlags: ['CONSOLIDATED'],
    supportsTracking: true,
    supportsBooking: true,
  };

  async quote(input: CreateShipmentRequestInput, requestId: string, _context: CarrierQuoteContext) {
    if (input.draft.serviceFlags.includes('HAZMAT') || input.draft.serviceFlags.includes('AIR')) {
      return [];
    }
    const weightFactor = Math.max(input.snapshot.cargo.weightGrams / 1000, 1);
    const priceRub = Math.round(220 + weightFactor * 48);
    return [buildQuote(this.descriptor, requestId, input, priceRub, 4, 'Экономичный ПВЗ-сценарий')];
  }
}

export class FleetMockCarrierAdapter extends BaseMockCarrierAdapter {
  readonly descriptor: CarrierDescriptor = {
    id: 'fleet',
    name: 'Свой автопарк',
    modes: ['FLEET', 'COURIER'],
    supportedFlags: ['EXPRESS', 'HAZMAT', 'CONSOLIDATED', 'OVERSIZED'],
    supportsTracking: true,
    supportsBooking: true,
  };

  async quote(input: CreateShipmentRequestInput, requestId: string, _context: CarrierQuoteContext) {
    const weightFactor = Math.max(input.snapshot.cargo.weightGrams / 1000, 1);
    const oversizeFactor = input.draft.serviceFlags.includes('OVERSIZED') ? 220 : 0;
    const priceRub = Math.round(360 + weightFactor * 42 + oversizeFactor);
    const etaDays = input.draft.serviceFlags.includes('EXPRESS') ? 1 : 2;
    return [buildQuote(this.descriptor, requestId, input, priceRub, etaDays, 'Контролируемое SLA своими силами')];
  }
}

export function buildMockCarrierAdapters(): CarrierAdapter[] {
  return [
    new CdekMockCarrierAdapter(),
    new BoxberryMockCarrierAdapter(),
    new FleetMockCarrierAdapter(),
  ];
}
