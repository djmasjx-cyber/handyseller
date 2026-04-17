import { Injectable, NotFoundException } from '@nestjs/common';
import { rankQuotes } from '@handyseller/tms-domain';
import type {
  CarrierDescriptor,
  CarrierQuote,
  CreateShipmentRequestInput,
  CreateShipmentRequestResult,
  RoutingPolicyRecord,
  ShipmentDocumentRecord,
  ShipmentRecord,
  ShipmentRequestRecord,
  TmsOverview,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';
import { buildMockCarrierAdapters } from './adapters/mock-carrier.adapters';
import type { CarrierAdapter } from './adapters/base-carrier.adapter';

@Injectable()
export class ShipmentsService {
  private readonly adapters: CarrierAdapter[] = buildMockCarrierAdapters();
  private readonly requests = new Map<string, ShipmentRequestRecord>();
  private readonly quotes = new Map<string, CarrierQuote[]>();
  private readonly shipments = new Map<string, ShipmentRecord>();
  private readonly tracking = new Map<string, TrackingEventRecord[]>();
  private readonly documents = new Map<string, ShipmentDocumentRecord[]>();
  private readonly routingPolicies: RoutingPolicyRecord[] = [
    {
      id: 'manual-assist',
      name: 'Manual assist',
      mode: 'MANUAL_ASSIST',
      active: true,
      description: 'Собирает тарифы, ранжирует предложения и оставляет финальный выбор менеджеру.',
    },
    {
      id: 'cheap-then-fast',
      name: 'Rule-based cheapest SLA',
      mode: 'RULE_BASED',
      active: false,
      description: 'Черновик для будущей автоматизации: минимум цена при соблюдении SLA и сервисных ограничений.',
    },
  ];

  listCarriers(): CarrierDescriptor[] {
    return this.adapters.map((adapter) => adapter.descriptor);
  }

  listRequests(userId: string): ShipmentRequestRecord[] {
    return [...this.requests.values()]
      .filter((request) => request.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listShipments(userId: string): ShipmentRecord[] {
    return [...this.shipments.values()]
      .filter((shipment) => shipment.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  listRoutingPolicies(): RoutingPolicyRecord[] {
    return this.routingPolicies;
  }

  getOverview(userId: string): TmsOverview {
    const requests = this.listRequests(userId);
    const shipments = this.listShipments(userId);
    return {
      carriersCount: this.adapters.length,
      requestsCount: requests.length,
      quotedCount: requests.filter((item) => item.status === 'QUOTED').length,
      bookedCount: requests.filter((item) => item.status === 'BOOKED').length,
      activeShipmentsCount: shipments.filter((item) => item.status !== 'DELIVERED').length,
    };
  }

  async createFromCoreOrder(
    userId: string,
    input: CreateShipmentRequestInput,
  ): Promise<CreateShipmentRequestResult> {
    const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const request: ShipmentRequestRecord = {
      id,
      userId,
      source: 'CORE_ORDER',
      status: 'DRAFT',
      snapshot: input.snapshot,
      draft: input.draft,
      createdAt: now,
      updatedAt: now,
    };
    this.requests.set(id, request);
    const quotes = await this.refreshQuotes(userId, id);
    return {
      request: this.requests.get(id)!,
      quotes,
    };
  }

  async refreshQuotes(userId: string, requestId: string): Promise<CarrierQuote[]> {
    const request = this.getRequestOrThrow(userId, requestId);
    const quotes = rankQuotes(
      (
        await Promise.all(
          this.adapters.map((adapter) =>
            adapter.quote(
              {
                snapshot: request.snapshot,
                draft: request.draft,
              },
              requestId,
            ),
          ),
        )
      ).filter((item): item is CarrierQuote => Boolean(item)),
    );

    request.status = 'QUOTED';
    request.updatedAt = new Date().toISOString();
    this.requests.set(requestId, request);
    this.quotes.set(requestId, quotes);
    return quotes;
  }

  getQuotes(userId: string, requestId: string): CarrierQuote[] {
    this.getRequestOrThrow(userId, requestId);
    return this.quotes.get(requestId) ?? [];
  }

  async selectQuote(userId: string, requestId: string, quoteId: string): Promise<ShipmentRecord> {
    const request = this.getRequestOrThrow(userId, requestId);
    const quote = (this.quotes.get(requestId) ?? []).find((item) => item.id === quoteId);
    if (!quote) {
      throw new NotFoundException('Тариф не найден');
    }
    const adapter = this.adapters.find((item) => item.descriptor.id === quote.carrierId);
    if (!adapter) {
      throw new NotFoundException('Перевозчик не найден');
    }

    const booking = await adapter.book(quote);
    const shipmentId = `shp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const shipment: ShipmentRecord = {
      id: shipmentId,
      userId,
      createdAt: new Date().toISOString(),
      ...booking.shipment,
    };
    this.shipments.set(shipmentId, shipment);
    this.tracking.set(
      shipmentId,
      booking.tracking.map((item, index) => ({
        ...item,
        id: `${shipmentId}_${index + 1}`,
        shipmentId,
      })),
    );
    this.documents.set(shipmentId, [
      {
        id: `${shipmentId}_waybill`,
        shipmentId,
        type: 'WAYBILL',
        title: 'Транспортная накладная',
        content: `ТН ${shipment.trackingNumber} / ${shipment.carrierName}`,
        createdAt: shipment.createdAt,
      },
      {
        id: `${shipmentId}_label`,
        shipmentId,
        type: 'LABEL',
        title: 'Отгрузочный ярлык',
        content: `LABEL ${shipment.trackingNumber}`,
        createdAt: shipment.createdAt,
      },
    ]);

    request.status = 'BOOKED';
    request.selectedQuoteId = quoteId;
    request.updatedAt = new Date().toISOString();
    this.requests.set(requestId, request);

    return shipment;
  }

  getTracking(userId: string, shipmentId: string): TrackingEventRecord[] {
    const shipment = this.shipments.get(shipmentId);
    if (!shipment || shipment.userId !== userId) {
      throw new NotFoundException('Отгрузка не найдена');
    }
    return this.tracking.get(shipmentId) ?? [];
  }

  getDocuments(userId: string, shipmentId: string): ShipmentDocumentRecord[] {
    const shipment = this.shipments.get(shipmentId);
    if (!shipment || shipment.userId !== userId) {
      throw new NotFoundException('Отгрузка не найдена');
    }
    return this.documents.get(shipmentId) ?? [];
  }

  private getRequestOrThrow(userId: string, requestId: string): ShipmentRequestRecord {
    const request = this.requests.get(requestId);
    if (!request || request.userId !== userId) {
      throw new NotFoundException('Заявка на перевозку не найдена');
    }
    return request;
  }
}
