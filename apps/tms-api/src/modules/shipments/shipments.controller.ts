import { Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import type { CreateShipmentRequestInput } from '@handyseller/tms-sdk';
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
}
