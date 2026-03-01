import { Controller, Get, Post, Patch, Query, Param, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateManualOrderDto } from './dto/create-manual-order.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  async findAll(@CurrentUser('userId') userId: string) {
    return this.ordersService.findAll(userId);
  }

  /** Создание ручного заказа (MANUAL) */
  @Post()
  async createManual(@CurrentUser('userId') userId: string, @Body() dto: CreateManualOrderDto) {
    return this.ordersService.createManualOrder(userId, dto);
  }

  /** Синхронизация заказов с маркетплейсов в БД (с идемпотентностью) */
  @Post('sync')
  async sync(@CurrentUser('userId') userId: string, @Query('since') since?: string) {
    const sinceDate = since ? new Date(since) : undefined;
    return this.ordersService.syncFromMarketplaces(userId, sinceDate);
  }

  /** Отладка: сырые заказы с WB (без сохранения в БД) */
  @Get('wb-raw')
  async getWbRaw(@CurrentUser('userId') userId: string) {
    return this.ordersService.getRawOrdersFromWb(userId);
  }

  /** Отладка: проверить статус заказа на стороне WB (GET /api/orders/wb-status?orderId=4645532575) */
  @Get('wb-status')
  async getWbStatus(@CurrentUser('userId') userId: string, @Query('orderId') orderId: string) {
    if (!orderId?.trim()) {
      throw new BadRequestException('Укажите orderId, например ?orderId=4645532575');
    }
    return this.ordersService.getWbOrderStatusDebug(userId, orderId.trim());
  }

  /** Получить стикер заказа WB (PNG base64). Для WB при статусе «На сборке» в ЛК. */
  @Get(':id/wb-sticker')
  async getWbSticker(@CurrentUser('userId') userId: string, @Param('id') orderId: string) {
    return this.ordersService.getWbStickerImage(userId, orderId);
  }

  /** Повторная отправка статуса «На сборке» на WB (если не дошло при первой смене) */
  @Post(':id/retry-wb-push')
  async retryWbPush(@CurrentUser('userId') userId: string, @Param('id') orderId: string) {
    return this.ordersService.retryPushOrderStatus(userId, orderId);
  }

  /** Повторное резервирование остатка для заказа (если не было при создании). Списывает остаток и отправляет на WB/Ozon. */
  @Post('retry-stock-reserve')
  async retryStockReserve(@CurrentUser('userId') userId: string, @Body('orderId') orderId?: string, @Body('externalId') externalId?: string) {
    const id = orderId ?? externalId;
    if (!id?.trim()) throw new BadRequestException('Укажите orderId или externalId (например 4686579129)');
    return this.ordersService.retryStockReserve(userId, id.trim());
  }

  /** Обновление статуса заказа (NEW → IN_PROGRESS после истечения холда 30 мин) */
  @Patch(':id/status')
  async updateStatus(
    @CurrentUser('userId') userId: string,
    @Param('id') orderId: string,
    @Body('status') status: string,
  ) {
    const s = status?.toUpperCase();
    if (!s || !Object.values(OrderStatus).includes(s as OrderStatus)) {
      throw new BadRequestException('Неверный статус');
    }
    return this.ordersService.updateStatus(userId, orderId, s as OrderStatus);
  }
}
