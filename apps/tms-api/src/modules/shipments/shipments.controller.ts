import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { CreateShipmentRequestInput } from '@handyseller/tms-sdk';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ShipmentsService } from './shipments.service';

@Controller('tms')
@UseGuards(JwtAuthGuard)
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('overview')
  overview(@CurrentUser('userId') userId: string) {
    return this.shipmentsService.getOverview(userId);
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
  createFromCoreOrder(
    @CurrentUser('userId') userId: string,
    @Body() input: CreateShipmentRequestInput,
  ) {
    return this.shipmentsService.createFromCoreOrder(userId, input);
  }

  @Get('shipment-requests/:id/quotes')
  getQuotes(@CurrentUser('userId') userId: string, @Param('id') requestId: string) {
    return this.shipmentsService.getQuotes(userId, requestId);
  }

  @Post('shipment-requests/:id/quotes/refresh')
  refreshQuotes(@CurrentUser('userId') userId: string, @Param('id') requestId: string) {
    return this.shipmentsService.refreshQuotes(userId, requestId);
  }

  @Post('shipment-requests/:id/select-quote')
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
