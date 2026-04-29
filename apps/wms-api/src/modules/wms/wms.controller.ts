import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, StreamableFile, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { WmsAccess } from '../auth/wms-access.metadata';
import { WmsScopeGuard } from '../auth/wms-scope.guard';
import {
  AddItemExternalBarcodeDto,
  CreateContainerDto,
  CreateInvoiceReceiptDto,
  CreateItemDto,
  CreateLocationDto,
  CreateReceiptDto,
  CreateWarehouseDto,
  ImportTransferOrdersDto,
  MoveInventoryDto,
  PrintLabelForScanDto,
  ReserveReceiptBarcodesDto,
  UpdateItemDto,
} from './wms.dto';
import { WmsAnalyticsService } from './analytics/wms-analytics.service';
import { WmsLabelingService } from './labeling/wms-labeling.service';
import { WmsService } from './wms.service';
import type { WmsBiTransferFilters, WmsBiTransferOrderKind } from '@handyseller/wms-sdk';

@Controller('wms')
@UseGuards(AuthGuard('jwt'), WmsScopeGuard)
export class WmsController {
  constructor(
    private readonly wms: WmsService,
    private readonly labeling: WmsLabelingService,
    private readonly analytics: WmsAnalyticsService,
  ) {}

  @Get('v1/warehouses')
  @WmsAccess('read')
  listWarehouses(@CurrentUser('userId') userId: string) {
    return this.wms.listWarehouses(userId);
  }

  @Post('v1/warehouses')
  @WmsAccess('admin')
  createWarehouse(@CurrentUser('userId') userId: string, @Body() input: CreateWarehouseDto) {
    return this.wms.createWarehouse(userId, input);
  }

  @Get('v1/locations')
  @WmsAccess('read')
  listLocations(@CurrentUser('userId') userId: string, @Query('warehouseId') warehouseId?: string) {
    return this.wms.listLocations(userId, warehouseId);
  }

  @Post('v1/locations')
  @WmsAccess('admin')
  createLocation(@CurrentUser('userId') userId: string, @Body() input: CreateLocationDto) {
    return this.wms.createLocation(userId, input);
  }

  @Get('v1/items')
  @WmsAccess('read')
  listItems(@CurrentUser('userId') userId: string) {
    return this.wms.listItems(userId);
  }

  @Post('v1/items')
  @WmsAccess('write')
  createItem(@CurrentUser('userId') userId: string, @Body() input: CreateItemDto) {
    return this.wms.createItem(userId, input);
  }

  @Patch('v1/items/:itemId')
  @WmsAccess('write')
  patchItem(
    @CurrentUser('userId') userId: string,
    @Param('itemId') itemId: string,
    @Body() input: UpdateItemDto,
  ) {
    return this.wms.updateItem(userId, itemId, input);
  }

  @Post('v1/items/:itemId/external-barcodes')
  @WmsAccess('write')
  addItemExternalBarcode(
    @CurrentUser('userId') userId: string,
    @Param('itemId') itemId: string,
    @Body() input: AddItemExternalBarcodeDto,
  ) {
    return this.wms.addItemExternalBarcode(userId, itemId, input);
  }

  @Get('v1/receipts')
  @WmsAccess('read')
  listReceipts(@CurrentUser('userId') userId: string) {
    return this.wms.listReceipts(userId);
  }

  @Get('v1/receipts/:receiptId')
  @WmsAccess('read')
  getReceipt(@CurrentUser('userId') userId: string, @Param('receiptId') receiptId: string) {
    return this.wms.getReceiptDetail(userId, receiptId);
  }

  @Get('v1/receipts/:receiptId/labels')
  @WmsAccess('read')
  async receiptLabelsPdf(@CurrentUser('userId') userId: string, @Param('receiptId') receiptId: string) {
    const buffer = await this.wms.getReceiptLabelsPdf(userId, receiptId);
    const safeRid = receiptId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="receipt-${safeRid}-labels.pdf"`,
    });
  }

  @Post('v1/receipts/invoice')
  @WmsAccess('write')
  createInvoiceReceipt(@CurrentUser('userId') userId: string, @Body() input: CreateInvoiceReceiptDto) {
    return this.wms.createInvoiceReceipt(userId, input);
  }

  @Post('v1/receipts/:receiptId/accept')
  @WmsAccess('write')
  acceptReceipt(@CurrentUser('userId') userId: string, @Param('receiptId') receiptId: string) {
    return this.wms.acceptReceipt(userId, receiptId);
  }

  @Post('v1/receipts')
  @WmsAccess('write')
  createReceipt(@CurrentUser('userId') userId: string, @Body() input: CreateReceiptDto) {
    return this.wms.createReceipt(userId, input);
  }

  @Post('v1/receipts/:receiptId/reserve-barcodes')
  @WmsAccess('write')
  reserveReceiptBarcodes(
    @CurrentUser('userId') userId: string,
    @Param('receiptId') receiptId: string,
    @Body() input: ReserveReceiptBarcodesDto,
  ) {
    return this.wms.reserveReceiptBarcodes(userId, receiptId, input);
  }

  @Post('v1/containers')
  @WmsAccess('write')
  createContainer(@CurrentUser('userId') userId: string, @Body() input: CreateContainerDto) {
    return this.wms.createContainer(userId, input);
  }

  @Post('v1/moves')
  @WmsAccess('write')
  moveInventory(@CurrentUser('userId') userId: string, @Body() input: MoveInventoryDto) {
    return this.wms.moveInventory(userId, input);
  }

  @Post('v1/labeling/print')
  @WmsAccess('read')
  async printLabelForScan(
    @CurrentUser('userId') userId: string,
    @Body() body: PrintLabelForScanDto,
  ) {
    const { buffer } = await this.labeling.printLabelForScan(userId, body.scan, body.receiptId);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: 'inline; filename="wms-label.pdf"',
    });
  }

  @Get('v1/labeling/next-reserved-unit')
  @WmsAccess('read')
  nextReservedUnit(
    @CurrentUser('userId') userId: string,
    @Query('itemId') itemId: string,
    @Query('receiptId') receiptId?: string,
  ) {
    const iid = itemId?.trim();
    if (!iid) {
      throw new BadRequestException('itemId is required');
    }
    return this.wms.getNextReservedUnitForLabeling(userId, iid, receiptId);
  }

  @Get('v1/barcodes/:barcode')
  @WmsAccess('read')
  lookupBarcode(@CurrentUser('userId') userId: string, @Param('barcode') barcode: string) {
    return this.wms.lookupBarcode(userId, barcode);
  }

  @Get('v1/units/:unitId/label')
  @WmsAccess('read')
  async unitLabelPdf(@CurrentUser('userId') userId: string, @Param('unitId') unitId: string) {
    const buffer = await this.wms.getUnitLabelPdf(userId, unitId);
    const safeId = unitId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    return new StreamableFile(buffer, {
      type: 'application/pdf',
      disposition: `inline; filename="unit-${safeId}.pdf"`,
    });
  }

  @Get('v1/events')
  @WmsAccess('read')
  listEvents(@CurrentUser('userId') userId: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.wms.listEvents(userId, Number.isFinite(parsedLimit) ? parsedLimit : undefined);
  }

  @Post('v1/analytics/imports/transfer-orders')
  @WmsAccess('write')
  importTransferOrders(@CurrentUser('userId') userId: string, @Body() input: ImportTransferOrdersDto) {
    return this.analytics.importTransferOrders(userId, input);
  }

  @Get('v1/analytics/imports')
  @WmsAccess('read')
  listAnalyticsImports(@CurrentUser('userId') userId: string) {
    return this.analytics.listImports(userId);
  }

  @Get('v1/analytics/transfers/summary')
  @WmsAccess('read')
  transferSummary(@CurrentUser('userId') userId: string, @Query() query: Record<string, string | undefined>) {
    return this.analytics.getTransferSummary(userId, this.transferFilters(query));
  }

  @Get('v1/analytics/transfers/by-op')
  @WmsAccess('read')
  transfersByOp(@CurrentUser('userId') userId: string, @Query() query: Record<string, string | undefined>) {
    return this.analytics.getTransfersByOp(userId, this.transferFilters(query));
  }

  @Get('v1/analytics/transfers/tourists')
  @WmsAccess('read')
  tourists(@CurrentUser('userId') userId: string, @Query() query: Record<string, string | undefined>) {
    return this.analytics.getTourists(userId, this.transferFilters(query));
  }

  @Get('v1/analytics/transfers/replenishment-risks')
  @WmsAccess('read')
  replenishmentRisks(@CurrentUser('userId') userId: string, @Query() query: Record<string, string | undefined>) {
    return this.analytics.getReplenishmentRisks(userId, this.transferFilters(query));
  }

  private transferFilters(query: Record<string, string | undefined>): WmsBiTransferFilters {
    const kind = query.kind?.trim() as WmsBiTransferOrderKind | undefined;
    return {
      from: query.from?.trim() ? `${query.from.trim()}T00:00:00.000Z` : undefined,
      to: query.to?.trim() ? `${query.to.trim()}T23:59:59.999Z` : undefined,
      receiverWarehouse: query.receiverWarehouse?.trim() || undefined,
      senderWarehouse: query.senderWarehouse?.trim() || undefined,
      item: query.item?.trim() || undefined,
      batchId: query.batchId?.trim() || undefined,
      kind: kind === 'REPLENISHMENT' || kind === 'TOURIST' ? kind : undefined,
    };
  }
}
