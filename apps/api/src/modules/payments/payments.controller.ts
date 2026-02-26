import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('create')
  async create(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.createForSubscription({
      userId,
      subscriptionId: dto.subscriptionId,
      amount: dto.amount,
      targetPlan: dto.targetPlan,
      returnUrl: dto.returnUrl,
      failUrl: dto.failUrl,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  @Get(':id/status')
  async getStatus(
    @CurrentUser('userId') userId: string,
    @Param('id') paymentId: string,
  ) {
    const result = await this.paymentsService.getStatus(paymentId, userId);
    if (!result) {
      return { payment: null };
    }
    return { payment: result };
  }
}
