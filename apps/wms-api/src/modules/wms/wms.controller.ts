import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { WmsAccess } from '../auth/wms-access.metadata';
import { WmsScopeGuard } from '../auth/wms-scope.guard';
import {
  CreateContainerDto,
  CreateItemDto,
  CreateLocationDto,
  CreateReceiptDto,
  CreateWarehouseDto,
  MoveInventoryDto,
  ReserveReceiptBarcodesDto,
} from './wms.dto';
import { WmsService } from './wms.service';

@Controller('wms')
@UseGuards(AuthGuard('jwt'), WmsScopeGuard)
export class WmsController {
  constructor(private readonly wms: WmsService) {}

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

  @Get('v1/barcodes/:barcode')
  @WmsAccess('read')
  lookupBarcode(@CurrentUser('userId') userId: string, @Param('barcode') barcode: string) {
    return this.wms.lookupBarcode(userId, barcode);
  }

  @Get('v1/events')
  @WmsAccess('read')
  listEvents(@CurrentUser('userId') userId: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.wms.listEvents(userId, Number.isFinite(parsedLimit) ? parsedLimit : undefined);
  }
}
