import { Logger } from '@nestjs/common';
import type {
  CarrierDescriptor,
  CarrierQuote,
  CreateShipmentRequestInput,
  InternalCarrierCredentials,
  ShipmentRecord,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';
import type {
  CarrierAdapter,
  CarrierBookInput,
  CarrierDocumentDownloadInput,
  CarrierQuoteContext,
} from './base-carrier.adapter';

type CdekTariff = {
  tariff_code?: number;
  tariff_name?: string;
  delivery_sum?: number;
  period_min?: number;
  period_max?: number;
  calendar_min?: number;
  calendar_max?: number;
};

type CdekCity = { code?: number; city?: string };

type CdekOrderResponse = {
  entity?: {
    uuid?: string;
    cdek_number?: string;
    number?: string;
  };
  requests?: Array<{
    state?: string;
    request_uuid?: string;
    errors?: Array<{ code?: string; message?: string }>;
  }>;
};
type CdekOrderLookupResponse = CdekOrderResponse | CdekOrderResponse[];

type CdekPrintResponse = {
  entity?: {
    uuid?: string;
  };
  requests?: Array<{
    state?: string;
    errors?: Array<{ code?: string; message?: string }>;
  }>;
};

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cdekCityCandidates(label: string | null | undefined): string[] {
  if (!label) return [];
  const out: string[] = [];
  const push = (v: string) => {
    const t = v.replace(/^\s*\d{6}\s*,?\s*/u, '').replace(/\s+/g, ' ').trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };
  push(label);
  for (const part of label.split(',').map((x) => x.trim())) if (part) push(part);
  const m = label.match(/(?:г\.?|город)\s*([А-Яа-яЁёA-Za-z\- ]{2,80})/u);
  if (m?.[1]) push(m[1]);
  return out;
}

function isCdekRequestInvalid(response: CdekOrderResponse | null): boolean {
  return Boolean(response?.requests?.some((r) => r.state === 'INVALID'));
}

function cdekResponseErrorMessage(response: CdekOrderResponse | null): string | null {
  const messages = (response?.requests ?? [])
    .flatMap((req) => req.errors ?? [])
    .map((e) => e.message?.trim())
    .filter((x): x is string => Boolean(x));
  if (!messages.length) return null;
  return messages.join('; ');
}

function normalizeCdekOrderResponse(payload: CdekOrderLookupResponse | null): CdekOrderResponse | null {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] ?? null;
  return payload;
}

function parseCdekPrintMarker(content: string): { kind: 'orders' | 'barcodes'; uuid: string } | null {
  const m = /^cdek-print:(orders|barcodes):([0-9a-f-]{8,})$/i.exec(content.trim());
  if (!m) return null;
  const kind = m[1] === 'barcodes' ? 'barcodes' : 'orders';
  return { kind, uuid: m[2] };
}

function buildCdekDocumentMarker(type: 'waybill' | 'label', orderUuid: string): string {
  return `cdek-doc:${type}:${orderUuid}`;
}

function parseCdekDocumentMarker(content: string): { type: 'waybill' | 'label'; orderUuid: string } | null {
  const m = /^cdek-doc:(waybill|label):([0-9a-f-]{8,})$/i.exec(content.trim());
  if (!m) return null;
  return { type: m[1] === 'label' ? 'label' : 'waybill', orderUuid: m[2] };
}

export class CdekAdapter implements CarrierAdapter {
  private readonly logger = new Logger(CdekAdapter.name);
  readonly descriptor: CarrierDescriptor = {
    id: 'cdek',
    code: 'CDEK',
    name: 'CDEK',
    modes: ['ROAD', 'COURIER', 'PICKUP'],
    supportedFlags: ['EXPRESS', 'CONSOLIDATED'],
    supportsTracking: true,
    supportsBooking: true,
    requiresCredentials: true,
  };

  async quote(
    input: CreateShipmentRequestInput,
    requestId: string,
    context: CarrierQuoteContext,
  ): Promise<CarrierQuote[]> {
    const credentials = await this.loadCredentials(context, requestId);
    if (!credentials) return [];
    const token = await this.getAccessToken(credentials, requestId);
    if (!token) return [];

    const base = (process.env.CDEK_API_BASE ?? 'https://api.cdek.ru').replace(/\/+$/, '');
    const fromCode = await this.resolveCityCode(base, token, input.draft.originLabel || input.snapshot.originLabel);
    const toCode = await this.resolveCityCode(
      base,
      token,
      input.draft.destinationLabel || input.snapshot.destinationLabel,
    );
    if (!fromCode || !toCode) {
      this.logger.warn(
        `CDEK city resolve failed; requestId=${requestId}; fromResolved=${Boolean(fromCode)}; toResolved=${Boolean(toCode)}`,
      );
      return [];
    }
    const payload = {
      type: 2,
      currency: 1,
      from_location: { code: fromCode },
      to_location: { code: toCode },
      packages: [
        {
          weight: Math.max(Math.round(input.snapshot.cargo.weightGrams || 100), 100),
          length: Math.max(Math.round((input.snapshot.cargo.lengthMm ?? 100) / 10), 1),
          width: Math.max(Math.round((input.snapshot.cargo.widthMm ?? 100) / 10), 1),
          height: Math.max(Math.round((input.snapshot.cargo.heightMm ?? 100) / 10), 1),
        },
      ],
    };

    const res = await fetch(`${base}/v2/calculator/tarifflist`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      this.logger.warn(`CDEK calculator HTTP failed: status=${res?.status ?? 'n/a'}; requestId=${requestId}`);
      return [];
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const tariffsRaw = Array.isArray(data.tariff_codes)
      ? data.tariff_codes
      : Array.isArray(data.tariffs)
        ? data.tariffs
        : [];
    const tariffs = tariffsRaw as CdekTariff[];
    if (!tariffs.length) return [];

    const serviceFlags = input.draft.serviceFlags.filter((f) => this.descriptor.supportedFlags.includes(f));
    const quotes: CarrierQuote[] = [];
    for (const t of tariffs) {
      const priceRub = asNum(t.delivery_sum);
      if (!priceRub || priceRub <= 0) continue;
      const etaMin = asNum(t.calendar_min) ?? asNum(t.period_min) ?? 1;
      const etaMax = asNum(t.calendar_max) ?? asNum(t.period_max) ?? etaMin;
      const etaDays = Math.max(1, Math.round((etaMin + etaMax) / 2));
      const code = t.tariff_code ?? Math.round(priceRub);
      const name = t.tariff_name ?? `Тариф ${code}`;
      quotes.push({
        id: `${requestId}:${this.descriptor.id}:${code}`,
        requestId,
        carrierId: this.descriptor.id,
        carrierName: this.descriptor.name,
        mode: this.descriptor.modes[0],
        priceRub,
        etaDays,
        serviceFlags,
        notes: `${name} · CDEK API`,
        priceDetails: {
          source: 'carrier_total',
          totalRub: priceRub,
          currency: 'RUB',
          comment: `CDEK tariff ${code}`,
        },
        score: Math.round((100000 / Math.max(priceRub, 1)) * 100) / 100,
      });
    }
    return quotes.sort((a, b) => a.priceRub - b.priceRub);
  }

  private async resolveCityCode(base: string, token: string, label: string | null | undefined): Promise<number | null> {
    const candidates = cdekCityCandidates(label);
    for (const city of candidates) {
      const url = new URL('/v2/location/cities', base);
      url.searchParams.set('country_codes', 'RU');
      url.searchParams.set('city', city);
      url.searchParams.set('size', '1');
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        cache: 'no-store',
      }).catch(() => null);
      if (!res?.ok) continue;
      const data = (await res.json().catch(() => [])) as unknown;
      const row = Array.isArray(data) && data.length ? (data[0] as CdekCity) : null;
      if (row && typeof row.code === 'number' && Number.isFinite(row.code)) return row.code;
    }
    return null;
  }

  async book({ quote, input, context }: CarrierBookInput): Promise<{
    shipment: Omit<ShipmentRecord, 'id' | 'userId' | 'createdAt'>;
    tracking: Array<Omit<TrackingEventRecord, 'id'>>;
    documents?: Array<{ type: 'WAYBILL' | 'LABEL' | 'INVOICE'; title: string; content: string }>;
  }> {
    const credentials = await this.loadCredentials(context, quote.requestId);
    if (!credentials) {
      throw new Error('CDEK booking failed: missing credentials');
    }
    const token = await this.getAccessToken(credentials, quote.requestId);
    if (!token) {
      throw new Error('CDEK booking failed: auth error');
    }
    const base = (process.env.CDEK_API_BASE ?? 'https://api.cdek.ru').replace(/\/+$/, '');
    const tariffCode = this.extractTariffCode(quote.id);
    const orderNumber = (input.snapshot.coreOrderNumber || '').trim();
    if (!orderNumber) {
      throw new Error('CDEK booking failed: missing internal order number');
    }
    const fromAddress = (input.draft.originLabel || input.snapshot.originLabel || '').trim();
    const toAddress = (input.draft.destinationLabel || input.snapshot.destinationLabel || '').trim();
    if (!fromAddress || !toAddress) {
      throw new Error('CDEK booking failed: missing origin/destination address');
    }
    const shipperName = input.snapshot.contacts?.shipper?.name?.trim();
    const shipperPhone = input.snapshot.contacts?.shipper?.phone?.trim();
    const recipientName = input.snapshot.contacts?.recipient?.name?.trim();
    const recipientPhone = input.snapshot.contacts?.recipient?.phone?.trim();
    if (!shipperName || !shipperPhone || !recipientName || !recipientPhone) {
      throw new Error('CDEK booking failed: missing sender/recipient contacts');
    }

    const cargo = input.snapshot.cargo;
    const declaredTotal = Math.max(Math.round(cargo.declaredValueRub || 0), 0);
    const orderItems =
      input.snapshot.itemSummary
        ?.map((it, idx) => {
          const amount = Math.max(1, Math.round(Number(it.quantity) || 1));
          const totalWeight = Math.max(Math.round(Number(it.weightGrams) || 100), 1);
          const itemWeight = Math.max(Math.round(totalWeight / amount), 1);
          const name = (it.title || `Товар ${idx + 1}`).toString().slice(0, 255);
          const wareKey = (it.productId || `item-${idx + 1}`).toString().slice(0, 50);
          const itemDeclared = declaredTotal > 0 ? Math.max(Math.round(declaredTotal / Math.max(amount, 1)), 1) : 1;
          return {
            name,
            ware_key: wareKey,
            payment: { value: 0 },
            cost: itemDeclared,
            weight: itemWeight,
            amount,
          };
        })
        .filter((x) => x.amount > 0) ?? [];
    const packageItems =
      orderItems.length > 0
        ? orderItems
        : [
            {
              name: 'Груз',
              ware_key: 'fallback-item',
              payment: { value: 0 },
              cost: Math.max(declaredTotal, 1),
              weight: Math.max(Math.round(cargo.weightGrams || 100), 1),
              amount: 1,
            },
          ];
    const fromCode = await this.resolveCityCode(base, token, fromAddress);
    const toCode = await this.resolveCityCode(base, token, toAddress);
    if (!fromCode || !toCode) {
      throw new Error('CDEK booking failed: cannot resolve city code for origin/destination');
    }

    const payload: Record<string, unknown> = {
      number: orderNumber,
      tariff_code: tariffCode,
      comment: input.draft.notes?.slice(0, 255) || 'Создано из Handyseller TMS',
      sender: {
        name: shipperName,
        phones: [{ number: shipperPhone }],
      },
      recipient: {
        name: recipientName,
        phones: [{ number: recipientPhone }],
      },
      from_location: { code: fromCode, address: fromAddress },
      to_location: { code: toCode, address: toAddress },
      packages: [
        {
          number: '1',
          weight: Math.max(Math.round(cargo.weightGrams || 100), 100),
          length: Math.max(Math.round((cargo.lengthMm ?? 100) / 10), 1),
          width: Math.max(Math.round((cargo.widthMm ?? 100) / 10), 1),
          height: Math.max(Math.round((cargo.heightMm ?? 100) / 10), 1),
          items: packageItems,
        },
      ],
    };
    this.logger.log(
      `[cdek-booking] request send requestId=${quote.requestId} number=${orderNumber} tariff=${tariffCode}`,
    );
    const createRes = await fetch(`${base}/v2/orders`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }).catch(() => null);
    const createData = normalizeCdekOrderResponse(
      (await createRes?.json().catch(() => null)) as CdekOrderLookupResponse | null,
    );
    this.logger.log(
      `[cdek-booking] response requestId=${quote.requestId} status=${createRes?.status ?? 'n/a'} body=${JSON.stringify(createData ?? {}).slice(0, 1200)}`,
    );
    const cdekErrorMessage = cdekResponseErrorMessage(createData);
    if (!createRes?.ok || isCdekRequestInvalid(createData)) {
      throw new Error(
        `CDEK booking failed: ${cdekErrorMessage || `HTTP ${createRes?.status ?? 'n/a'}`}`,
      );
    }
    const acceptedUuid = createData?.entity?.uuid?.trim() || null;
    const resolved = acceptedUuid
      ? await this.fetchOrderWithRetries(base, token, acceptedUuid, quote.requestId)
      : null;
    const cdekNumber =
      resolved?.entity?.cdek_number?.trim() ||
      resolved?.entity?.number?.trim() ||
      createData?.entity?.cdek_number?.trim() ||
      createData?.entity?.number?.trim() ||
      '';
    if (!acceptedUuid || !cdekNumber) {
      throw new Error(
        `CDEK booking failed: order accepted but CDEK number is not ready (uuid=${acceptedUuid ?? 'n/a'})`,
      );
    }

    return {
      shipment: {
        requestId: quote.requestId,
        carrierId: quote.carrierId,
        carrierName: quote.carrierName,
        trackingNumber: cdekNumber,
        carrierOrderNumber: cdekNumber,
        carrierOrderReference: acceptedUuid,
        status: 'CONFIRMED',
        priceRub: quote.priceRub,
        etaDays: quote.etaDays,
      },
      tracking: [
        {
          shipmentId: '',
          status: 'CONFIRMED',
          description: acceptedUuid
            ? `Заявка принята CDEK (${acceptedUuid}). Номер: ${cdekNumber}`
            : `Заявка создана в CDEK: ${cdekNumber}`,
          occurredAt: new Date().toISOString(),
        },
      ],
      documents: this.createDocumentStubs(acceptedUuid),
    };
  }

  async downloadDocument({
    document,
    context,
    shipment,
  }: CarrierDocumentDownloadInput): Promise<{ content: Buffer; mimeType: string; fileName: string }> {
    const credentials = await this.loadCredentials(context, shipment.requestId);
    if (!credentials) {
      throw new Error('CDEK document download failed: missing credentials');
    }
    const token = await this.getAccessToken(credentials, shipment.requestId);
    if (!token) {
      throw new Error('CDEK document download failed: auth error');
    }
    const base = (process.env.CDEK_API_BASE ?? 'https://api.cdek.ru').replace(/\/+$/, '');
    const stub = parseCdekDocumentMarker(document.content ?? '');
    if (stub) {
      const endpoint = stub.type === 'waybill' ? 'orders' : 'barcodes';
      const printUuid = await this.requestPrintJobWithRetries(base, token, endpoint, stub.orderUuid);
      if (!printUuid) {
        throw new Error(`CDEK document download failed: ${endpoint} print uuid not ready`);
      }
      return this.downloadPrintPdf(base, token, endpoint, printUuid, shipment);
    }
    const marker = parseCdekPrintMarker(document.content ?? '');
    if (marker) {
      return this.downloadPrintPdf(base, token, marker.kind, marker.uuid, shipment);
    }
    return {
      content: Buffer.from(document.content ?? '', 'utf-8'),
      mimeType: 'text/plain; charset=utf-8',
      fileName: `${shipment.trackingNumber || shipment.id}-${document.type.toLowerCase()}.txt`,
    };
  }

  private async downloadPrintPdf(
    base: string,
    token: string,
    endpoint: 'orders' | 'barcodes',
    printUuid: string,
    shipment: ShipmentRecord,
  ): Promise<{ content: Buffer; mimeType: string; fileName: string }> {
    const res = await fetch(`${base}/v2/print/${endpoint}/${printUuid}.pdf`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/pdf',
      },
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      throw new Error(`CDEK document download failed: HTTP ${res?.status ?? 'n/a'}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      content: Buffer.from(arrayBuffer),
      mimeType: 'application/pdf',
      fileName: `${shipment.trackingNumber || shipment.id}-${endpoint}.pdf`,
    };
  }

  private async requestPrintJobWithRetries(
    base: string,
    token: string,
    endpoint: 'orders' | 'barcodes',
    orderUuid: string,
  ): Promise<string | null> {
    for (let i = 0; i < 4; i += 1) {
      const printUuid = await this.requestPrintJob(
        base,
        token,
        endpoint === 'orders' ? '/v2/print/orders' : '/v2/print/barcodes',
        {
          orders: [{ order_uuid: orderUuid }],
          copy_count: 1,
        },
      );
      if (printUuid) return printUuid;
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    return null;
  }

  private createDocumentStubs(
    orderUuid: string,
  ): Array<{ type: 'WAYBILL' | 'LABEL' | 'INVOICE'; title: string; content: string }> {
    return [
      {
        type: 'WAYBILL',
        title: 'Транспортная накладная (CDEK)',
        content: buildCdekDocumentMarker('waybill', orderUuid),
      },
      {
        type: 'LABEL',
        title: 'Отгрузочный ярлык (CDEK)',
        content: buildCdekDocumentMarker('label', orderUuid),
      },
    ];
  }

  private async fetchOrderWithRetries(
    base: string,
    token: string,
    uuid: string,
    requestId: string,
  ): Promise<CdekOrderResponse | null> {
    for (let i = 0; i < 8; i += 1) {
      const order = await this.fetchOrderByUuid(base, token, uuid);
      if (order?.entity?.cdek_number) return order;
      if (order?.requests?.some((r) => r.state === 'INVALID')) {
        this.logger.warn(
          `[cdek-booking] order invalid requestId=${requestId} uuid=${uuid} body=${JSON.stringify(order).slice(0, 1200)}`,
        );
        return order;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return await this.fetchOrderByUuid(base, token, uuid);
  }

  private async fetchOrderByUuid(base: string, token: string, uuid: string): Promise<CdekOrderResponse | null> {
    const url = new URL('/v2/orders', base);
    url.searchParams.set('uuid', uuid);
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) return null;
    const data = (await res.json().catch(() => null)) as CdekOrderLookupResponse | null;
    return normalizeCdekOrderResponse(data);
  }

  private async requestPrintJob(
    base: string,
    token: string,
    path: string,
    payload: Record<string, unknown>,
  ): Promise<string | null> {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) return null;
    const data = (await res.json().catch(() => null)) as CdekPrintResponse | null;
    const uuid = data?.entity?.uuid?.trim();
    return uuid || null;
  }

  private extractTariffCode(quoteId: string): number {
    const tail = quoteId.split(':').at(-1) ?? '';
    const n = Number(tail);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
    return 136;
  }

  private async loadCredentials(
    context: CarrierQuoteContext,
    requestId: string,
  ): Promise<InternalCarrierCredentials | null> {
    if (!context.authToken) return null;
    const coreBase = (process.env.CORE_API_URL ?? 'http://localhost:4000').replace(/\/api\/?$/, '');
    const internalKey = process.env.TMS_INTERNAL_KEY?.trim();
    if (!internalKey) return null;
    const res = await fetch(`${coreBase}/api/tms/carrier-connections/internal/CDEK/default?serviceType=EXPRESS`, {
      headers: {
        Authorization: `Bearer ${context.authToken}`,
        'x-tms-internal-key': internalKey,
      },
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      this.logger.warn(
        `CDEK credentials fetch failed: status=${res?.status ?? 'n/a'}; coreBase=${coreBase}; requestId=${requestId}`,
      );
      return null;
    }
    return (await res.json()) as InternalCarrierCredentials;
  }

  private async getAccessToken(
    credentials: InternalCarrierCredentials,
    requestId: string,
  ): Promise<string | null> {
    const base = (process.env.CDEK_API_BASE ?? 'https://api.cdek.ru').replace(/\/+$/, '');
    const url = new URL('/v2/oauth/token', base);
    url.searchParams.set('grant_type', 'client_credentials');
    url.searchParams.set('client_id', credentials.login);
    url.searchParams.set('client_secret', credentials.password);
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      this.logger.warn(`CDEK auth failed: status=${res?.status ?? 'n/a'}; requestId=${requestId}`);
      return null;
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return typeof data.access_token === 'string' ? data.access_token : null;
  }
}
