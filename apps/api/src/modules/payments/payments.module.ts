import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsWebhookController } from './payments-webhook.controller';
import { PaymentsWebhookGuard } from './payments-webhook.guard';
import { PaymentsService } from './payments.service';
import { VtbPaymentService } from './vtb-payment.service';

@Module({
  controllers: [PaymentsController, PaymentsWebhookController],
  providers: [PaymentsService, VtbPaymentService, PaymentsWebhookGuard],
  exports: [PaymentsService],
})
export class PaymentsModule {}
