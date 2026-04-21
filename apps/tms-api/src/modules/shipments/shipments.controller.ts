import { Body, Controller, Get, Headers, Param, Post, Res, UseGuards } from '@nestjs/common';
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

  @Get('overview')
  overview(@CurrentUser('userId') userId: string) {
    return this.shipmentsService.getOverview(userId);
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
  listRequests(@CurrentUser('userId') userId: string) {
    return this.shipmentsService.listRequests(userId);
  }

  @Post('shipment-requests')
  @TmsAccess('write')
  createFromCoreOrder(
    @CurrentUser('userId') userId: string,
    @Body() input: CreateShipmentRequestInput,
    @Headers('authorization') authorization?: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    return this.shipmentsService.createFromCoreOrder(userId, input, authToken);
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
    @Param('id') requestId: string,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    return this.shipmentsService.refreshQuotes(userId, requestId, authToken);
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
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    return this.shipmentsService.confirmSelectedQuote(userId, requestId, authToken);
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
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    return this.shipmentsService.refreshShipment(userId, shipmentId, authToken);
  }

  @Get('shipments/:shipmentId/documents/:documentId/file')
  async downloadDocument(
    @CurrentUser('userId') userId: string,
    @Param('shipmentId') shipmentId: string,
    @Param('documentId') documentId: string,
    @Headers('authorization') authorization: string | undefined,
    @Res() res: Response,
  ) {
    const authToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    const file = await this.shipmentsService.downloadDocument(userId, shipmentId, documentId, authToken);
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
