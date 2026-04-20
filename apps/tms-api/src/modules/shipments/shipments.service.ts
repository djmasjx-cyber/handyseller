import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { rankQuotes } from '@handyseller/tms-domain';
import type {
  CarrierDescriptor,
  CarrierQuote,
  ClientOrderRecord,
  ClientOrderWithTmsStatusRecord,
  CreateShipmentRequestInput,
  CreateShipmentRequestResult,
  RoutingPolicyRecord,
  ShipmentDocumentRecord,
  ShipmentRecord,
  ShipmentRequestRecord,
  TmsOrderStatus,
  TmsOverview,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';
import { buildMockCarrierAdapters } from './adapters/mock-carrier.adapters';
import { MajorExpressAdapter } from './adapters/major-express.adapter';
import { DellinAdapter } from './adapters/dellin.adapter';
import { CdekAdapter } from './adapters/cdek.adapter';
import type { CarrierAdapter } from './adapters/base-carrier.adapter';

@Injectable()
export class ShipmentsService {
  private readonly logger = new Logger(ShipmentsService.name);
  private readonly quoteDebugEnabled =
    process.env.TMS_QUOTE_DEBUG === '1' || process.env.TMS_QUOTE_DEBUG === 'true';
  private readonly adapters: CarrierAdapter[] = ShipmentsService.buildCarrierAdapters();
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

  private static buildCarrierAdapters(): CarrierAdapter[] {
    const real: CarrierAdapter[] = [new MajorExpressAdapter(), new DellinAdapter(), new CdekAdapter()];
    const includeMocks =
      process.env.TMS_INCLUDE_MOCK_CARRIERS === '1' ||
      process.env.TMS_INCLUDE_MOCK_CARRIERS === 'true' ||
      (process.env.NODE_ENV !== 'production' && process.env.TMS_INCLUDE_MOCK_CARRIERS !== '0');

    return includeMocks ? [...real, ...buildMockCarrierAdapters()] : real;
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

  async listClientOrders(
    userId: string,
    authToken?: string | null,
  ): Promise<ClientOrderWithTmsStatusRecord[]> {
    const coreOrders = await this.fetchCoreOrders(userId, authToken);
    return coreOrders.map((order) => {
      const request = this.listRequests(userId).find((item) => item.snapshot.coreOrderId === order.id);
      const shipment = request
        ? this.listShipments(userId).find((item) => item.requestId === request.id)
        : undefined;
      return {
        ...order,
        tmsStatus: this.resolveTmsOrderStatus(request?.status, shipment?.status),
        requestId: request?.id,
        shipmentId: shipment?.id,
      };
    });
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
    authToken?: string | null,
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
    const quotes = await this.refreshQuotes(userId, id, authToken);
    return {
      request: this.requests.get(id)!,
      quotes,
    };
  }

  async refreshQuotes(
    userId: string,
    requestId: string,
    authToken?: string | null,
  ): Promise<CarrierQuote[]> {
    const request = this.getRequestOrThrow(userId, requestId);
    const quoteResults = await Promise.allSettled(
      this.adapters.map((adapter) =>
        adapter.quote(
          {
            snapshot: request.snapshot,
            draft: request.draft,
          },
          requestId,
          { userId, authToken },
        ),
      ),
    );

    const successfulQuotes: CarrierQuote[] = [];
    for (let i = 0; i < quoteResults.length; i += 1) {
      const result = quoteResults[i];
      if (result.status === 'fulfilled') {
        if (Array.isArray(result.value) && result.value.length > 0) {
          successfulQuotes.push(...result.value);
        }
        continue;
      }
      const adapter = this.adapters[i];
      this.logger.warn(
        `Quote adapter failed: ${adapter?.descriptor?.id ?? 'unknown'}; requestId=${requestId}; reason=${String(result.reason)}`,
      );
    }

    const quotes = rankQuotes(successfulQuotes);
    this.logQuoteAudit(requestId, request, quotes);

    request.status = quotes.length > 0 ? 'QUOTED' : 'DRAFT';
    request.updatedAt = new Date().toISOString();
    this.requests.set(requestId, request);
    this.quotes.set(requestId, quotes);
    return quotes;
  }

  private logQuoteAudit(requestId: string, request: ShipmentRequestRecord, quotes: CarrierQuote[]): void {
    if (!this.quoteDebugEnabled) return;
    const payload = {
      requestId,
      route: {
        origin: request.draft.originLabel || request.snapshot.originLabel || null,
        destination: request.draft.destinationLabel || request.snapshot.destinationLabel || null,
      },
      cargo: request.snapshot.cargo,
      carriers: quotes.map((q) => ({
        carrierId: q.carrierId,
        carrierName: q.carrierName,
        totalRub: q.priceRub,
        etaDays: q.etaDays,
        priceDetails: q.priceDetails ?? null,
        notes: q.notes ?? null,
      })),
    };
    this.logger.log(`[quote-audit] ${JSON.stringify(payload)}`);
  }

  getQuotes(userId: string, requestId: string): CarrierQuote[] {
    this.getRequestOrThrow(userId, requestId);
    return this.quotes.get(requestId) ?? [];
  }

  selectQuote(userId: string, requestId: string, quoteId: string): ShipmentRequestRecord {
    const request = this.getRequestOrThrow(userId, requestId);
    const quote = (this.quotes.get(requestId) ?? []).find((item) => item.id === quoteId);
    if (!quote) {
      throw new NotFoundException('Тариф не найден');
    }
    request.selectedQuoteId = quoteId;
    request.updatedAt = new Date().toISOString();
    this.requests.set(requestId, request);
    return request;
  }

  async confirmSelectedQuote(userId: string, requestId: string): Promise<ShipmentRecord> {
    const request = this.getRequestOrThrow(userId, requestId);
    if (!request.selectedQuoteId) {
      throw new NotFoundException('Сначала выберите тариф');
    }
    const existingShipment = [...this.shipments.values()].find(
      (item) => item.userId === userId && item.requestId === requestId,
    );
    if (existingShipment) {
      return existingShipment;
    }

    const quote = (this.quotes.get(requestId) ?? []).find((item) => item.id === request.selectedQuoteId);
    if (!quote) {
      throw new NotFoundException('Выбранный тариф больше недоступен, обновите тарифы');
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

  private resolveTmsOrderStatus(
    requestStatus?: ShipmentRequestRecord['status'],
    shipmentStatus?: ShipmentRecord['status'],
  ): TmsOrderStatus {
    if (shipmentStatus === 'DELIVERED') return 'DELIVERED';
    if (shipmentStatus && shipmentStatus !== 'CREATED' && shipmentStatus !== 'CONFIRMED') {
      return 'IN_TRANSIT';
    }
    if (requestStatus === 'BOOKED') return 'BOOKED';
    if (requestStatus === 'QUOTED') return 'QUOTED';
    if (requestStatus === 'DRAFT') return 'DRAFT';
    return 'NO_REQUEST';
  }

  private async fetchCoreOrders(
    userId: string,
    authToken?: string | null,
  ): Promise<ClientOrderRecord[]> {
    if (!authToken) {
      return [];
    }
    const base = (process.env.CORE_API_URL ?? 'http://localhost:4000').replace(/\/api\/?$/, '');
    const res = await fetch(`${base}/api/tms/orders/candidates`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new NotFoundException('Не удалось получить заказы клиента из core');
    }
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  }
}
