import { Body, Controller, Delete, Get, Headers, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { CreateShipmentRequestInput } from '@handyseller/tms-sdk';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TmsAccess } from '../auth/tms-access.metadata';
import { TmsScopeGuard } from '../auth/tms-scope.guard';
import { ShipmentsService } from './shipments.service';

@Controller('tms')
@UseGuards(JwtAuthGuard, TmsScopeGuard)
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  private resolveRequestId(headerValue?: string): string {
    const trimmed = (headerValue ?? '').trim();
    if (trimmed) return trimmed.slice(0, 128);
    return `tms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  @Get('overview')
  overview(@CurrentUser('userId') userId: string) {
    return this.shipmentsService.getOverview(userId);
  }

  @Get('slo/metrics')
  @TmsAccess('read')
  sloMetrics(
    @CurrentUser('userId') userId: string,
    @Query('staleHours') staleHours?: string,
    @Query('webhookWindowHours') webhookWindowHours?: string,
  ) {
    const parsedStaleHours = staleHours ? Number.parseInt(staleHours, 10) : undefined;
    const parsedWebhookWindowHours = webhookWindowHours ? Number.parseInt(webhookWindowHours, 10) : undefined;
    return this.shipmentsService.getSloMetrics(userId, {
      staleHours: Number.isFinite(parsedStaleHours) ? parsedStaleHours : undefined,
      webhookWindowHours: Number.isFinite(parsedWebhookWindowHours) ? parsedWebhookWindowHours : undefined,
    });
  }

  @Get('client-orders')
  clientOrders(
    @CurrentUser('userId') userId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    return this.shipmentsService.listClientOrders(userId, authToken);
  }

  @Get('carriers')
  carriers() {
    return this.shipmentsService.listCarriers();
  }

  @Get('routing-policies')
  routingPolicies() {
    return this.shipmentsService.listRoutingPolicies();
  }

  @Get('shipment-requests')
  listRequests(
    @CurrentUser('userId') userId: string,
    /** `operator` — заявки для «Сравнение тарифов» (без витрины PARTNER, без завершённых с отгрузкой). */
    @Query('view') view?: string,
  ) {
    if (view === 'operator' || view === 'comparison') {
      return this.shipmentsService.listRequestsForOperatorComparison(userId);
    }
    return this.shipmentsService.listRequests(userId);
  }

  @Post('shipment-requests')
  @TmsAccess('write')
  createFromCoreOrder(
    @CurrentUser('userId') userId: string,
    @Body() input: CreateShipmentRequestInput,
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    return this.shipmentsService.createFromCoreOrderIdempotent(
      userId,
      input,
      null,
      authToken,
      this.resolveRequestId(requestId),
    );
  }

  @Get('shipment-requests/:id/quotes')
  getQuotes(@CurrentUser('userId') userId: string, @Param('id') requestId: string) {
    return this.shipmentsService.getQuotes(userId, requestId);
  }

  @Post('shipment-requests/:id/quotes/refresh')
  @TmsAccess('write')
  refreshQuotes(
    @CurrentUser('userId') userId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-request-id') inboundRequestId: string | undefined,
    @Param('id') requestId: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    return this.shipmentsService.refreshQuotes(userId, requestId, authToken, this.resolveRequestId(inboundRequestId));
  }

  @Post('shipment-requests/:id/select-quote')
  @TmsAccess('write')
  selectQuote(
    @CurrentUser('userId') userId: string,
    @Param('id') requestId: string,
    @Body('quoteId') quoteId: string,
  ) {
    return this.shipmentsService.selectQuote(userId, requestId, quoteId);
  }

  @Post('shipment-requests/:id/confirm')
  @TmsAccess('write')
  confirmQuote(
    @CurrentUser('userId') userId: string,
    @Param('id') requestId: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') inboundRequestId?: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    return this.shipmentsService.confirmSelectedQuoteIdempotent(
      userId,
      requestId,
      null,
      authToken,
      this.resolveRequestId(inboundRequestId),
    );
  }

  @Post('v1/shipments/estimate')
  @TmsAccess('write')
  async v1Estimate(
    @CurrentUser('userId') userId: string,
    @Body() input: CreateShipmentRequestInput,
    @Headers('authorization') authorization?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const forPartner: CreateShipmentRequestInput = {
      ...input,
      integration: {
        ...input.integration,
        fulfillmentMode: input.integration?.fulfillmentMode ?? 'PARTNER_SELF_SERVE',
      },
    };
    const result = await this.shipmentsService.createFromCoreOrderIdempotent(
      userId,
      forPartner,
      idempotencyKey,
      authToken,
      this.resolveRequestId(requestId),
    );
    return {
      shipmentRequestId: result.request.id,
      status: result.request.status,
      externalOrderId: result.request.integration?.externalOrderId ?? null,
      orderType: result.request.integration?.orderType ?? null,
      fulfillmentMode: result.request.integration?.fulfillmentMode ?? null,
      options: result.quotes.map((quote) => ({
        quoteId: quote.id,
        carrierId: quote.carrierId,
        carrierName: quote.carrierName,
        mode: quote.mode,
        serviceFlags: quote.serviceFlags,
        etaDays: quote.etaDays,
        priceRub: quote.priceRub,
        totalPriceRub: quote.priceRub,
        notes: quote.notes,
        priceDetails: quote.priceDetails,
      })),
    };
  }

  @Get('v1/orders')
  @TmsAccess('read')
  v1ListOrderRegistry(
    @CurrentUser('userId') userId: string,
    @Headers('authorization') authorization?: string,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('carrierId') carrierId?: string,
    @Query('externalOrderId') externalOrderId?: string,
    @Query('orderType') orderType?: 'CLIENT_ORDER' | 'INTERNAL_TRANSFER' | 'SUPPLIER_PICKUP',
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('hasShipment') hasShipment?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const parsedHasShipment =
      hasShipment === 'true' ? true : hasShipment === 'false' ? false : undefined;
    return this.shipmentsService.listOrderRegistry(userId, {
      authToken,
      q,
      status,
      carrierId,
      externalOrderId,
      orderType,
      dateFrom,
      dateTo,
      hasShipment: parsedHasShipment,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      cursor,
    });
  }

  @Get('v1/orders/:requestId')
  @TmsAccess('read')
  v1GetOrderRegistryDetail(@CurrentUser('userId') userId: string, @Param('requestId') requestId: string) {
    return this.shipmentsService.getOrderRegistryDetail(userId, requestId);
  }

  @Get('v1/pickup-points')
  @TmsAccess('read')
  v1ListPickupPoints(
    @CurrentUser('userId') userId: string,
    @Headers('authorization') authorization?: string,
    @Query('carrierId') carrierId?: string,
    @Query('city') city?: string,
    @Query('address') address?: string,
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
    @Query('limit') limit?: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const parsedLat = lat ? Number.parseFloat(lat) : undefined;
    const parsedLon = lon ? Number.parseFloat(lon) : undefined;
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.shipmentsService.listPickupPoints(
      userId,
      {
        carrierId,
        city,
        address,
        lat: Number.isFinite(parsedLat) ? parsedLat : undefined,
        lon: Number.isFinite(parsedLon) ? parsedLon : undefined,
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      },
      authToken,
    );
  }

  @Get('v1/shipments/:id/pickup-points')
  @TmsAccess('read')
  v1ListPickupPointsForRequest(
    @CurrentUser('userId') userId: string,
    @Param('id') requestId: string,
    @Headers('authorization') authorization?: string,
    @Query('carrierId') carrierId?: string,
    @Query('city') city?: string,
    @Query('address') address?: string,
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
    @Query('limit') limit?: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const parsedLat = lat ? Number.parseFloat(lat) : undefined;
    const parsedLon = lon ? Number.parseFloat(lon) : undefined;
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.shipmentsService.listPickupPointsForRequest(
      userId,
      requestId,
      {
        carrierId,
        city,
        address,
        lat: Number.isFinite(parsedLat) ? parsedLat : undefined,
        lon: Number.isFinite(parsedLon) ? parsedLon : undefined,
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      },
      authToken,
    );
  }

  @Post('v1/shipments')
  @TmsAccess('write')
  async v1CreateShipment(
    @CurrentUser('userId') userId: string,
    @Body() input: CreateShipmentRequestInput,
    @Headers('authorization') authorization?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const result = await this.shipmentsService.createFromCoreOrderIdempotent(
      userId,
      input,
      idempotencyKey,
      authToken,
      this.resolveRequestId(requestId),
    );
    return {
      shipmentRequestId: result.request.id,
      status: result.request.status,
      selectedQuoteId: result.request.selectedQuoteId ?? null,
      externalOrderId: result.request.integration?.externalOrderId ?? null,
      orderType: result.request.integration?.orderType ?? null,
      fulfillmentMode: result.request.integration?.fulfillmentMode ?? null,
      quotes: result.quotes,
    };
  }

  @Post('v1/shipments/:id/confirm')
  @TmsAccess('write')
  v1ConfirmShipment(
    @CurrentUser('userId') userId: string,
    @Param('id') requestId: string,
    @Headers('authorization') authorization?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-request-id') inboundRequestId?: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    return this.shipmentsService.confirmSelectedQuoteIdempotent(
      userId,
      requestId,
      idempotencyKey,
      authToken,
      this.resolveRequestId(inboundRequestId),
    );
  }

  @Post('v1/shipments/:id/select')
  @TmsAccess('write')
  v1SelectQuote(
    @CurrentUser('userId') userId: string,
    @Param('id') requestId: string,
    @Body('quoteId') quoteId: string,
  ) {
    return this.shipmentsService.selectQuote(userId, requestId, quoteId);
  }

  @Post('v1/shipments/:id/select-and-confirm')
  @TmsAccess('write')
  v1SelectAndConfirmShipment(
    @CurrentUser('userId') userId: string,
    @Param('id') requestId: string,
    @Body('quoteId') quoteId: string,
    @Headers('authorization') authorization?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-request-id') inboundRequestId?: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    return this.shipmentsService.selectAndConfirmQuoteIdempotent(
      userId,
      requestId,
      quoteId,
      idempotencyKey,
      authToken,
      this.resolveRequestId(inboundRequestId),
    );
  }

  @Get('v1/shipments/:id')
  @TmsAccess('read')
  v1GetShipment(@CurrentUser('userId') userId: string, @Param('id') shipmentId: string) {
    return this.shipmentsService.getShipment(userId, shipmentId);
  }

  @Get('v1/shipments/:id/events')
  @TmsAccess('read')
  v1GetShipmentEvents(@CurrentUser('userId') userId: string, @Param('id') shipmentId: string) {
    return this.shipmentsService.getTracking(userId, shipmentId);
  }

  @Get('v1/shipments/by-external/:externalOrderId')
  @TmsAccess('read')
  v1GetShipmentByExternalOrderId(
    @CurrentUser('userId') userId: string,
    @Param('externalOrderId') externalOrderId: string,
    @Query('orderType') orderType?: 'CLIENT_ORDER' | 'INTERNAL_TRANSFER' | 'SUPPLIER_PICKUP',
  ) {
    return this.shipmentsService.getShipmentByExternalOrderId(userId, externalOrderId, orderType);
  }

  @Get('v1/shipments')
  @TmsAccess('read')
  v1ListShipments(
    @CurrentUser('userId') userId: string,
    @Query('externalOrderId') externalOrderId?: string,
    @Query('orderType') orderType?: 'CLIENT_ORDER' | 'INTERNAL_TRANSFER' | 'SUPPLIER_PICKUP',
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('updatedSince') updatedSince?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.shipmentsService.listShipmentsByIntegration(userId, {
      externalOrderId,
      orderType,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      cursor,
      updatedSince,
    });
  }

  @Get('v1/webhooks/subscriptions')
  @TmsAccess('read')
  v1ListWebhookSubscriptions(@CurrentUser('userId') userId: string) {
    return this.shipmentsService.listWebhookSubscriptions(userId);
  }

  @Post('v1/webhooks/subscriptions')
  @TmsAccess('write')
  v1CreateWebhookSubscription(
    @CurrentUser('userId') userId: string,
    @Body('callbackUrl') callbackUrl: string,
  ) {
    return this.shipmentsService.createWebhookSubscription(userId, callbackUrl);
  }

  @Delete('v1/webhooks/subscriptions/:id')
  @TmsAccess('write')
  v1DeleteWebhookSubscription(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.shipmentsService.deleteWebhookSubscription(userId, id);
  }

  @Post('v1/webhooks/subscriptions/:id/rotate-secret')
  @TmsAccess('write')
  v1RotateWebhookSubscriptionSecret(@CurrentUser('userId') userId: string, @Param('id') id: string) {
    return this.shipmentsService.rotateWebhookSubscriptionSecret(userId, id);
  }

  @Post('v1/webhooks/subscriptions/:id/replay/:eventId')
  @TmsAccess('write')
  v1ReplayWebhookEvent(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
    @Param('eventId') eventId: string,
  ) {
    return this.shipmentsService.replayWebhookDeliveryEvent(userId, id, eventId);
  }

  @Get('shipments')
  listShipments(@CurrentUser('userId') userId: string) {
    return this.shipmentsService.listShipments(userId);
  }

  @Get('shipments/:id/tracking')
  tracking(@CurrentUser('userId') userId: string, @Param('id') shipmentId: string) {
    return this.shipmentsService.getTracking(userId, shipmentId);
  }

  @Get('shipments/:id/documents')
  documents(@CurrentUser('userId') userId: string, @Param('id') shipmentId: string) {
    return this.shipmentsService.getDocuments(userId, shipmentId);
  }

  @Post('shipments/:id/refresh')
  @TmsAccess('write')
  refreshShipment(
    @CurrentUser('userId') userId: string,
    @Param('id') shipmentId: string,
    @Headers('authorization') authorization?: string,
    @Headers('x-request-id') requestId?: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    return this.shipmentsService.refreshShipment(userId, shipmentId, authToken, this.resolveRequestId(requestId));
  }

  @Get('shipments/:shipmentId/documents/:documentId/file')
  async downloadDocument(
    @CurrentUser('userId') userId: string,
    @Param('shipmentId') shipmentId: string,
    @Param('documentId') documentId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Res() res: Response,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const resolvedRequestId = this.resolveRequestId(requestId);
    const file = await this.shipmentsService.downloadDocument(userId, shipmentId, documentId, authToken, resolvedRequestId);
    res.setHeader('x-request-id', resolvedRequestId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.fileName.replace(/"/g, '')}"`);
    res.send(file.content);
  }

  @Get('sync/failed-jobs')
  @TmsAccess('write')
  failedJobs() {
    return this.shipmentsService.listFailedSyncJobs();
  }

  @Post('sync/failed-jobs/:id/replay')
  @TmsAccess('write')
  replayFailedJob(@Param('id') jobId: string) {
    return this.shipmentsService.replayFailedSyncJob(jobId);
  }

  @Post('sync/backfill')
  @TmsAccess('write')
  backfillPersistentStore() {
    return this.shipmentsService.backfillPersistentStore();
  }
}
