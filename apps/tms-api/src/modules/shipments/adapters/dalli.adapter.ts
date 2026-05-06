import { Logger } from '@nestjs/common';
import type {
  CarrierDescriptor,
  CarrierQuote,
  CreateShipmentRequestInput,
  InternalCarrierCredentials,
  ShipmentRecord,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';
import type { CarrierAdapter, CarrierBookInput, CarrierQuoteContext, CarrierShipmentRefreshInput } from './base-carrier.adapter';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function extractAttr(tag: string, attr: string): string | null {
  const rx = new RegExp(`${attr}\\s*=\\s*["']([^"']+)["']`, 'i');
  return rx.exec(tag)?.[1]?.trim() ?? null;
}

function parseFloatSafe(value: string | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value.replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

type DalliPriceRow = {
  serviceCode: string;
  typedelivery: string;
  priceRub: number;
  etaDays: number;
  message: string | null;
};

export class DalliAdapter implements CarrierAdapter {
  private readonly logger = new Logger(DalliAdapter.name);

  readonly descriptor: CarrierDescriptor = {
    id: 'dalli-service',
    code: 'DALLI',
    name: 'Dalli Service',
    modes: ['ROAD', 'COURIER', 'PICKUP'],
    supportedFlags: ['EXPRESS', 'CONSOLIDATED'],
    supportsTracking: true,
    supportsBooking: true,
    requiresCredentials: true,
  };

  private quoteTimeoutMs(): number {
    const raw = Number.parseInt(process.env.TMS_CARRIER_QUOTE_TIMEOUT_MS ?? '2500', 10);
    return Number.isFinite(raw) ? Math.max(500, raw) : 2500;
  }

  private endpointBase(): string {
    return (process.env.DALLI_API_BASE ?? 'https://api.dalli-service.com/v1').replace(/\/+$/, '');
  }

  private partnerCode(): string {
    return (process.env.DALLI_PARTNER_CODE ?? 'DS').trim() || 'DS';
  }

  private async postXml(xml: string, requestId?: string | null, timeoutMs?: number): Promise<string | null> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs ?? this.quoteTimeoutMs());
    try {
      const res = await fetch(`${this.endpointBase()}/`, {
        method: 'POST',
        headers: {
          Accept: 'application/xml, text/xml;q=0.9, */*;q=0.8',
          'Content-Type': 'application/xml; charset=utf-8',
          ...(requestId ? { 'x-request-id': requestId } : {}),
        },
        body: xml,
        cache: 'no-store',
        signal: ctl.signal,
      }).catch(() => null);
      if (!res?.ok) {
        this.logger.warn(`Dalli HTTP failed: status=${res?.status ?? 'n/a'}`);
        return null;
      }
      return await res.text().catch(() => null);
    } finally {
      clearTimeout(timer);
    }
  }

  private parseDeliveryCost(xml: string): DalliPriceRow[] {
    const rootError = /<deliverycost[^>]*error=['"]([^'"]+)['"][^>]*errormsg=['"]([^'"]+)['"][^>]*>/i.exec(xml);
    if (rootError) {
      this.logger.warn(`Dalli deliverycost error=${rootError[1]} msg="${rootError[2]}"`);
      return [];
    }

    const nested = [...xml.matchAll(/<price\b[^>]*\/>/gi)]
      .map((m) => m[0])
      .map((tag) => {
        const priceRub = parseFloatSafe(extractAttr(tag, 'price'));
        if (!priceRub || priceRub <= 0) return null;
        return {
          serviceCode: extractAttr(tag, 'service') ?? 'unknown',
          typedelivery: (extractAttr(tag, 'typedelivery') ?? 'KUR').toUpperCase(),
          priceRub,
          etaDays: Math.max(1, Math.round(parseFloatSafe(extractAttr(tag, 'delivery_period')) ?? 1)),
          message: extractAttr(tag, 'msg'),
        } satisfies DalliPriceRow;
      })
      .filter((row): row is DalliPriceRow => Boolean(row));
    if (nested.length > 0) return nested;

    const singleTag = /<deliverycost\b[^>]*>/i.exec(xml)?.[0];
    if (!singleTag) return [];
    const priceRub = parseFloatSafe(extractAttr(singleTag, 'price'));
    if (!priceRub || priceRub <= 0) return [];
    return [
      {
        serviceCode: extractAttr(singleTag, 'service') ?? 'unknown',
        typedelivery: (extractAttr(singleTag, 'typedelivery') ?? 'KUR').toUpperCase(),
        priceRub,
        etaDays: Math.max(1, Math.round(parseFloatSafe(extractAttr(singleTag, 'delivery_period')) ?? 1)),
        message: extractAttr(singleTag, 'msg'),
      },
    ];
  }

  private parseStatus(xml: string): { code: string | null; title: string | null } {
    const statusTag = /<status\b[^>]*>([^<]*)<\/status>/i.exec(xml);
    const wholeTag = statusTag?.[0] ?? '';
    return {
      code: statusTag?.[1]?.trim() || null,
      title: extractAttr(wholeTag, 'title'),
    };
  }

  async quote(
    input: CreateShipmentRequestInput,
    requestId: string,
    context: CarrierQuoteContext,
  ): Promise<CarrierQuote[]> {
    const credentials = await this.loadCredentials(context, requestId);
    const token = (credentials?.appKey ?? credentials?.login ?? '').trim();
    if (!token) {
      this.logger.warn(`Dalli quote skipped: missing API token; requestId=${requestId}`);
      return [];
    }
    const to = (input.draft.destinationLabel || input.snapshot.destinationLabel || '').trim();
    if (!to) return [];

    const cargo = input.snapshot.cargo;
    const weightKg = Math.max(cargo.weightGrams / 1000, 0.01);
    const lengthCm = Math.max(Math.round((cargo.lengthMm ?? 100) / 10), 1);
    const widthCm = Math.max(Math.round((cargo.widthMm ?? 100) / 10), 1);
    const heightCm = Math.max(Math.round((cargo.heightMm ?? 100) / 10), 1);
    const declared = Math.max(cargo.declaredValueRub, 1);
    const cod = Math.max(cargo.declaredValueRub, 0);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<deliverycost>
  <auth token="${escapeXml(token)}"/>
  <partner>${escapeXml(this.partnerCode())}</partner>
  <to>${escapeXml(to)}</to>
  <price>${cod.toFixed(2)}</price>
  <inshprice>${declared.toFixed(2)}</inshprice>
  <typedelivery>KUR</typedelivery>
  <output>x2</output>
  <packages>
    <package weight="${weightKg.toFixed(3)}" length="${lengthCm}" width="${widthCm}" height="${heightCm}" />
  </packages>
</deliverycost>`;
    const responseXml = await this.postXml(xml, context.requestId ?? requestId);
    if (!responseXml) return [];
    const rows = this.parseDeliveryCost(responseXml);
    const serviceFlags = input.draft.serviceFlags.filter((flag) => this.descriptor.supportedFlags.includes(flag));
    return rows.map((row) => ({
      id: `${requestId}:${this.descriptor.id}:s${row.serviceCode}:${row.typedelivery.toLowerCase()}`,
      requestId,
      carrierId: this.descriptor.id,
      carrierName: this.descriptor.name,
      mode: row.typedelivery === 'PVZ' ? 'PICKUP' : 'COURIER',
      priceRub: row.priceRub,
      etaDays: row.etaDays,
      serviceFlags,
      notes: `${row.typedelivery === 'PVZ' ? 'ПВЗ' : 'Курьер'} · сервис ${row.serviceCode}${row.message ? ` · ${row.message}` : ''}`,
      priceDetails: {
        source: 'carrier_total',
        totalRub: row.priceRub,
        currency: 'RUB',
        comment: `Dalli deliverycost service=${row.serviceCode}`,
      },
      score: Math.round((100000 / Math.max(row.priceRub, 1)) * 100) / 100,
    }));
  }

  async book({ quote, input, context }: CarrierBookInput): Promise<{
    shipment: Omit<ShipmentRecord, 'id' | 'userId' | 'createdAt'>;
    tracking: Array<Omit<TrackingEventRecord, 'id'>>;
  }> {
    const credentials = await this.loadCredentials(context, quote.requestId);
    const token = (credentials?.appKey ?? credentials?.login ?? '').trim();
    if (!token) throw new Error('Dalli booking failed: missing API token');

    const serviceCode = /:s([^:]+):/i.exec(quote.id)?.[1] ?? '1';
    const orderNumber = (input.snapshot.coreOrderNumber || quote.requestId).slice(0, 50);
    const receiverName = input.snapshot.contacts?.recipient?.name?.trim() || 'Получатель';
    const receiverPhone = (input.snapshot.contacts?.recipient?.phone ?? '').replace(/\D+/g, '') || '79999999999';
    const toAddress = (input.draft.destinationLabel || input.snapshot.destinationLabel || '').trim();
    const date = input.draft.pickupDate?.trim() || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const timeMin = input.draft.pickupTimeStart?.trim() || '10:00';
    const timeMax = input.draft.pickupTimeEnd?.trim() || '18:00';
    const cargoTitle = (input.snapshot.itemSummary[0]?.title || 'Груз').slice(0, 120);
    const declared = Math.max(input.snapshot.cargo.declaredValueRub, 1);

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<basketcreate>
  <autosend>T</autosend>
  <auth token="${escapeXml(token)}"/>
  <order number="${escapeXml(orderNumber)}">
    <receiver>
      <address>${escapeXml(toAddress)}</address>
      <person>${escapeXml(receiverName)}</person>
      <phone>${escapeXml(receiverPhone)}</phone>
      <date>${escapeXml(date)}</date>
      <time_min>${escapeXml(timeMin)}</time_min>
      <time_max>${escapeXml(timeMax)}</time_max>
    </receiver>
    <service>${escapeXml(serviceCode)}</service>
    <quantity>${Math.max(1, input.snapshot.cargo.places || 1)}</quantity>
    <paytype>NO</paytype>
    <priced>0</priced>
    <price>${declared.toFixed(2)}</price>
    <inshprice>${declared.toFixed(2)}</inshprice>
    <items>
      <item quantity="1" weight="0" retprice="${declared.toFixed(2)}" barcode="${escapeXml(orderNumber)}" article="">${escapeXml(cargoTitle)}</item>
    </items>
  </order>
</basketcreate>`;
    const responseXml = await this.postXml(xml, context.requestId ?? quote.requestId, Math.max(this.quoteTimeoutMs(), 5000));
    if (!responseXml) throw new Error('Dalli booking failed: empty response');
    const error = /<error\b[^>]*errorMessage=['"]([^'"]+)['"][^>]*>/i.exec(responseXml)?.[1];
    if (error) throw new Error(`Dalli booking failed: ${error}`);
    const barcode = /<success\b[^>]*barcode=['"]([^'"]+)['"][^>]*\/?>/i.exec(responseXml)?.[1]?.trim();
    const trackingNumber = barcode || `DALLI-${Date.now().toString().slice(-8)}`;
    return {
      shipment: {
        requestId: quote.requestId,
        carrierId: quote.carrierId,
        carrierName: quote.carrierName,
        trackingNumber,
        carrierOrderReference: orderNumber,
        carrierOrderNumber: barcode || undefined,
        status: 'CONFIRMED',
        priceRub: quote.priceRub,
        etaDays: quote.etaDays,
      },
      tracking: [
        {
          shipmentId: '',
          status: 'CONFIRMED',
          description: `Заявка отправлена в Dalli (${orderNumber})`,
          occurredAt: new Date().toISOString(),
        },
      ],
    };
  }

  async refreshShipment({ shipment, context }: CarrierShipmentRefreshInput): Promise<{
    shipmentPatch: Partial<Pick<ShipmentRecord, 'trackingNumber' | 'carrierOrderNumber' | 'carrierOrderReference' | 'status'>>;
    tracking?: Array<Omit<TrackingEventRecord, 'id'>>;
  }> {
    const credentials = await this.loadCredentials(context, shipment.requestId);
    const token = (credentials?.appKey ?? credentials?.login ?? '').trim();
    if (!token) throw new Error('Dalli refresh failed: missing API token');
    const orderNo = shipment.carrierOrderReference || shipment.carrierOrderNumber || shipment.trackingNumber;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<statusreq>
  <auth token="${escapeXml(token)}"></auth>
  <orderno>${escapeXml(orderNo)}</orderno>
</statusreq>`;
    const responseXml = await this.postXml(xml, context.requestId ?? shipment.requestId, Math.max(this.quoteTimeoutMs(), 5000));
    if (!responseXml) throw new Error('Dalli refresh failed: empty response');
    const parsed = this.parseStatus(responseXml);
    const normalizedStatus = parsed.code?.toUpperCase() === 'COMPLETE'
      ? 'DELIVERED'
      : parsed.code?.toUpperCase() === 'DELIVERY'
        ? 'OUT_FOR_DELIVERY'
        : parsed.code?.toUpperCase() === 'NEW' || parsed.code?.toUpperCase() === 'ACCEPTED'
          ? 'CONFIRMED'
          : parsed.code?.toUpperCase() === 'CANCELED' || parsed.code?.toUpperCase() === 'RETURNED'
            ? 'DELETED_EXTERNAL'
            : 'IN_TRANSIT';
    return {
      shipmentPatch: { status: normalizedStatus },
      tracking: [
        {
          shipmentId: '',
          status: normalizedStatus,
          description: `Dalli: ${parsed.title || parsed.code || 'Статус обновлен'}`,
          occurredAt: new Date().toISOString(),
        },
      ],
    };
  }

  private async loadCredentials(
    context: CarrierQuoteContext,
    requestId: string,
  ): Promise<InternalCarrierCredentials | null> {
    if (!context.authToken) return null;
    const coreBase = (process.env.CORE_API_URL ?? 'http://localhost:4000').replace(/\/api\/?$/, '');
    const internalKey = process.env.TMS_INTERNAL_KEY?.trim();
    if (!internalKey) return null;
    const res = await fetch(`${coreBase}/api/tms/carrier-connections/internal/DALLI/default?serviceType=EXPRESS`, {
      headers: {
        Authorization: `Bearer ${context.authToken}`,
        'x-tms-internal-key': internalKey,
        ...(context.requestId || requestId ? { 'x-request-id': (context.requestId ?? requestId) as string } : {}),
      },
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) return null;
    return (await res.json()) as InternalCarrierCredentials;
  }
}
