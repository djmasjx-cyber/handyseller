import { Body, Controller, Headers, HttpCode, Post, Query, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { ShipmentsService } from './shipments.service';

@Controller('tms/carrier-webhooks')
export class CarrierWebhooksController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Post()
  @HttpCode(202)
  async ingest(
    @Query('carrier') carrier: string,
    @Query('eventType') eventType: string,
    @Query('eventId') eventId: string,
    @Headers('x-handyseller-carrier-signature') signature?: string,
    @Body() payload?: unknown,
  ) {
    const carrierCode = (carrier ?? '').trim().toLowerCase();
    const resolvedEventType = (eventType ?? '').trim() || 'carrier.updated';
    const resolvedEventId = (eventId ?? '').trim() || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    if (!carrierCode) {
      throw new UnauthorizedException('carrier query param is required');
    }
    this.verifySignatureOrThrow(carrierCode, signature, payload);
    const result = await this.shipmentsService.ingestCarrierWebhookIdempotent({
      carrier: carrierCode,
      eventType: resolvedEventType,
      eventId: resolvedEventId,
      payload,
    });
    return {
      accepted: true,
      carrier: carrierCode,
      eventType: resolvedEventType,
      eventId: resolvedEventId,
      queued: result.queued,
    };
  }

  private verifySignatureOrThrow(carrier: string, signature: string | undefined, payload: unknown): void {
    const byCarrier = process.env[`TMS_CARRIER_WEBHOOK_SECRET_${carrier.toUpperCase()}`]?.trim() || '';
    const shared = process.env.TMS_CARRIER_WEBHOOK_SHARED_SECRET?.trim() || '';
    const secret = byCarrier || shared;
    if (!secret) {
      // If secrets are not configured yet, keep endpoint protected by explicit deny.
      throw new UnauthorizedException('Carrier webhook secret is not configured');
    }
    const raw = JSON.stringify(payload ?? {});
    const expected = createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
    const normalized = (signature ?? '').trim().replace(/^sha256=/i, '');
    if (!normalized || normalized !== expected) {
      throw new UnauthorizedException('Invalid carrier webhook signature');
    }
  }
}
