import { Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { PaymentsService } from './payments.service';
import { PaymentsWebhookGuard } from './payments-webhook.guard';

/**
 * Вебхук ВТБ — без JWT, проверка подписи по VTB_WEBHOOK_SECRET (если задан).
 * URL: POST /api/payments/webhook/vtb
 */
@Controller('payments/webhook')
export class PaymentsWebhookController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('vtb')
  @UseGuards(PaymentsWebhookGuard)
  async handleVtbWebhook(@Req() req: Request, @Res() res: Response) {
    await this.paymentsService.handleVtbWebhook({
      body: req.body,
      ip: req.ip ?? req.socket?.remoteAddress,
      headers: req.headers as Record<string, string>,
    });
    res.status(200).send('OK');
  }
}
