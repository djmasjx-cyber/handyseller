import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
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
import { TmsStoreService } from './storage/tms-store.service';
import { ObjectStorageService } from './storage/object-storage.service';
import { createHmac, randomBytes } from 'crypto';

@Injectable()
export class ShipmentsService implements OnModuleInit {
  private readonly logger = new Logger(ShipmentsService.name);
  private readonly quoteDebugEnabled =
    process.env.TMS_QUOTE_DEBUG === '1' || process.env.TMS_QUOTE_DEBUG === 'true';
  private readonly adapters: CarrierAdapter[] = ShipmentsService.buildCarrierAdapters();
  private readonly requests = new Map<string, ShipmentRequestRecord>();
  private readonly quotes = new Map<string, CarrierQuote[]>();
  private readonly shipments = new Map<string, ShipmentRecord>();
  private readonly tracking = new Map<string, TrackingEventRecord[]>();
  private readonly documents = new Map<string, ShipmentDocumentRecord[]>();
  private readonly idempotencyFallback = new Map<string, unknown>();
  private readonly webhookSubscriptions = new Map<
    string,
    {
      id: string;
      userId: string;
      callbackUrl: string;
      status: 'ACTIVE' | 'DISABLED';
      createdAt: string;
      updatedAt: string;
      secretMasked: string;
      signingSecret: string;
    }
  >();
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

  constructor(
    private readonly store: TmsStoreService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.store.isEnabled()) return;
    const [requests, shipments, tracking, documents] = await Promise.all([
      this.store.loadRequests(),
      this.store.loadShipments(),
      this.store.loadTracking(),
      this.store.loadDocuments(),
    ]);
    const subscriptions = await this.store.loadWebhookSubscriptions();
    for (const item of requests) this.requests.set(item.id, item);
    for (const item of shipments) this.shipments.set(item.id, item);
    for (const item of tracking) {
      const list = this.tracking.get(item.shipmentId) ?? [];
      list.push(item);
      this.tracking.set(item.shipmentId, list);
    }
    for (const item of documents) {
      const list = this.documents.get(item.shipmentId) ?? [];
      list.push(item);
      this.documents.set(item.shipmentId, list);
      const marker = this.extractInlinePdfMarker(item.content);
      if (marker) {
        const objectKey = `shipments/${item.shipmentId}/documents/${item.id}.pdf`;
        void this.objectStorage.putBuffer(objectKey, marker.buffer);
      }
    }
    for (const item of subscriptions) this.webhookSubscriptions.set(item.id, item);
  }

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

  getShipment(userId: string, shipmentId: string): ShipmentRecord {
    const shipment = this.shipments.get(shipmentId);
    if (!shipment || shipment.userId !== userId) {
      throw new NotFoundException('Отгрузка не найдена');
    }
    return shipment;
  }

  getShipmentByExternalOrderId(
    userId: string,
    externalOrderId: string,
    orderType?: 'CLIENT_ORDER' | 'INTERNAL_TRANSFER' | 'SUPPLIER_PICKUP',
  ): {
    requestId: string;
    shipment: ShipmentRecord | null;
    status: ShipmentRequestRecord['status'] | ShipmentRecord['status'];
    externalOrderId: string;
    orderType: 'CLIENT_ORDER' | 'INTERNAL_TRANSFER' | 'SUPPLIER_PICKUP' | null;
  } {
    const normalizedExternalOrderId = externalOrderId.trim();
    if (!normalizedExternalOrderId) {
      throw new BadRequestException('externalOrderId обязателен');
    }
    const request = [...this.requests.values()]
      .filter((item) => item.userId === userId)
      .find(
        (item) =>
          item.integration?.externalOrderId === normalizedExternalOrderId &&
          (!orderType || item.integration?.orderType === orderType),
      );
    if (!request) {
      throw new NotFoundException('Заявка с externalOrderId не найдена');
    }
    const shipment = [...this.shipments.values()].find((item) => item.userId === userId && item.requestId === request.id) ?? null;
    return {
      requestId: request.id,
      shipment,
      status: shipment?.status ?? request.status,
      externalOrderId: request.integration?.externalOrderId ?? normalizedExternalOrderId,
      orderType: request.integration?.orderType ?? null,
    };
  }

  listShipmentsByIntegration(
    userId: string,
    filter?: {
      externalOrderId?: string;
      orderType?: 'CLIENT_ORDER' | 'INTERNAL_TRANSFER' | 'SUPPLIER_PICKUP';
      limit?: number;
      cursor?: string;
      updatedSince?: string;
    },
  ): {
    items: Array<{
      requestId: string;
      shipmentId: string | null;
      status: ShipmentRequestRecord['status'] | ShipmentRecord['status'];
      externalOrderId: string;
      orderType: 'CLIENT_ORDER' | 'INTERNAL_TRANSFER' | 'SUPPLIER_PICKUP' | null;
      shipment: ShipmentRecord | null;
    }>;
    nextCursor: string | null;
  } {
    const externalOrderId = filter?.externalOrderId?.trim();
    const orderType = filter?.orderType;
    const safeLimit = Math.max(1, Math.min(100, filter?.limit ?? 20));
    const cursor = filter?.cursor?.trim();
    const updatedSinceTs = filter?.updatedSince ? Date.parse(filter.updatedSince) : NaN;
    const hasUpdatedSince = Number.isFinite(updatedSinceTs);

    const all = [...this.requests.values()]
      .filter((item) => item.userId === userId)
      .filter((item) => (externalOrderId ? item.integration?.externalOrderId === externalOrderId : true))
      .filter((item) => (orderType ? item.integration?.orderType === orderType : true))
      .filter((item) => Boolean(item.integration?.externalOrderId))
      .filter((item) => {
        if (!hasUpdatedSince) return true;
        return Date.parse(item.updatedAt) >= updatedSinceTs;
      })
      .map((request) => {
        const shipment = [...this.shipments.values()].find((item) => item.userId === userId && item.requestId === request.id) ?? null;
        const sortDate = shipment?.createdAt ?? request.updatedAt;
        return {
          requestId: request.id,
          shipmentId: shipment?.id ?? null,
          status: shipment?.status ?? request.status,
          externalOrderId: request.integration?.externalOrderId ?? '',
          orderType: request.integration?.orderType ?? null,
          shipment,
          sortKey: `${sortDate}|${request.id}`,
        };
      })
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey));

    const startIndex = cursor ? all.findIndex((item) => item.sortKey === cursor) + 1 : 0;
    const itemsWithMeta = all.slice(Math.max(0, startIndex), Math.max(0, startIndex) + safeLimit);
    const next = all[Math.max(0, startIndex) + safeLimit];
    return {
      items: itemsWithMeta.map(({ sortKey: _sortKey, ...item }) => item),
      nextCursor: next?.sortKey ?? null,
    };
  }

  listWebhookSubscriptions(userId: string): Array<{
    id: string;
    callbackUrl: string;
    status: 'ACTIVE' | 'DISABLED';
    createdAt: string;
    updatedAt: string;
    secretMasked: string;
  }> {
    return [...this.webhookSubscriptions.values()]
      .filter((item) => item.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => ({
        id: item.id,
        callbackUrl: item.callbackUrl,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        secretMasked: item.secretMasked,
      }));
  }

  async createWebhookSubscription(userId: string, callbackUrl: string): Promise<{
    id: string;
    callbackUrl: string;
    status: 'ACTIVE' | 'DISABLED';
    createdAt: string;
    updatedAt: string;
    secretMasked: string;
    signingSecret: string;
  }> {
    let parsed: URL;
    try {
      parsed = new URL(callbackUrl.trim());
    } catch {
      throw new BadRequestException('Некорректный callbackUrl');
    }
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('callbackUrl должен быть HTTPS');
    }
    const now = new Date().toISOString();
    const id = `whsub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const signingSecret = `hs_whsec_${randomBytes(24).toString('base64url')}`;
    const record = {
      id,
      userId,
      callbackUrl: parsed.toString(),
      status: 'ACTIVE' as const,
      createdAt: now,
      updatedAt: now,
      secretMasked: `${signingSecret.slice(0, 12)}...`,
      signingSecret,
    };
    this.webhookSubscriptions.set(id, record);
    await this.store.saveWebhookSubscription(record);
    return { ...record, signingSecret };
  }

  async rotateWebhookSubscriptionSecret(userId: string, subscriptionId: string): Promise<{
    id: string;
    callbackUrl: string;
    status: 'ACTIVE' | 'DISABLED';
    createdAt: string;
    updatedAt: string;
    secretMasked: string;
    signingSecret: string;
  }> {
    const existing = this.webhookSubscriptions.get(subscriptionId);
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Webhook subscription не найдена');
    }
    const signingSecret = `hs_whsec_${randomBytes(24).toString('base64url')}`;
    const updated = {
      ...existing,
      updatedAt: new Date().toISOString(),
      signingSecret,
      secretMasked: `${signingSecret.slice(0, 12)}...`,
    };
    this.webhookSubscriptions.set(subscriptionId, updated);
    await this.store.saveWebhookSubscription(updated);
    return {
      id: updated.id,
      callbackUrl: updated.callbackUrl,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      secretMasked: updated.secretMasked,
      signingSecret,
    };
  }

  async deleteWebhookSubscription(userId: string, subscriptionId: string): Promise<{ ok: true }> {
    const existing = this.webhookSubscriptions.get(subscriptionId);
    if (!existing || existing.userId !== userId) {
      throw new NotFoundException('Webhook subscription не найдена');
    }
    this.webhookSubscriptions.delete(subscriptionId);
    await this.store.deleteWebhookSubscription(subscriptionId);
    return { ok: true };
  }

  async deliverWebhookEvent(payload: {
    subscriptionId: string;
    eventType: string;
    eventId: string;
    occurredAt: string;
    updatedAt: string;
    attempt: number;
    data: unknown;
  }): Promise<void> {
    const sub = this.webhookSubscriptions.get(payload.subscriptionId);
    if (!sub || sub.status !== 'ACTIVE' || !sub.signingSecret) return;
    const body = JSON.stringify({
      id: payload.eventId,
      type: payload.eventType,
      occurredAt: payload.occurredAt,
      updatedAt: payload.updatedAt,
      data: payload.data,
    });
    const signature = createHmac('sha256', sub.signingSecret).update(body, 'utf8').digest('hex');
    try {
      const response = await fetch(sub.callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Handyseller-Event': payload.eventType,
          'X-Handyseller-Signature': `sha256=${signature}`,
        },
        body,
      });
      if (!response.ok) {
        await this.store.appendWebhookDeliveryLog({
          subscriptionId: sub.id,
          eventId: payload.eventId,
          eventType: payload.eventType,
          status: 'FAILED',
          attempt: payload.attempt,
          responseCode: response.status,
          errorMessage: `HTTP ${response.status}`,
          payload: payload.data,
        });
        throw new BadRequestException(`Webhook delivery failed with status ${response.status}`);
      }
      await this.store.appendWebhookDeliveryLog({
        subscriptionId: sub.id,
        eventId: payload.eventId,
        eventType: payload.eventType,
        status: 'SUCCESS',
        attempt: payload.attempt,
        responseCode: response.status,
        payload: payload.data,
      });
    } catch (error) {
      if (!(error instanceof BadRequestException)) {
        await this.store.appendWebhookDeliveryLog({
          subscriptionId: sub.id,
          eventId: payload.eventId,
          eventType: payload.eventType,
          status: 'FAILED',
          attempt: payload.attempt,
          errorMessage: error instanceof Error ? error.message : String(error),
          payload: payload.data,
        });
      }
      throw error;
    }
  }

  async ingestCarrierWebhookIdempotent(input: {
    carrier: string;
    eventType: string;
    eventId: string;
    payload?: unknown;
  }): Promise<{ queued: boolean }> {
    const scopeKey = `carrier-webhook:${input.carrier}:${input.eventId}`;
    return this.withIdempotency(scopeKey, async () => {
      const jobId = `job_carrier_wh_${input.carrier}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await this.store.enqueueSyncJob({
        id: jobId,
        kind: 'ingest_carrier_webhook',
        carrier: input.carrier,
        idempotencyKey: scopeKey,
        payload: {
          carrier: input.carrier,
          eventType: input.eventType,
          eventId: input.eventId,
          receivedAt: new Date().toISOString(),
          payload: input.payload ?? null,
        },
      });
      return { queued: true };
    });
  }

  async processInboundCarrierWebhook(payload: {
    carrier: string;
    eventType: string;
    eventId: string;
    receivedAt: string;
    payload?: unknown;
  }): Promise<void> {
    const carrier = (payload.carrier || '').trim().toLowerCase();
    const eventType = payload.eventType || 'carrier.updated';
    const eventId = payload.eventId || 'n/a';
    this.logger.log(`[carrier-webhook] accepted carrier=${carrier} eventType=${eventType} eventId=${eventId}`);

    // Minimal generic behavior for scaffold: if payload contains known identifiers, schedule refresh.
    const body = (payload.payload ?? {}) as Record<string, unknown>;
    const shipmentId = typeof body.shipmentId === 'string' ? body.shipmentId.trim() : '';
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    if (shipmentId && userId) {
      await this.store.enqueueSyncJob({
        id: `job_refresh_from_webhook_${shipmentId}_${Date.now()}`,
        kind: 'refresh_shipment',
        carrier: carrier || null,
        idempotencyKey: `refresh:${shipmentId}:${eventId}`,
        payload: { userId, shipmentId },
      });
    }
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

  async getSloMetrics(
    userId: string,
    options?: { staleHours?: number; webhookWindowHours?: number },
  ): Promise<{
    generatedAt: string;
    userId: string;
    staleHours: number;
    totals: {
      requests: number;
      shipments: number;
      activeShipments: number;
      staleShipments: number;
      webhookSubscriptionsActive: number;
    };
    syncJobs: {
      pending: number;
      running: number;
      failed: number;
    };
    webhookDelivery: {
      windowHours: number;
      success: number;
      failed: number;
      successRate: number;
    };
  }> {
    const staleHours = Math.max(1, Math.min(24 * 30, Math.floor(options?.staleHours ?? 24)));
    const webhookWindowHours = Math.max(1, Math.min(24 * 30, Math.floor(options?.webhookWindowHours ?? 24)));
    const now = Date.now();
    const staleMs = staleHours * 60 * 60 * 1000;

    const requests = this.listRequests(userId);
    const shipments = this.listShipments(userId);
    const activeShipments = shipments.filter((item) => item.status !== 'DELIVERED');
    const staleShipments = activeShipments.filter((item) => {
      const createdAt = Date.parse(item.createdAt);
      return Number.isFinite(createdAt) && now - createdAt >= staleMs;
    });
    const webhookSubscriptionsActive = [...this.webhookSubscriptions.values()].filter(
      (item) => item.userId === userId && item.status === 'ACTIVE',
    ).length;

    const [syncJobs, webhookDelivery] = await Promise.all([
      this.store.getSyncJobStats(),
      this.store.getWebhookDeliveryStats(webhookWindowHours),
    ]);
    const totalDeliveries = webhookDelivery.success + webhookDelivery.failed;
    const successRate = totalDeliveries > 0 ? webhookDelivery.success / totalDeliveries : 1;

    return {
      generatedAt: new Date().toISOString(),
      userId,
      staleHours,
      totals: {
        requests: requests.length,
        shipments: shipments.length,
        activeShipments: activeShipments.length,
        staleShipments: staleShipments.length,
        webhookSubscriptionsActive,
      },
      syncJobs,
      webhookDelivery: {
        windowHours: webhookWindowHours,
        success: webhookDelivery.success,
        failed: webhookDelivery.failed,
        successRate: Number(successRate.toFixed(4)),
      },
    };
  }

  async listFailedSyncJobs(): Promise<
    Array<{
      id: string;
      kind: string;
      carrier: string | null;
      attempt: number;
      lastError: string | null;
      payload: unknown;
      nextRunAt: string;
    }>
  > {
    return this.store.listFailedSyncJobs(100);
  }

  async replayFailedSyncJob(jobId: string): Promise<{ ok: boolean }> {
    const ok = await this.store.replayFailedSyncJob(jobId);
    return { ok };
  }

  async backfillPersistentStore(): Promise<{ requests: number; shipments: number; tracking: number; documents: number }> {
    const requests = [...this.requests.values()];
    const shipments = [...this.shipments.values()];
    const tracking = [...this.tracking.values()].flat();
    const documents = [...this.documents.values()].flat();
    for (const item of requests) await this.store.saveRequest(item);
    for (const item of shipments) await this.store.saveShipment(item);
    for (const item of shipments) {
      await this.store.replaceTracking(item.id, this.tracking.get(item.id) ?? []);
      const docs = this.documents.get(item.id) ?? [];
      await this.store.replaceDocuments(item.id, docs);
      await this.persistDocumentAssets(item.id, docs);
    }
    this.logger.log(
      `[rollout] backfill_done requests=${requests.length} shipments=${shipments.length} tracking=${tracking.length} documents=${documents.length}`,
    );
    return { requests: requests.length, shipments: shipments.length, tracking: tracking.length, documents: documents.length };
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
      integration: input.integration,
      createdAt: now,
      updatedAt: now,
    };
    this.requests.set(id, request);
    void this.store.saveRequest(request);
    const quotes = await this.refreshQuotes(userId, id, authToken);
    return {
      request: this.requests.get(id)!,
      quotes,
    };
  }

  async createFromCoreOrderIdempotent(
    userId: string,
    input: CreateShipmentRequestInput,
    idempotencyKey?: string | null,
    authToken?: string | null,
  ): Promise<CreateShipmentRequestResult> {
    const scopeKey = this.buildIdempotencyScopeKey(userId, 'create', idempotencyKey);
    if (!scopeKey) return this.createFromCoreOrder(userId, input, authToken);
    return this.withIdempotency(scopeKey, () => this.createFromCoreOrder(userId, input, authToken));
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
    void this.store.saveRequest(request);
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
    void this.store.saveRequest(request);
    return request;
  }

  async confirmSelectedQuote(
    userId: string,
    requestId: string,
    authToken?: string | null,
  ): Promise<ShipmentRecord> {
    const request = this.getRequestOrThrow(userId, requestId);
    if (!request.selectedQuoteId) {
      throw new NotFoundException('Сначала выберите тариф');
    }
    const existingShipment = [...this.shipments.values()].find(
      (item) => item.userId === userId && item.requestId === requestId,
    );

    const quote = (this.quotes.get(requestId) ?? []).find((item) => item.id === request.selectedQuoteId);
    if (!quote) {
      throw new NotFoundException('Выбранный тариф больше недоступен, обновите тарифы');
    }
    const adapter = this.adapters.find((item) => item.descriptor.id === quote.carrierId);
    if (!adapter) {
      throw new NotFoundException('Перевозчик не найден');
    }
    if (existingShipment) {
      const isLegacyCdekPending =
        existingShipment.carrierId === 'cdek' &&
        existingShipment.trackingNumber.startsWith('CDEK-PENDING-') &&
        !existingShipment.carrierOrderReference;
      const isCdekPending =
        existingShipment.carrierId === 'cdek' &&
        existingShipment.trackingNumber.startsWith('CDEK-PENDING-');
      const isLegacyMajorPending =
        existingShipment.carrierId === 'major-express' &&
        existingShipment.trackingNumber.startsWith('MAJOR-PENDING-') &&
        !existingShipment.carrierOrderReference;
      if (!isLegacyCdekPending && !isLegacyMajorPending && !isCdekPending) {
        request.status = 'BOOKED';
        request.updatedAt = new Date().toISOString();
        this.requests.set(requestId, request);
        void this.store.saveRequest(request);
        return existingShipment;
      }
      this.logger.warn(
        `Found pending shipment; rebooking requestId=${requestId} shipmentId=${existingShipment.id} carrier=${existingShipment.carrierId}`,
      );
      this.shipments.delete(existingShipment.id);
      this.tracking.delete(existingShipment.id);
      this.documents.delete(existingShipment.id);
      void this.store.deleteShipment(existingShipment.id);
    }
    if (!adapter.descriptor.supportsBooking) {
      throw new BadRequestException(
        `Оформление перевозки через ${adapter.descriptor.name} пока не реализовано: тариф можно сравнить и выбрать, но заявка в ЛК ТК не создается.`,
      );
    }

    let booking: Awaited<ReturnType<typeof adapter.book>>;
    try {
      booking = await adapter.book({
        quote,
        input: {
          snapshot: request.snapshot,
          draft: request.draft,
        },
        context: { userId, authToken },
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : `Не удалось оформить перевозку через ${adapter.descriptor.name}`;
      throw new BadRequestException(message);
    }
    const shipmentId = `shp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const shipment: ShipmentRecord = {
      id: shipmentId,
      userId,
      createdAt: new Date().toISOString(),
      ...booking.shipment,
    };
    this.shipments.set(shipmentId, shipment);
    void this.store.saveShipment(shipment);
    this.tracking.set(
      shipmentId,
      booking.tracking.map((item, index) => ({
        ...item,
        id: `${shipmentId}_${index + 1}`,
        shipmentId,
      })),
    );
    void this.store.replaceTracking(shipmentId, this.tracking.get(shipmentId) ?? []);
    const docsFromCarrier = booking.documents?.length
      ? booking.documents.map((doc, index) => ({
          id: `${shipmentId}_doc_${index + 1}`,
          shipmentId,
          type: doc.type,
          title: doc.title,
          content: doc.content,
          createdAt: shipment.createdAt,
        }))
      : [
          {
            id: `${shipmentId}_waybill`,
            shipmentId,
            type: 'WAYBILL' as const,
            title: 'Транспортная накладная',
            content: `ТН ${shipment.trackingNumber} / ${shipment.carrierName}`,
            createdAt: shipment.createdAt,
          },
          {
            id: `${shipmentId}_label`,
            shipmentId,
            type: 'LABEL' as const,
            title: 'Отгрузочный ярлык',
            content: `LABEL ${shipment.trackingNumber}`,
            createdAt: shipment.createdAt,
          },
        ];
    this.documents.set(shipmentId, docsFromCarrier);
    void this.store.replaceDocuments(shipmentId, docsFromCarrier);
    void this.persistDocumentAssets(shipmentId, docsFromCarrier);

    // Warm up documents/tracking right after booking so UI opens cached files instantly.
    // We do this best-effort: booking must stay successful even if carrier doc sync is delayed.
    try {
      await this.refreshShipment(userId, shipmentId, authToken);
    } catch (error) {
      this.logger.warn(
        `[slo] immediate_refresh_failed carrier=${shipment.carrierId} shipmentId=${shipmentId} reason=${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    void this.store.enqueueSyncJob({
      id: `job_refresh_${shipmentId}_${Date.now()}`,
      kind: 'refresh_shipment',
      carrier: shipment.carrierId,
      idempotencyKey: `refresh:${shipmentId}:${new Date().toISOString().slice(0, 13)}`,
      payload: { userId, shipmentId },
      nextRunAt: new Date().toISOString(),
    });
    this.logger.log(`[slo] shipment_confirmed carrier=${shipment.carrierId} shipmentId=${shipmentId}`);

    request.status = 'BOOKED';
    request.updatedAt = new Date().toISOString();
    this.requests.set(requestId, request);
    void this.store.saveRequest(request);
    await this.enqueuePartnerWebhookEvents(userId, 'shipment.confirmed', {
      requestId,
      shipmentId: shipment.id,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      carrierId: shipment.carrierId,
    });
    return shipment;
  }

  async confirmSelectedQuoteIdempotent(
    userId: string,
    requestId: string,
    idempotencyKey?: string | null,
    authToken?: string | null,
  ): Promise<ShipmentRecord> {
    const scopeKey = this.buildIdempotencyScopeKey(userId, `confirm:${requestId}`, idempotencyKey);
    if (!scopeKey) return this.confirmSelectedQuote(userId, requestId, authToken);
    return this.withIdempotency(scopeKey, () => this.confirmSelectedQuote(userId, requestId, authToken));
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

  async downloadDocument(
    userId: string,
    shipmentId: string,
    documentId: string,
    authToken?: string | null,
  ): Promise<{ content: Buffer; mimeType: string; fileName: string }> {
    const shipment = this.shipments.get(shipmentId);
    if (!shipment || shipment.userId !== userId) {
      throw new NotFoundException('Отгрузка не найдена');
    }
    const doc = (this.documents.get(shipmentId) ?? []).find((item) => item.id === documentId);
    if (!doc) {
      throw new NotFoundException('Документ не найден');
    }
    const adapter = this.adapters.find((item) => item.descriptor.id === shipment.carrierId);
    const inline = this.extractInlinePdfMarker(doc.content);
    if (inline) {
      const objectKey = `shipments/${shipmentId}/documents/${documentId}.pdf`;
      const existing = await this.objectStorage.getBuffer(objectKey);
      const content = existing ?? inline.buffer;
      if (!existing) {
        await this.objectStorage.putBuffer(objectKey, inline.buffer);
      }
      return {
        content,
        mimeType: 'application/pdf',
        fileName: `${shipment.trackingNumber || shipment.id}-${doc.type.toLowerCase()}.pdf`,
      };
    }
    if (!adapter?.downloadDocument) {
      return {
        content: Buffer.from(doc.content ?? '', 'utf-8'),
        mimeType: 'text/plain; charset=utf-8',
        fileName: `${shipment.trackingNumber || shipment.id}-${doc.type.toLowerCase()}.txt`,
      };
    }
    return adapter.downloadDocument({
      shipment,
      document: doc,
      context: { userId, authToken },
    });
  }

  async refreshShipment(
    userId: string,
    shipmentId: string,
    authToken?: string | null,
  ): Promise<ShipmentRecord> {
    const shipment = this.shipments.get(shipmentId);
    if (!shipment || shipment.userId !== userId) {
      throw new NotFoundException('Отгрузка не найдена');
    }
    const adapter = this.adapters.find((item) => item.descriptor.id === shipment.carrierId);
    if (!adapter?.refreshShipment) {
      throw new BadRequestException(`Обновление статуса для ${shipment.carrierName} пока не поддерживается.`);
    }
    let refreshed: Awaited<ReturnType<NonNullable<typeof adapter.refreshShipment>>>;
    try {
      refreshed = await adapter.refreshShipment({
        shipment,
        context: { userId, authToken },
      });
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : `Не удалось обновить статус отгрузки ${shipment.carrierName}`;
      throw new BadRequestException(message);
    }

    const updated: ShipmentRecord = { ...shipment, ...refreshed.shipmentPatch };
    const statusChanged = updated.status !== shipment.status;
    this.shipments.set(shipmentId, updated);
    void this.store.saveShipment(updated);

    if (refreshed.tracking?.length) {
      const existing = this.tracking.get(shipmentId) ?? [];
      const additions = refreshed.tracking.map((item, index) => ({
        ...item,
        id: `${shipmentId}_rf_${Date.now()}_${index + 1}`,
        shipmentId,
      }));
      this.tracking.set(shipmentId, [...existing, ...additions]);
      void this.store.replaceTracking(shipmentId, this.tracking.get(shipmentId) ?? []);
    }
    if (refreshed.documents?.length) {
      const current = this.documents.get(shipmentId) ?? [];
      const now = new Date().toISOString();
      const refreshedByType = new Map(
        refreshed.documents.map((doc, index) => [
          doc.type,
          {
            id: `${shipmentId}_doc_rf_${index + 1}`,
            shipmentId,
            type: doc.type,
            title: doc.title,
            content: doc.content,
            createdAt: now,
          },
        ]),
      );
      const merged = current
        .filter((doc) => !refreshedByType.has(doc.type))
        .concat([...refreshedByType.values()]);
      this.documents.set(shipmentId, merged);
      void this.store.replaceDocuments(shipmentId, merged);
      void this.persistDocumentAssets(shipmentId, merged);
      this.logger.log(
        `[slo] documents_updated shipmentId=${shipmentId} carrier=${shipment.carrierId} count=${merged.length}`,
      );
    }
    if (statusChanged || refreshed.tracking?.length || refreshed.documents?.length) {
      await this.enqueuePartnerWebhookEvents(userId, 'shipment.updated', {
        requestId: shipment.requestId,
        shipmentId,
        status: updated.status,
        trackingNumber: updated.trackingNumber,
        trackingEventsAdded: refreshed.tracking?.length ?? 0,
        documentsUpdated: refreshed.documents?.length ?? 0,
      });
    }
    return updated;
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

  private extractInlinePdfMarker(content?: string | null): { buffer: Buffer } | null {
    const value = (content ?? '').trim();
    if (!value.startsWith('major-pdf:') && !value.startsWith('cdek-pdf:')) return null;
    const parts = value.split(':');
    if (parts.length < 4) return null;
    const b64 = parts.slice(3).join(':');
    if (!b64) return null;
    try {
      const buffer = Buffer.from(b64, 'base64');
      if (buffer.length < 16 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') return null;
      return { buffer };
    } catch {
      return null;
    }
  }

  private async persistDocumentAssets(
    shipmentId: string,
    documents: ShipmentDocumentRecord[],
  ): Promise<void> {
    for (const doc of documents) {
      const inline = this.extractInlinePdfMarker(doc.content);
      if (!inline) continue;
      const objectKey = `shipments/${shipmentId}/documents/${doc.id}.pdf`;
      await this.objectStorage.putBuffer(objectKey, inline.buffer);
    }
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

  private buildIdempotencyScopeKey(userId: string, operation: string, idempotencyKey?: string | null): string | null {
    const trimmed = (idempotencyKey ?? '').trim();
    if (!trimmed) return null;
    return `${userId}:${operation}:${trimmed}`;
  }

  private async withIdempotency<T>(scopeKey: string, compute: () => Promise<T>): Promise<T> {
    const inMemory = this.idempotencyFallback.get(scopeKey);
    if (inMemory !== undefined) {
      return inMemory as T;
    }
    const fromStore = await this.store.loadIdempotencyResponse(scopeKey);
    if (fromStore !== null) {
      this.idempotencyFallback.set(scopeKey, fromStore);
      return fromStore as T;
    }
    const result = await compute();
    this.idempotencyFallback.set(scopeKey, result);
    await this.store.saveIdempotencyResponse(scopeKey, result);
    return result;
  }

  private async enqueuePartnerWebhookEvents(
    userId: string,
    eventType: 'shipment.confirmed' | 'shipment.updated',
    data: Record<string, unknown>,
  ): Promise<void> {
    const subscriptions = [...this.webhookSubscriptions.values()].filter(
      (item) => item.userId === userId && item.status === 'ACTIVE',
    );
    const occurredAt = new Date().toISOString();
    const updatedAt = occurredAt;
    for (const sub of subscriptions) {
      const eventId = `ev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await this.store.enqueueSyncJob({
        id: `job_wh_${sub.id}_${eventId}`,
        kind: 'deliver_partner_webhook',
        idempotencyKey: `wh:${sub.id}:${eventId}`,
        payload: { subscriptionId: sub.id, eventType, eventId, occurredAt, updatedAt, attempt: 1, data },
      });
    }
  }
}
