import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../auth/current-user.decorator';
import { WmsAccess } from '../auth/wms-access.metadata';
import { WmsScopeGuard } from '../auth/wms-scope.guard';
import {
  AssignPutawayTaskDto,
  CreateContainerDto,
  CreateInvoiceReceiptDto,
  CreateItemDto,
  CreateLocationDto,
  CreatePutawayTaskDto,
  CreateReceiptDto,
  CreateWarehouseDto,
  MoveInventoryDto,
  NestContainersDto,
  ReserveReceiptBarcodesDto,
  UnnestContainerDto,
  UpdateItemAgxDto,
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

  @Get('v1/locations/contents')
  @WmsAccess('read')
  getLocationContents(
    @CurrentUser('userId') userId: string,
    @Query('locationId') locationId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('code') code?: string,
  ) {
    return this.wms.getLocationContents(userId, { locationId, warehouseId, code });
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
  updateItemAgx(@CurrentUser('userId') userId: string, @Param('itemId') itemId: string, @Body() input: UpdateItemAgxDto) {
    return this.wms.updateItemAgx(userId, itemId, input);
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

  @Post('v1/receipts/invoice')
  @WmsAccess('write')
  createInvoiceReceipt(@CurrentUser('userId') userId: string, @Body() input: CreateInvoiceReceiptDto) {
    return this.wms.createInvoiceReceipt(userId, input);
  }

  @Post('v1/receipts')
  @WmsAccess('write')
  createReceipt(@CurrentUser('userId') userId: string, @Body() input: CreateReceiptDto) {
    return this.wms.createReceipt(userId, input);
  }

  @Post('v1/receipts/:receiptId/accept')
  @WmsAccess('write')
  acceptReceipt(@CurrentUser('userId') userId: string, @Param('receiptId') receiptId: string) {
    return this.wms.acceptReceipt(userId, receiptId);
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

  @Post('v1/containers/nest')
  @WmsAccess('write')
  nestContainers(@CurrentUser('userId') userId: string, @Body() input: NestContainersDto) {
    return this.wms.nestContainers(userId, input);
  }

  @Post('v1/containers/unnest')
  @WmsAccess('write')
  unnestContainer(@CurrentUser('userId') userId: string, @Body() input: UnnestContainerDto) {
    return this.wms.unnestChildContainer(userId, input);
  }

  @Get('v1/tasks')
  @WmsAccess('read')
  listTasks(@CurrentUser('userId') userId: string, @Query('warehouseId') warehouseId?: string) {
    return this.wms.listTasks(userId, warehouseId);
  }

  @Get('v1/tasks/:taskId')
  @WmsAccess('read')
  getTask(@CurrentUser('userId') userId: string, @Param('taskId') taskId: string) {
    return this.wms.getTask(userId, taskId);
  }

  @Post('v1/tasks/putaway')
  @WmsAccess('write')
  createPutawayTask(@CurrentUser('userId') userId: string, @Body() input: CreatePutawayTaskDto) {
    return this.wms.createPutawayTask(userId, input);
  }

  @Post('v1/tasks/:taskId/assign')
  @WmsAccess('write')
  assignPutawayTask(
    @CurrentUser('userId') userId: string,
    @Param('taskId') taskId: string,
    @Body() input: AssignPutawayTaskDto,
  ) {
    return this.wms.assignPutawayTask(userId, taskId, input);
  }

  @Post('v1/tasks/:taskId/start')
  @WmsAccess('write')
  startPutawayTask(@CurrentUser('userId') userId: string, @Param('taskId') taskId: string) {
    return this.wms.startPutawayTask(userId, taskId, userId);
  }

  @Post('v1/tasks/:taskId/complete')
  @WmsAccess('write')
  completePutawayTask(@CurrentUser('userId') userId: string, @Param('taskId') taskId: string) {
    return this.wms.completePutawayTask(userId, taskId, userId);
  }

  @Get('v1/containers/contents')
  @WmsAccess('read')
  getContainerContents(
    @CurrentUser('userId') userId: string,
    @Query('containerId') containerId?: string,
    @Query('barcode') barcode?: string,
  ) {
    return this.wms.getContainerContents(userId, { containerId, barcode });
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
