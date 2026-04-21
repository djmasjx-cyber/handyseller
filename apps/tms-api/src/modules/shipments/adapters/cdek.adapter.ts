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
  CarrierShipmentRefreshInput,
} from './base-carrier.adapter';

type CdekTariff = {
  tariff_code?: number;
  tariff_name?: string;
  /** 1 дверь-дверь, 2 дверь-склад, 3 склад-дверь, 4 склад-склад (см. документацию CDEK calculator). */
  delivery_mode?: number;
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
  related_entities?: Array<{
    uuid?: string;
    type?: string;
    url?: string;
    create_time?: string;
  }>;
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
    request_uuid?: string;
    errors?: Array<{ code?: string; message?: string }>;
  }>;
};

type CdekPrintJobResult =
  | { kind: 'ok'; uuid: string }
  | { kind: 'retry'; reason: string }
  | { kind: 'fatal'; reason: string };

type CdekPrintStatusResult =
  | { kind: 'ready' }
  | { kind: 'pending'; state: string }
  | { kind: 'fatal'; reason: string };

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

function cdekPrintErrorMessage(response: CdekPrintResponse | null): string | null {
  const messages = (response?.requests ?? [])
    .flatMap((req) => req.errors ?? [])
    .map((e) => e.message?.trim())
    .filter((x): x is string => Boolean(x));
  if (!messages.length) return null;
  return messages.join('; ');
}

/** Состояния заявки в ответе CDEK v2 (см. apidoc.cdek.ru, раздел «Заказы»). */
function cdekRequestStates(response: CdekOrderResponse | null): string[] {
  return (response?.requests ?? [])
    .map((r) => (typeof r.state === 'string' ? r.state.trim() : ''))
    .filter(Boolean);
}

/** Известные «плохие» состояния заявки (кроме INVALID — оно обрабатывается отдельно). */
function hasCdekHardFailureRequestState(response: CdekOrderResponse | null): boolean {
  const bad = new Set(['FAILED', 'REJECTED', 'CANCELLED', 'ERROR']);
  return cdekRequestStates(response).some((s) => bad.has(s.toUpperCase()));
}

function normalizeCdekOrderResponse(payload: CdekOrderLookupResponse | null): CdekOrderResponse | null {
  if (!payload) return null;
  if (Array.isArray(payload)) return payload[0] ?? null;
  return payload;
}

function parseCdekDateTime(value?: string): number {
  if (!value) return 0;
  const normalized = value.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const ts = Date.parse(normalized);
  return Number.isFinite(ts) ? ts : 0;
}

function parseCdekPrintMarker(content: string): { kind: 'orders' | 'barcodes'; uuid: string } | null {
  const m = /^cdek-print:(orders|barcodes):([0-9a-f-]{8,})$/i.exec(content.trim());
  if (!m) return null;
  const kind = m[1] === 'barcodes' ? 'barcodes' : 'orders';
  return { kind, uuid: m[2] };
}

function buildCdekPdfMarker(type: 'waybill' | 'label', orderUuid: string, pdf: Buffer): string {
  return `cdek-pdf:${type}:${orderUuid}:${pdf.toString('base64')}`;
}

function parseCdekPdfMarker(content: string): { type: 'waybill' | 'label'; orderUuid: string; pdf: Buffer } | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith('cdek-pdf:')) return null;
  const parts = trimmed.split(':');
  if (parts.length < 4) return null;
  const typeRaw = parts[1];
  const orderUuid = parts[2] ?? '';
  const base64 = parts.slice(3).join(':');
  const type = typeRaw === 'label' ? 'label' : typeRaw === 'waybill' ? 'waybill' : null;
  if (!type || !orderUuid || !base64) return null;
  try {
    const pdf = Buffer.from(base64, 'base64');
    if (!isLikelyPdf(pdf)) return null;
    return { type, orderUuid, pdf };
  } catch {
    return null;
  }
}

function buildCdekDocumentMarker(type: 'waybill' | 'label', orderUuid: string): string {
  return `cdek-doc:${type}:${orderUuid}`;
}

function parseCdekDocumentMarker(content: string): { type: 'waybill' | 'label'; orderUuid: string } | null {
  const m = /^cdek-doc:(waybill|label):([0-9a-f-]{8,})$/i.exec(content.trim());
  if (!m) return null;
  return { type: m[1] === 'label' ? 'label' : 'waybill', orderUuid: m[2] };
}

function isCdekRequestFatalState(state: string | undefined): boolean {
  const s = (state ?? '').trim().toUpperCase();
  return s === 'INVALID' || s === 'FAILED' || s === 'REJECTED' || s === 'ERROR' || s === 'CANCELLED';
}

function isLikelyPdf(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 16) return false;
  return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

/** Только дверь-дверь: у нас нет кодов ПВЗ, тарифы «до склада» дают «Не задан офис получателя». */
function isDoorToDoorTariff(t: CdekTariff): boolean {
  const dm = t.delivery_mode;
  if (dm == null || Number.isNaN(Number(dm))) return true;
  return Number(dm) === 1;
}

/**
 * Тип заказа CDEK: 1 — интернет-магазин (можно передавать товары в packages[].items),
 * 2 — доставка (без состава товаров в посылке по правилам API).
 * @see https://apidoc.cdek.ru/
 */
function getCdekOrderType(): 1 | 2 {
  const raw = process.env.CDEK_ORDER_TYPE?.trim();
  if (raw === '1') return 1;
  return 2;
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
    const orderType = getCdekOrderType();
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
      type: orderType,
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

    const tariffsDoor = tariffs.filter(isDoorToDoorTariff);
    const tariffsForQuotes = tariffsDoor.length ? tariffsDoor : tariffs;
    if (!tariffsDoor.length && tariffs.length) {
      this.logger.warn(
        `CDEK quote: no door-to-door tariffs after filter; using full list (may require ПВЗ). requestId=${requestId}`,
      );
    }

    const serviceFlags = input.draft.serviceFlags.filter((f) => this.descriptor.supportedFlags.includes(f));
    const quotes: CarrierQuote[] = [];
    for (const t of tariffsForQuotes) {
      const priceRub = asNum(t.delivery_sum);
      if (!priceRub || priceRub <= 0) continue;
      const etaMin = asNum(t.calendar_min) ?? asNum(t.period_min) ?? 1;
      const etaMax = asNum(t.calendar_max) ?? asNum(t.period_max) ?? etaMin;
      const etaDays = Math.max(1, Math.round((etaMin + etaMax) / 2));
      const code = t.tariff_code ?? Math.round(priceRub);
      const name = t.tariff_name ?? `Тариф ${code}`;
      const dm = t.delivery_mode;
      const modeLabel = dm === 1 ? 'дверь-дверь' : dm != null ? `режим ${dm}` : 'режим ?';
      quotes.push({
        id: `${requestId}:${this.descriptor.id}:${code}`,
        requestId,
        carrierId: this.descriptor.id,
        carrierName: this.descriptor.name,
        mode: this.descriptor.modes[0],
        priceRub,
        etaDays,
        serviceFlags,
        notes: `${name} · ${modeLabel} · CDEK API`,
        priceDetails: {
          source: 'carrier_total',
          totalRub: priceRub,
          currency: 'RUB',
          comment: `CDEK tariff ${code}${dm != null ? ` · delivery_mode=${dm}` : ''}`,
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
    const itemsTotalWeightGrams = packageItems.reduce((sum, it) => sum + it.weight * it.amount, 0);
    const packageWeightGrams = Math.max(
      Math.round(cargo.weightGrams || 100),
      100,
      itemsTotalWeightGrams,
    );
    const fromCode = await this.resolveCityCode(base, token, fromAddress);
    const toCode = await this.resolveCityCode(base, token, toAddress);
    if (!fromCode || !toCode) {
      throw new Error('CDEK booking failed: cannot resolve city code for origin/destination');
    }

    const orderType = getCdekOrderType();
    const packagesPayload: Record<string, unknown>[] = [
      {
        number: '1',
        comment: packageItems[0]?.name || 'Груз',
        weight: packageWeightGrams,
        length: Math.max(Math.round((cargo.lengthMm ?? 100) / 10), 1),
        width: Math.max(Math.round((cargo.widthMm ?? 100) / 10), 1),
        height: Math.max(Math.round((cargo.heightMm ?? 100) / 10), 1),
        ...(orderType === 1 ? { items: packageItems } : {}),
      },
    ];

    const payload: Record<string, unknown> = {
      type: orderType,
      number: orderNumber,
      tariff_code: tariffCode,
      comment: input.draft.notes?.slice(0, 255) || 'Создано из Handyseller TMS',
      sender: {
        name: shipperName,
        company: shipperName,
        phones: [{ number: shipperPhone }],
      },
      recipient: {
        name: recipientName,
        phones: [{ number: recipientPhone }],
      },
      from_location: { code: fromCode, address: fromAddress },
      to_location: { code: toCode, address: toAddress },
      packages: packagesPayload,
    };
    this.logger.log(
      `[cdek-booking] base=${base} type=${orderType} request send requestId=${quote.requestId} number=${orderNumber} tariff=${tariffCode} packageWeightG=${packageWeightGrams}`,
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
      `[cdek-booking] response requestId=${quote.requestId} status=${createRes?.status ?? 'n/a'} states=${JSON.stringify(
        cdekRequestStates(createData),
      )} body=${JSON.stringify(createData ?? {}).slice(0, 1200)}`,
    );
    const cdekErrorMessage = cdekResponseErrorMessage(createData);
    if (!createRes?.ok || isCdekRequestInvalid(createData)) {
      throw new Error(
        `CDEK booking failed: ${cdekErrorMessage || `HTTP ${createRes?.status ?? 'n/a'}`}`,
      );
    }
    if (hasCdekHardFailureRequestState(createData)) {
      const states = cdekRequestStates(createData).join(', ');
      throw new Error(
        `CDEK booking failed: заявка отклонена (состояния: ${states || 'n/a'}). ${cdekErrorMessage || ''}`.trim(),
      );
    }
    const acceptedUuid = createData?.entity?.uuid?.trim() || null;
    if (!acceptedUuid) {
      throw new Error('CDEK booking failed: response does not contain order uuid');
    }
    const resolved = acceptedUuid
      ? await this.fetchOrderWithRetries(base, token, acceptedUuid, quote.requestId)
      : null;
    if (isCdekRequestInvalid(resolved)) {
      const details = cdekResponseErrorMessage(resolved);
      throw new Error(`CDEK booking failed: ${details || 'request became INVALID after ACCEPTED'}`);
    }
    if (hasCdekHardFailureRequestState(resolved)) {
      const details = cdekResponseErrorMessage(resolved);
      const states = cdekRequestStates(resolved).join(', ');
      throw new Error(
        `CDEK booking failed: заявка отклонена после ACCEPTED (состояния: ${states || 'n/a'}). ${details || ''}`.trim(),
      );
    }
    const cdekNumber =
      resolved?.entity?.cdek_number?.trim() ||
      resolved?.entity?.number?.trim() ||
      createData?.entity?.cdek_number?.trim() ||
      createData?.entity?.number?.trim() ||
      '';
    if (!cdekNumber) {
      throw new Error(
        `CDEK booking failed: order accepted but CDEK number is not ready (uuid=${acceptedUuid}). Проверьте заполнение обязательных полей и повторите.`,
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
          description: `Заявка принята CDEK (${acceptedUuid}). Номер: ${cdekNumber}`,
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
    const inlinePdf = parseCdekPdfMarker(document.content ?? '');
    if (inlinePdf) {
      return {
        content: inlinePdf.pdf,
        mimeType: 'application/pdf',
        fileName: `${shipment.trackingNumber || shipment.id}-${inlinePdf.type}.pdf`,
      };
    }
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
      const order = await this.fetchOrderByUuid(base, token, stub.orderUuid);
      const relatedUuid = this.pickRelatedPrintUuid(order, endpoint);
      const printUuid = relatedUuid ?? (await this.requestPrintJobWithRetries(base, token, endpoint, stub.orderUuid));
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

  async refreshShipment({
    shipment,
    context,
  }: CarrierShipmentRefreshInput): Promise<{
    shipmentPatch: Partial<
      Pick<ShipmentRecord, 'trackingNumber' | 'carrierOrderNumber' | 'carrierOrderReference' | 'status'>
    >;
    tracking?: Array<Omit<TrackingEventRecord, 'id'>>;
    documents?: Array<{ type: 'WAYBILL' | 'LABEL' | 'INVOICE'; title: string; content: string }>;
  }> {
    const orderUuid = shipment.carrierOrderReference?.trim();
    if (!orderUuid) {
      throw new Error('CDEK refresh failed: missing carrier order uuid');
    }
    const credentials = await this.loadCredentials(context, shipment.requestId);
    if (!credentials) {
      throw new Error('CDEK refresh failed: missing credentials');
    }
    const token = await this.getAccessToken(credentials, shipment.requestId);
    if (!token) {
      throw new Error('CDEK refresh failed: auth error');
    }
    const base = (process.env.CDEK_API_BASE ?? 'https://api.cdek.ru').replace(/\/+$/, '');
    const order = await this.fetchOrderByUuid(base, token, orderUuid);
    if (!order) {
      throw new Error(`CDEK refresh failed: order not found by uuid ${orderUuid}`);
    }
    if (isCdekRequestInvalid(order)) {
      const details = cdekResponseErrorMessage(order);
      throw new Error(`CDEK refresh failed: ${details || 'request is INVALID'}`);
    }
    const cdekNumber =
      order.entity?.cdek_number?.trim() || order.entity?.number?.trim() || shipment.carrierOrderNumber?.trim() || '';
    if (!cdekNumber) {
      return {
        shipmentPatch: {
          status: 'CREATED',
          carrierOrderReference: orderUuid,
          trackingNumber: shipment.trackingNumber,
        },
      };
    }
    const prefetchedDocs = await this.prefetchDocuments(
      base,
      token,
      orderUuid,
      {
        ...shipment,
        trackingNumber: cdekNumber,
        carrierOrderNumber: cdekNumber,
        carrierOrderReference: orderUuid,
        status: 'CONFIRMED',
      },
      order,
    );
    return {
      shipmentPatch: {
        status: 'CONFIRMED',
        carrierOrderReference: orderUuid,
        trackingNumber: cdekNumber,
        carrierOrderNumber: cdekNumber,
      },
      tracking: [
        {
          shipmentId: '',
          status: 'CONFIRMED',
          description: `CDEK присвоил номер отправления: ${cdekNumber}`,
          occurredAt: new Date().toISOString(),
        },
      ],
      documents: prefetchedDocs,
    };
  }

  private async prefetchDocuments(
    base: string,
    token: string,
    orderUuid: string,
    shipment: ShipmentRecord,
    order?: CdekOrderResponse | null,
  ): Promise<Array<{ type: 'WAYBILL' | 'LABEL' | 'INVOICE'; title: string; content: string }>> {
    try {
      const existingOrder = order ?? (await this.fetchOrderByUuid(base, token, orderUuid));
      const relatedWaybillUuid = this.pickRelatedPrintUuid(existingOrder, 'orders');
      const relatedBarcodeUuid = this.pickRelatedPrintUuid(existingOrder, 'barcodes');
      const [waybillUuid, labelUuid] = await Promise.all([
        relatedWaybillUuid ?? this.requestPrintJobWithRetries(base, token, 'orders', orderUuid),
        relatedBarcodeUuid ?? this.requestPrintJobWithRetries(base, token, 'barcodes', orderUuid),
      ]);
      if (!waybillUuid || !labelUuid) {
        return this.createDocumentStubs(orderUuid);
      }
      const [waybillPdf, labelPdf] = await Promise.all([
        this.downloadPrintPdf(base, token, 'orders', waybillUuid, shipment),
        this.downloadPrintPdf(base, token, 'barcodes', labelUuid, shipment),
      ]);
      return [
        {
          type: 'WAYBILL',
          title: 'Транспортная накладная (CDEK)',
          content: buildCdekPdfMarker('waybill', orderUuid, waybillPdf.content),
        },
        {
          type: 'LABEL',
          title: 'Отгрузочный ярлык (CDEK)',
          content: buildCdekPdfMarker('label', orderUuid, labelPdf.content),
        },
      ];
    } catch (error) {
      this.logger.warn(
        `[cdek-doc] prefetch failed orderUuid=${orderUuid} reason=${error instanceof Error ? error.message : 'n/a'}`,
      );
      return this.createDocumentStubs(orderUuid);
    }
  }

  private pickRelatedPrintUuid(order: CdekOrderResponse | null, endpoint: 'orders' | 'barcodes'): string | null {
    const wantedType = endpoint === 'orders' ? 'waybill' : 'barcode';
    const list = (order?.related_entities ?? [])
      .filter((item) => (item.type ?? '').toLowerCase() === wantedType && typeof item.uuid === 'string' && item.uuid)
      .sort((a, b) => parseCdekDateTime(b.create_time) - parseCdekDateTime(a.create_time));
    const uuid = list[0]?.uuid?.trim();
    return uuid || null;
  }

  private async downloadPrintPdf(
    base: string,
    token: string,
    endpoint: 'orders' | 'barcodes',
    printUuid: string,
    shipment: ShipmentRecord,
  ): Promise<{ content: Buffer; mimeType: string; fileName: string }> {
    let res: Response | null = null;
    for (let i = 0; i < 16; i += 1) {
      res = await fetch(`${base}/v2/print/${endpoint}/${printUuid}.pdf`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/pdf',
        },
        cache: 'no-store',
      }).catch(() => null);
      if (res?.ok) {
        const arrayBuffer = await res.arrayBuffer();
        const content = Buffer.from(arrayBuffer);
        if (isLikelyPdf(content)) {
          return {
            content,
            mimeType: 'application/pdf',
            fileName: `${shipment.trackingNumber || shipment.id}-${endpoint}.pdf`,
          };
        }
      }
      // Обычно 404/202/423 до готовности PDF, и иногда 200 с неполным контентом — поэтому не валим сразу.
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error(
      `CDEK document download failed: valid PDF not ready for uuid=${printUuid}; HTTP ${res?.status ?? 'n/a'}`,
    );
  }

  private async requestPrintJobWithRetries(
    base: string,
    token: string,
    endpoint: 'orders' | 'barcodes',
    orderUuid: string,
  ): Promise<string | null> {
    let printUuid: string | null = null;
    for (let i = 0; i < 12; i += 1) {
      const result = await this.requestPrintJob(
        base,
        token,
        endpoint === 'orders' ? '/v2/print/orders' : '/v2/print/barcodes',
        {
          orders: [{ order_uuid: orderUuid }],
          copy_count: 1,
          ...(endpoint === 'barcodes' ? { format: 'A4' } : {}),
        },
      );
      if (result.kind === 'ok') {
        printUuid = result.uuid;
        break;
      }
      if (result.kind === 'fatal') {
        throw new Error(`CDEK document download failed: ${result.reason}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    if (!printUuid) {
      this.logger.warn(`[cdek-doc] print uuid timeout endpoint=${endpoint} orderUuid=${orderUuid}`);
      return null;
    }
    for (let i = 0; i < 30; i += 1) {
      const status = await this.getPrintJobStatus(base, token, endpoint, printUuid);
      if (status.kind === 'ready') return printUuid;
      if (status.kind === 'fatal') {
        throw new Error(`CDEK document download failed: ${status.reason}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    this.logger.warn(
      `[cdek-doc] print job not ready endpoint=${endpoint} orderUuid=${orderUuid} printUuid=${printUuid}`,
    );
    return null;
  }

  private async getPrintJobStatus(
    base: string,
    token: string,
    endpoint: 'orders' | 'barcodes',
    printUuid: string,
  ): Promise<CdekPrintStatusResult> {
    const res = await fetch(`${base}/v2/print/${endpoint}/${printUuid}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      return { kind: 'pending', state: `HTTP_${res?.status ?? 'n/a'}` };
    }
    const data = (await res.json().catch(() => null)) as CdekPrintResponse | null;
    const state = (data?.requests?.[0]?.state ?? '').trim().toUpperCase();
    if (isCdekRequestFatalState(state)) {
      return {
        kind: 'fatal',
        reason: cdekPrintErrorMessage(data) || `print state=${state || 'n/a'}`,
      };
    }
    if (state === 'READY') return { kind: 'ready' };
    return { kind: 'pending', state: state || 'PENDING' };
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
    for (let i = 0; i < 12; i += 1) {
      const order = await this.fetchOrderByUuid(base, token, uuid);
      if (order?.entity?.cdek_number) return order;
      if (order?.requests?.some((r) => r.state === 'INVALID')) {
        this.logger.warn(
          `[cdek-booking] order invalid requestId=${requestId} uuid=${uuid} body=${JSON.stringify(order).slice(0, 1200)}`,
        );
        return order;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return await this.fetchOrderByUuid(base, token, uuid);
  }

  private async fetchOrderByUuid(base: string, token: string, uuid: string): Promise<CdekOrderResponse | null> {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    };
    const pathUrl = `${base}/v2/orders/${encodeURIComponent(uuid)}`;
    let res = await fetch(pathUrl, { headers, cache: 'no-store' }).catch(() => null);
    if (res?.status === 404) {
      const legacyUrl = new URL('/v2/orders', base);
      legacyUrl.searchParams.set('uuid', uuid);
      res = await fetch(legacyUrl.toString(), { headers, cache: 'no-store' }).catch(() => null);
    }
    if (!res?.ok) return null;
    const data = (await res.json().catch(() => null)) as CdekOrderLookupResponse | null;
    return normalizeCdekOrderResponse(data);
  }

  private async requestPrintJob(
    base: string,
    token: string,
    path: string,
    payload: Record<string, unknown>,
  ): Promise<CdekPrintJobResult> {
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
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as CdekPrintResponse | null;
      const reason = cdekResponseErrorMessage(body) || `HTTP ${res?.status ?? 'n/a'}`;
      // 4xx/5xx здесь часто временные для генерации формы; fatal только для явных ошибок в теле.
      if ((body?.requests ?? []).some((r) => isCdekRequestFatalState(r.state))) {
        return { kind: 'fatal', reason };
      }
      return { kind: 'retry', reason };
    }
    const data = (await res.json().catch(() => null)) as CdekPrintResponse | null;
    const fatalReq = (data?.requests ?? []).find((r) => isCdekRequestFatalState(r.state));
    if (fatalReq) {
      return {
        kind: 'fatal',
        reason: cdekResponseErrorMessage(data) || `print request state=${fatalReq.state ?? 'n/a'}`,
      };
    }
    const uuid = data?.entity?.uuid?.trim() || data?.requests?.[0]?.request_uuid?.trim();
    if (uuid) return { kind: 'ok', uuid };
    return { kind: 'retry', reason: 'print uuid is not ready yet' };
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
    const data = (await res?.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res?.ok) {
      const hint =
        typeof data.error_description === 'string'
          ? data.error_description
          : typeof data.error === 'string'
            ? data.error
            : '';
      this.logger.warn(
        `CDEK auth failed: status=${res?.status ?? 'n/a'}; requestId=${requestId}; base=${base}; detail=${hint || JSON.stringify(data).slice(0, 400)}`,
      );
      return null;
    }
    if (typeof data.access_token !== 'string') {
      this.logger.warn(
        `CDEK auth failed: no access_token in body; requestId=${requestId}; base=${base}; body=${JSON.stringify(data).slice(0, 400)}`,
      );
      return null;
    }
    return data.access_token;
  }
}
