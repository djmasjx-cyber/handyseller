import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MarketplacesService } from '../marketplaces/marketplaces.service';
import { OrdersService } from '../orders/orders.service';
import { Role } from '@prisma/client';
import { RefundPaymentDto } from '../payments/dto/refund-payment.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class AdminController {
  constructor(
    private usersService: UsersService,
    private paymentsService: PaymentsService,
    private subscriptionsService: SubscriptionsService,
    private marketplacesService: MarketplacesService,
    private ordersService: OrdersService,
  ) {}

  @Patch('users/:userId/subscription')
  async updateUserSubscription(
    @Param('userId') userId: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : dto.expiresAt === null
        ? null
        : undefined;
    return this.subscriptionsService.updatePlan(userId, dto.plan, expiresAt);
  }

  @Get('users')
  async getUsers(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const takeNum = take ? Math.min(parseInt(take, 10), 100) : 50;
    return this.usersService.findAllForAdmin({
      skip: isNaN(skipNum) ? 0 : skipNum,
      take: isNaN(takeNum) ? 50 : takeNum,
    });
  }

  @Get('payments/stats')
  async getPaymentsStats() {
    return this.paymentsService.getStatsForAdmin();
  }

  @Get('payments/webhooks')
  async getPaymentsWebhooks(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const takeNum = take ? Math.min(parseInt(take, 10), 100) : 50;
    return this.paymentsService.findAllWebhooksForAdmin({
      skip: isNaN(skipNum) ? 0 : skipNum,
      take: isNaN(takeNum) ? 50 : takeNum,
    });
  }

  @Get('payments/:id')
  async getPaymentById(@Param('id') id: string) {
    const payment = await this.paymentsService.findByIdForAdmin(id);
    if (!payment) return { payment: null };
    return { payment };
  }

  /** Отладка: проверить WB заказ по email пользователя (например nmanoilo@ya.ru, заказ 4645532575) */
  @Get('debug-wb-order')
  async debugWbOrder(
    @Query('email') email: string,
    @Query('orderId') orderId: string,
    @Query('sync') doSync?: string,
  ) {
    if (!email?.trim() || !orderId?.trim()) {
      throw new BadRequestException('Укажите email и orderId, например ?email=nmanoilo@ya.ru&orderId=4645532575');
    }
    const user = await this.usersService.findByEmail(email.trim());
    if (!user) {
      return { error: 'Пользователь не найден', email: email.trim() };
    }
    const userId = (user as { id: string }).id;
    const wbResult = await this.marketplacesService.getWbOrderStatus(userId, orderId.trim());
    if (doSync === '1' || doSync === 'true') {
      const syncResult = await this.ordersService.syncFromMarketplaces(userId);
      return { ...wbResult, syncResult };
    }
    return wbResult;
  }

  @Get('payments')
  async getPayments(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const skipNum = skip ? parseInt(skip, 10) : 0;
    const takeNum = take ? Math.min(parseInt(take, 10), 100) : 50;
    return this.paymentsService.findAllForAdmin({
      skip: isNaN(skipNum) ? 0 : skipNum,
      take: isNaN(takeNum) ? 50 : takeNum,
    });
  }

  /** Проверить, есть ли statsToken у подключений WB (админ) */
  @Get('wb-stats-token-status')
  async getWbStatsTokenStatus() {
    const conns = await this.marketplacesService.findAllWbConnections();
    const withStatus = conns.map((c) => ({
      userId: c.userId,
      hasStatsToken: !!c.statsToken,
    }));
    return { connections: withStatus, total: withStatus.length };
  }

  /** Установить statsToken для WB по email или для всех подключений WB (админ) */
  @Patch('wb-stats-token')
  async setWbStatsToken(
    @Body('email') email?: string,
    @Body('statsToken') statsToken?: string,
  ) {
    if (!statsToken?.trim()) {
      throw new BadRequestException('Укажите statsToken');
    }
    const token = statsToken.trim();
    if (email?.trim()) {
      const user = await this.usersService.findByEmail(email.trim());
      if (!user) throw new BadRequestException('Пользователь не найден');
      const conn = await this.marketplacesService.updateStatsToken((user as { id: string }).id, 'WILDBERRIES', token);
      return { ok: true, updated: 1, userId: (user as { id: string }).id };
    }
    const conns = await this.marketplacesService.findAllWbConnections();
    let updated = 0;
    for (const c of conns) {
      await this.marketplacesService.updateStatsToken(c.userId, 'WILDBERRIES', token);
      updated++;
    }
    return { ok: true, updated };
  }

  /** Повторное резервирование остатка для заказа по externalId (для любого пользователя) */
  @Post('orders/retry-stock-reserve')
  async retryStockReserve(@Body('externalId') externalId?: string, @Body('orderId') orderId?: string) {
    const id = (orderId ?? externalId)?.trim();
    if (!id) throw new BadRequestException('Укажите externalId или orderId (например 4686579129)');
    return this.ordersService.retryStockReserveByExternalId(id);
  }

  @Post('payments/:id/refund')
  async refundPayment(
    @Param('id') paymentId: string,
    @Body() dto: RefundPaymentDto,
  ) {
    return this.paymentsService.refund(paymentId, dto.amount);
  }
}
