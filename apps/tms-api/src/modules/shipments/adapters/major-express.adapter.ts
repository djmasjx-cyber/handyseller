import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CarrierDescriptor,
  CarrierQuote,
  CreateShipmentRequestInput,
  InternalCarrierCredentials,
  ShipmentDocumentRecord,
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

type MajorCity = {
  code: number;
  name: string;
  normalizedName: string;
  isShipper: boolean;
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match?.[1]?.trim() ?? null;
}

function parseLooseNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const normalized = value.replace(/\s+/g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function extractFirstNumberTag(xml: string, tags: string[]): number {
  for (const tag of tags) {
    const n = parseLooseNumber(extractTag(xml, tag));
    if (n > 0) return n;
  }
  return 0;
}

function parseMajorError(xml: string): string | null {
  const fault = extractTag(xml, 'faultstring');
  if (fault?.trim()) return fault.trim();
  const error = extractTag(xml, 'Error');
  if (error?.trim()) return error.trim();
  const message = extractTag(xml, 'Message');
  if (message?.trim()) return message.trim();
  return null;
}

function stripPostalPrefix(value: string): string {
  return value.replace(/^\s*\d{6}\s*,?\s*/u, '').trim();
}

function normalizeCityName(value: string): string {
  return stripPostalPrefix(value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .replace(/\b(г|город|область|край|республика|рц|сц|склад|заказ|order|manual)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Несколько вариантов названия для сопоставления со справочником городов Major (полный адрес часто не совпадает с Name в справочнике). */
function extractMajorCityCandidates(label: string | null | undefined): string[] {
  if (!label) return [];
  let s = label.replace(/\s+/g, ' ').trim();
  if (!s) return [];

  const out: string[] = [];
  const push = (x: string) => {
    const t = stripPostalPrefix(x).replace(/\s+/g, ' ').trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };

  if (/MANUAL/i.test(s)) {
    const before = s.split(/MANUAL/i)[0]?.replace(/[/\s,-]+$/u, '').trim();
    if (before) push(before);
  }

  if (s.includes('->')) {
    for (const part of s.split('->')) push(part);
  }

  push(s);

  for (const part of s.split(',').map((p) => p.trim())) {
    if (part) push(part);
  }

  const cityInG = /(?:г\.?|город)\s*([А-Яа-яЁё0-9\-. ]{1,80})/giu;
  let m: RegExpExecArray | null;
  while ((m = cityInG.exec(s)) != null) {
    push(m[1].trim());
  }

  const settlement =
    /(?:деревня|д\.?|посёлок|пгт\.?|село|с\.)\s*([А-Яа-яЁё0-9\-. ]{1,80})/giu;
  while ((m = settlement.exec(s)) != null) {
    push(m[1].trim());
  }

  return out;
}

export class MajorExpressAdapter implements CarrierAdapter {
  private readonly logger = new Logger(MajorExpressAdapter.name);
  readonly descriptor: CarrierDescriptor = {
    id: 'major-express',
    code: 'MAJOR_EXPRESS',
    name: 'Major Express',
    modes: ['ROAD', 'COURIER'],
    supportedFlags: ['EXPRESS', 'CONSOLIDATED'],
    supportsTracking: true,
    supportsBooking: true,
    requiresCredentials: true,
  };

  private cityCache: MajorCity[] | null = null;
  private cityCacheLoadedAt = 0;

  async quote(
    input: CreateShipmentRequestInput,
    requestId: string,
    context: CarrierQuoteContext,
  ): Promise<CarrierQuote[]> {
    const credentials = await this.loadCredentials(context);
    if (!credentials) {
      this.logger.warn(`Major quote skipped: missing credentials context; requestId=${requestId}`);
      return [];
    }

    const [shipperCity, consigneeCity] = await Promise.all([
      this.resolveCityCode(input.draft.originLabel || input.snapshot.originLabel),
      this.resolveCityCode(input.draft.destinationLabel || input.snapshot.destinationLabel),
    ]);

    if (!shipperCity || !consigneeCity) {
      this.logger.warn(
        `Major quote skipped: city resolution failed; requestId=${requestId}; origin="${String(
          input.draft.originLabel || input.snapshot.originLabel,
        )}"; destination="${String(input.draft.destinationLabel || input.snapshot.destinationLabel)}"; triedOrigin=${JSON.stringify(
          extractMajorCityCandidates(input.draft.originLabel || input.snapshot.originLabel),
        )}; triedDest=${JSON.stringify(
          extractMajorCityCandidates(input.draft.destinationLabel || input.snapshot.destinationLabel),
        )}`,
      );
      return [];
    }

    const result = await this.callCalculator(input, credentials, shipperCity.code, consigneeCity.code);
    if (!result) {
      this.logger.warn(
        `Major quote skipped: calculator returned empty; requestId=${requestId}; shipperCity=${shipperCity.code}; consigneeCity=${consigneeCity.code}`,
      );
      return [];
    }

    const serviceFlags = input.draft.serviceFlags.filter((flag) =>
      this.descriptor.supportedFlags.includes(flag),
    );

    const computedPrice = result.total > 0 ? result.total : result.tariff + result.insurance;
    const totalSource = result.total > 0 ? 'итог из ответа Major' : 'tariff + insurance';
    return [{
      id: `${requestId}:${this.descriptor.id}`,
      requestId,
      carrierId: this.descriptor.id,
      carrierName: this.descriptor.name,
      mode: this.descriptor.modes[0],
      priceRub: computedPrice,
      etaDays: result.deliveryTime,
      serviceFlags,
      notes: `${credentials.accountLabel ?? 'Клиентский договор'} · ${shipperCity.name} -> ${consigneeCity.name} · итог ${computedPrice.toFixed(2)} ₽ (${totalSource}), тариф ${result.tariff.toFixed(2)} ₽, страх. ${result.insurance.toFixed(2)} ₽`,
      priceDetails: {
        source: result.total > 0 ? 'carrier_total' : 'computed',
        totalRub: computedPrice,
        tariffRub: result.tariff,
        insuranceRub: result.insurance,
        extrasRub: Math.max(computedPrice - (result.tariff + result.insurance), 0),
        currency: 'RUB',
        comment: 'Major SOAP Calculator/Calculator1',
      },
      score: Math.round((100000 / Math.max(computedPrice, 1)) * 100) / 100,
    }];
  }

  async book({ quote, input, context }: CarrierBookInput): Promise<{
    shipment: Omit<ShipmentRecord, 'id' | 'userId' | 'createdAt'>;
    tracking: Array<Omit<TrackingEventRecord, 'id'>>;
    documents?: Array<Pick<ShipmentDocumentRecord, 'type' | 'title' | 'content'>>;
  }> {
    const credentials = await this.loadCredentials(context);
    if (!credentials) {
      throw new Error('Major booking failed: missing credentials');
    }
    const requiredErrors = this.requiredBookingFields(input);
    if (requiredErrors.length > 0) {
      throw new Error(
        `Major booking failed: заполните обязательные поля (${requiredErrors.join(', ')}) в заказе для оценки доставки`,
      );
    }
    const [shipperCity, consigneeCity] = await Promise.all([
      this.resolveCityCode(input.draft.originLabel || input.snapshot.originLabel),
      this.resolveCityCode(input.draft.destinationLabel || input.snapshot.destinationLabel),
    ]);
    if (!shipperCity || !consigneeCity) {
      throw new Error('Major booking failed: не удалось определить коды городов отправителя/получателя');
    }
    const intervalId = await this.getOrderIntervalId(credentials);
    const created = await this.createOrder({
      quote,
      input,
      credentials,
      shipperCityCode: shipperCity.code,
      consigneeCityCode: consigneeCity.code,
      orderIntervalId: intervalId,
    });
    const orderId = created.orderId;
    const waybills = created.waybillNumber ? [created.waybillNumber] : await this.getOrderWaybills(credentials, orderId);
    const waybillNumber = waybills[0]?.trim() || '';
    const trackingNumber = waybillNumber || `MAJOR-ORDER-${orderId}`;
    const docs = waybillNumber ? this.createDocumentStubs(waybillNumber) : [];

    return {
      shipment: {
        requestId: quote.requestId,
        carrierId: quote.carrierId,
        carrierName: quote.carrierName,
        trackingNumber,
        carrierOrderReference: String(orderId),
        carrierOrderNumber: waybillNumber || undefined,
        status: waybillNumber ? 'CONFIRMED' : 'CREATED',
        priceRub: quote.priceRub,
        etaDays: quote.etaDays,
      },
      tracking: [
        {
          shipmentId: '',
          status: waybillNumber ? 'CONFIRMED' : 'CREATED',
          description: waybillNumber
            ? `Major заказ создан: ${orderId}, накладная: ${waybillNumber}`
            : `Major заказ создан: ${orderId}, накладная формируется`,
          occurredAt: new Date().toISOString(),
        },
      ],
      documents: docs,
    };
  }

  async downloadDocument({
    shipment,
    document,
    context,
  }: CarrierDocumentDownloadInput): Promise<{ content: Buffer; mimeType: string; fileName: string }> {
    const content = (document.content ?? '').trim();
    const [prefix, kind, wb] = content.split(':');
    if (prefix !== 'major-doc' || !kind || !wb) {
      return {
        content: Buffer.from(document.content ?? '', 'utf-8'),
        mimeType: 'text/plain; charset=utf-8',
        fileName: `${shipment.trackingNumber || shipment.id}-${document.type.toLowerCase()}.txt`,
      };
    }
    const credentials = await this.loadCredentials(context);
    if (!credentials) {
      throw new Error('Major document download failed: missing credentials');
    }
    if (kind === 'waybill') {
      const pdf = await this.getWaybillPdf(credentials, wb);
      return {
        content: pdf,
        mimeType: 'application/pdf',
        fileName: `${wb}-major-waybill.pdf`,
      };
    }
    if (kind === 'label') {
      const pdf = await this.getStickerPdf(credentials, wb);
      return {
        content: pdf,
        mimeType: 'application/pdf',
        fileName: `${wb}-major-label.pdf`,
      };
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
    documents?: Array<Pick<ShipmentDocumentRecord, 'type' | 'title' | 'content'>>;
  }> {
    const orderIdRaw = shipment.carrierOrderReference?.trim();
    const orderId = Number(orderIdRaw);
    if (!orderIdRaw || !Number.isInteger(orderId) || orderId <= 0) {
      throw new Error('Major refresh failed: missing order id');
    }
    const credentials = await this.loadCredentials(context);
    if (!credentials) {
      throw new Error('Major refresh failed: missing credentials');
    }
    const waybills = await this.getOrderWaybills(credentials, orderId);
    const waybillNumber = waybills[0]?.trim() || shipment.carrierOrderNumber?.trim() || '';
    const orderStatusCode = await this.getOrderStatus(credentials, orderId);
    const status = this.mapMajorOrderStatus(orderStatusCode, waybillNumber);
    const trackingNumber = waybillNumber || shipment.trackingNumber;
    const tracking = waybillNumber
      ? await this.getWaybillHistory(credentials, waybillNumber)
      : [
          {
            shipmentId: '',
            status,
            description: `Major заказ ${orderId}: статус ${orderStatusCode}`,
            occurredAt: new Date().toISOString(),
          },
        ];

    return {
      shipmentPatch: {
        carrierOrderReference: String(orderId),
        carrierOrderNumber: waybillNumber || undefined,
        trackingNumber,
        status,
      },
      tracking,
      documents: waybillNumber ? this.createDocumentStubs(waybillNumber) : undefined,
    };
  }

  private async loadCredentials(
    context: CarrierQuoteContext,
  ): Promise<InternalCarrierCredentials | null> {
    if (!context.authToken) {
      return null;
    }

    const coreBase = (process.env.CORE_API_URL ?? 'http://localhost:4000').replace(/\/api\/?$/, '');
    const internalKey = process.env.TMS_INTERNAL_KEY?.trim();
    if (!internalKey) {
      return null;
    }

    const res = await fetch(
      `${coreBase}/api/tms/carrier-connections/internal/MAJOR_EXPRESS/default?serviceType=EXPRESS`,
      {
        headers: {
          Authorization: `Bearer ${context.authToken}`,
          'x-tms-internal-key': internalKey,
        },
        cache: 'no-store',
      },
    ).catch(() => null);

    if (!res?.ok) {
      this.logger.warn(
        `Major credentials fetch failed: status=${res?.status ?? 'n/a'}; coreBase=${coreBase}`,
      );
      return null;
    }

    return (await res.json()) as InternalCarrierCredentials;
  }

  private async getCities(): Promise<MajorCity[]> {
    const cacheAgeMs = Date.now() - this.cityCacheLoadedAt;
    if (this.cityCache && cacheAgeMs < 1000 * 60 * 60 * 12) {
      return this.cityCache;
    }

    const res = await fetch('https://ltl-ws.major-express.ru/ed.asmx/dict_Cities', {
      cache: 'no-store',
    }).catch(() => null);
    if (!res?.ok) {
      // Не валим весь расчёт: без справочника городов Major просто не даст тариф в этом запросе.
      this.logger.warn(`Major city dictionary fetch failed: status=${res?.status ?? 'n/a'}`);
      return this.cityCache ?? [];
    }
    const xml = await res.text();
    const items = [...xml.matchAll(/<EDCity>([\s\S]*?)<\/EDCity>/g)].map((match) => {
      const chunk = match[1];
      const code = Number(extractTag(chunk, 'Code') ?? 0);
      const name = extractTag(chunk, 'Name') ?? '';
      const isShipper = (extractTag(chunk, 'IsShipper') ?? '').toLowerCase() === 'true';
      return {
        code,
        name,
        normalizedName: normalizeCityName(name),
        isShipper,
      };
    });

    this.cityCache = items.filter((item) => item.code > 0 && item.name);
    this.cityCacheLoadedAt = Date.now();
    return this.cityCache;
  }

  private async resolveCityCode(label: string | null | undefined): Promise<MajorCity | null> {
    const candidates = extractMajorCityCandidates(label);
    if (candidates.length === 0) {
      return null;
    }
    const cities = await this.getCities();
    for (const candidate of candidates) {
      const normalized = normalizeCityName(candidate);
      if (!normalized) {
        continue;
      }
      const hit =
        cities.find((item) => item.normalizedName === normalized) ??
        cities.find((item) => normalized.includes(item.normalizedName) && item.normalizedName.length >= 4) ??
        cities.find((item) => item.normalizedName.includes(normalized) && normalized.length >= 4) ??
        null;
      if (hit) {
        return hit;
      }
    }
    return null;
  }

  private async callCalculator(
    input: CreateShipmentRequestInput,
    credentials: InternalCarrierCredentials,
    shipperCityCode: number,
    consigneeCityCode: number,
  ): Promise<{ tariff: number; insurance: number; total: number; deliveryTime: number } | null> {
    const cargo = input.snapshot.cargo;
    const hasDimensions =
      cargo.lengthMm != null && cargo.widthMm != null && cargo.heightMm != null && cargo.lengthMm > 0;

    const body = hasDimensions
      ? this.buildCalculator1Body(credentials, shipperCityCode, consigneeCityCode, input)
      : this.buildCalculatorBody(credentials, shipperCityCode, consigneeCityCode, input);
    const soapAction = hasDimensions
      ? '"http://ltl-ws.major-express.ru/edclients/Calculator1"'
      : '"http://ltl-ws.major-express.ru/edclients/Calculator"';

    const res = await fetch('https://ed.major-express.ru/edclients2.asmx', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.login}:${credentials.password}`).toString('base64')}`,
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: soapAction,
      },
      body,
    }).catch(() => null);

    if (!res?.ok) {
      this.logger.warn(`Major calculator HTTP failed: status=${res?.status ?? 'n/a'}; soapAction=${soapAction}`);
      return null;
    }

    const xml = await res.text();
    if (hasDimensions) {
      const resultCode = Number(extractTag(xml, 'Code') ?? 0);
      if (resultCode !== 0) {
        this.logger.warn(`Major calculator1 returned error code=${resultCode}`);
        return null;
      }
      const calc = extractTag(xml, 'CalculatorResult');
      if (!calc) {
        return null;
      }
      const tariff = extractFirstNumberTag(calc, ['Tariff']);
      const insurance = extractFirstNumberTag(calc, ['Insurance']);
      const total = extractFirstNumberTag(calc, [
        'Total',
        'TotalSum',
        'TotalCost',
        'Price',
        'Summ',
        'Cost',
      ]);
      return {
        tariff,
        insurance,
        total,
        deliveryTime: Math.max(1, Math.round(extractFirstNumberTag(calc, ['DeliveryTime', 'Days']))),
      };
    }

    const calc = extractTag(xml, 'CalculatorResult') ?? xml;
    const tariff = extractFirstNumberTag(calc, ['Tariff']);
    const insurance = extractFirstNumberTag(calc, ['Insurance']);
    const total = extractFirstNumberTag(calc, ['Total', 'TotalSum', 'TotalCost', 'Price', 'Summ', 'Cost']);
    return {
      tariff,
      insurance,
      total,
      deliveryTime: Math.max(1, Math.round(extractFirstNumberTag(calc, ['DeliveryTime', 'Days']))),
    };
  }

  private requiredBookingFields(input: CreateShipmentRequestInput): string[] {
    const shipperName = input.snapshot.contacts?.shipper?.name?.trim() || '';
    const shipperPhone = input.snapshot.contacts?.shipper?.phone?.trim() || '';
    const recipientName = input.snapshot.contacts?.recipient?.name?.trim() || '';
    const recipientPhone = input.snapshot.contacts?.recipient?.phone?.trim() || '';
    const fromAddress = (input.draft.originLabel || input.snapshot.originLabel || '').trim();
    const toAddress = (input.draft.destinationLabel || input.snapshot.destinationLabel || '').trim();
    const description = input.snapshot.itemSummary[0]?.title?.trim() || '';
    const missing: string[] = [];
    if (!shipperName) missing.push('имя/название отправителя');
    if (!shipperPhone) missing.push('телефон отправителя');
    if (!recipientName) missing.push('имя/название получателя');
    if (!recipientPhone) missing.push('телефон получателя');
    if (!fromAddress) missing.push('адрес отправителя');
    if (!toAddress) missing.push('адрес получателя');
    if (!description) missing.push('описание груза');
    return missing;
  }

  private async majorSoapRequest(credentials: InternalCarrierCredentials, action: string, body: string): Promise<string> {
    const endpoint = 'https://ed.major-express.ru/edclients2.asmx';
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.login}:${credentials.password}`).toString('base64')}`,
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: `"http://ltl-ws.major-express.ru/edclients/${action}"`,
      },
      body,
    }).catch(() => null);
    if (!res?.ok) {
      throw new Error(`Major ${action} failed: HTTP ${res?.status ?? 'n/a'}`);
    }
    const xml = await res.text();
    const err = parseMajorError(xml);
    if (err) {
      throw new Error(`Major ${action} failed: ${err}`);
    }
    return xml;
  }

  private async getOrderIntervalId(credentials: InternalCarrierCredentials): Promise<number> {
    const xml = await this.majorSoapRequest(
      credentials,
      'dict_OrderIntervals',
      `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <dict_OrderIntervals xmlns="http://ltl-ws.major-express.ru/edclients/">
      <IsOrderUrgent>false</IsOrderUrgent>
    </dict_OrderIntervals>
  </soap:Body>
</soap:Envelope>`,
    );
    const firstId = Number(extractTag(xml, 'ID') ?? 0);
    if (!Number.isInteger(firstId) || firstId <= 0) {
      throw new Error('Major booking failed: не удалось получить интервал забора');
    }
    return firstId;
  }

  private async createOrder({
    quote,
    input,
    credentials,
    shipperCityCode,
    consigneeCityCode,
    orderIntervalId,
  }: {
    quote: CarrierQuote;
    input: CreateShipmentRequestInput;
    credentials: InternalCarrierCredentials;
    shipperCityCode: number;
    consigneeCityCode: number;
    orderIntervalId: number;
  }): Promise<{ orderId: number; waybillNumber: string | null }> {
    const shipperName = input.snapshot.contacts?.shipper?.name?.trim() || '';
    const shipperPhone = input.snapshot.contacts?.shipper?.phone?.trim() || '';
    const recipientName = input.snapshot.contacts?.recipient?.name?.trim() || '';
    const recipientPhone = input.snapshot.contacts?.recipient?.phone?.trim() || '';
    const shipperAddress = (input.draft.originLabel || input.snapshot.originLabel || '').trim();
    const consigneeAddress = (input.draft.destinationLabel || input.snapshot.destinationLabel || '').trim();
    const cargo = input.snapshot.cargo;
    const description = (input.snapshot.itemSummary[0]?.title || 'Груз').trim().slice(0, 80);
    const weightKg = Math.max(cargo.weightGrams / 1000, 0.1).toFixed(3);
    const places = Math.max(Math.round(cargo.places || 1), 1);
    const declaredCost = Math.max(cargo.declaredValueRub, 1).toFixed(2);
    const lengthCm = Math.max(Math.round((cargo.lengthMm ?? 100) / 10), 1);
    const widthCm = Math.max(Math.round((cargo.widthMm ?? 100) / 10), 1);
    const heightCm = Math.max(Math.round((cargo.heightMm ?? 100) / 10), 1);
    const requestGuid = randomUUID();
    const cargoTakenDate = new Date().toISOString();

    const xml = await this.majorSoapRequest(
      credentials,
      'CreateOrder',
      `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CreateOrder xmlns="http://ltl-ws.major-express.ru/edclients/">
      <RequestID>${escapeXml(requestGuid)}</RequestID>
      <CargoTakenDate>${escapeXml(cargoTakenDate)}</CargoTakenDate>
      <OrderIntervalID>${orderIntervalId}</OrderIntervalID>
      <ClientInfo>${escapeXml(input.snapshot.coreOrderNumber || quote.requestId)}</ClientInfo>
      <Shipper>
        <Person>${escapeXml(shipperName)}</Person>
        <Phone>${escapeXml(shipperPhone)}</Phone>
        <Company>${escapeXml(shipperName)}</Company>
        <Address>${escapeXml(shipperAddress)}</Address>
        <PostIndex></PostIndex>
        <CityCode>${shipperCityCode}</CityCode>
      </Shipper>
      <Consignee>
        <Person>${escapeXml(recipientName)}</Person>
        <Phone>${escapeXml(recipientPhone)}</Phone>
        <Company>${escapeXml(recipientName)}</Company>
        <Address>${escapeXml(consigneeAddress)}</Address>
        <PostIndex></PostIndex>
        <CityCode>${consigneeCityCode}</CityCode>
      </Consignee>
      <Weight>${weightKg}</Weight>
      <Package>${places}</Package>
      <Cost>${declaredCost}</Cost>
      <Size>
        <Length>${lengthCm}</Length>
        <Width>${widthCm}</Width>
        <Height>${heightCm}</Height>
      </Size>
      <Description>${escapeXml(description)}</Description>
      <Remarks>${escapeXml(`TMS request ${quote.requestId}`)}</Remarks>
      <IsOrderUrgent>false</IsOrderUrgent>
      <CostCenter xsi:nil="true" />
      <DeliveryCondition>None</DeliveryCondition>
      <IsWBRequired>true</IsWBRequired>
      <DeliveryComment>${escapeXml(consigneeAddress.slice(0, 200))}</DeliveryComment>
      <WBNumber></WBNumber>
    </CreateOrder>
  </soap:Body>
</soap:Envelope>`,
    );
    const orderId = Number(extractTag(xml, 'CreateOrderResult') ?? 0);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      throw new Error('Major CreateOrder failed: invalid order id in response');
    }
    const waybill = extractTag(xml, 'WBNumber');
    return { orderId, waybillNumber: waybill?.trim() || null };
  }

  private async getOrderWaybills(credentials: InternalCarrierCredentials, orderId: number): Promise<string[]> {
    const xml = await this.majorSoapRequest(
      credentials,
      'OrdersWaybills',
      `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <OrdersWaybills xmlns="http://ltl-ws.major-express.ru/edclients/">
      <OrderID>${orderId}</OrderID>
    </OrdersWaybills>
  </soap:Body>
</soap:Envelope>`,
    );
    return [...xml.matchAll(/<string>([\s\S]*?)<\/string>/gi)]
      .map((m) => m[1]?.trim() || '')
      .filter(Boolean);
  }

  private async getOrderStatus(credentials: InternalCarrierCredentials, orderId: number): Promise<number> {
    const xml = await this.majorSoapRequest(
      credentials,
      'OrderStatus',
      `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <OrderStatus xmlns="http://ltl-ws.major-express.ru/edclients/">
      <OrderID>${orderId}</OrderID>
    </OrderStatus>
  </soap:Body>
</soap:Envelope>`,
    );
    const code = Number(extractTag(xml, 'OrderStatusResult') ?? 0);
    return Number.isFinite(code) ? code : 0;
  }

  private async getWaybillHistory(
    credentials: InternalCarrierCredentials,
    wbNumber: string,
  ): Promise<Array<Omit<TrackingEventRecord, 'id'>>> {
    const xml = await this.majorSoapRequest(
      credentials,
      'History',
      `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <History xmlns="http://ltl-ws.major-express.ru/edclients/">
      <WBNumber>${escapeXml(wbNumber)}</WBNumber>
    </History>
  </soap:Body>
</soap:Envelope>`,
    );
    const events = [...xml.matchAll(/<EDWBHistory>([\s\S]*?)<\/EDWBHistory>/gi)]
      .map((match) => {
        const block = match[1];
        const date = extractTag(block, 'EventDateTime') || new Date().toISOString();
        const event = extractTag(block, 'Event') || 'Статус обновлен';
        const city = extractTag(block, 'CityName') || undefined;
        const comments = extractTag(block, 'Comments') || '';
        return {
          shipmentId: '',
          status: this.mapMajorHistoryStatus(event, comments),
          description: comments ? `${event}. ${comments}` : event,
          occurredAt: date,
          location: city,
        } as Omit<TrackingEventRecord, 'id'>;
      })
      .filter((item) => item.description.trim().length > 0);
    return events.length > 0
      ? events
      : [
          {
            shipmentId: '',
            status: 'CONFIRMED',
            description: `Накладная Major: ${wbNumber}`,
            occurredAt: new Date().toISOString(),
          },
        ];
  }

  private async getWaybillPdf(credentials: InternalCarrierCredentials, wbNumber: string): Promise<Buffer> {
    const xml = await this.majorSoapRequest(
      credentials,
      'Waybill_PDF',
      `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Waybill_PDF xmlns="http://ltl-ws.major-express.ru/edclients/">
      <WBNumber>${escapeXml(wbNumber)}</WBNumber>
    </Waybill_PDF>
  </soap:Body>
</soap:Envelope>`,
    );
    const payload = (extractTag(xml, 'Waybill_PDFResult') || '').trim();
    if (!payload) {
      throw new Error(`Major Waybill_PDF failed: empty response for WB ${wbNumber}`);
    }
    return Buffer.from(payload, 'base64');
  }

  private async getStickerPdf(credentials: InternalCarrierCredentials, wbNumber: string): Promise<Buffer> {
    const xml = await this.majorSoapRequest(
      credentials,
      'StickerPack_PDF',
      `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <StickerPack_PDF xmlns="http://ltl-ws.major-express.ru/edclients/">
      <WBNumber>${escapeXml(wbNumber)}</WBNumber>
    </StickerPack_PDF>
  </soap:Body>
</soap:Envelope>`,
    );
    const payload = (extractTag(xml, 'StickerPack_PDFResult') || '').trim();
    if (!payload) {
      throw new Error(`Major StickerPack_PDF failed: empty response for WB ${wbNumber}`);
    }
    return Buffer.from(payload, 'base64');
  }

  private createDocumentStubs(
    wbNumber: string,
  ): Array<Pick<ShipmentDocumentRecord, 'type' | 'title' | 'content'>> {
    return [
      {
        type: 'WAYBILL',
        title: 'Накладная Major (PDF)',
        content: `major-doc:waybill:${wbNumber}`,
      },
      {
        type: 'LABEL',
        title: 'Стикеры Major (PDF)',
        content: `major-doc:label:${wbNumber}`,
      },
    ];
  }

  private mapMajorOrderStatus(code: number, waybillNumber: string): ShipmentRecord['status'] {
    if (!waybillNumber) return 'CREATED';
    // Точного enum в документации нет в разрезе TMS, поэтому используем безопасное приближение.
    if (code >= 10) return 'DELIVERED';
    if (code >= 6) return 'OUT_FOR_DELIVERY';
    if (code >= 2) return 'IN_TRANSIT';
    return 'CONFIRMED';
  }

  private mapMajorHistoryStatus(event: string, comments: string): ShipmentRecord['status'] {
    const text = `${event} ${comments}`.toLowerCase();
    if (/вруч|доставл|получ/.test(text)) return 'DELIVERED';
    if (/курьер|выдано|out for delivery/.test(text)) return 'OUT_FOR_DELIVERY';
    if (/транзит|прибыл|отправлен|принят/.test(text)) return 'IN_TRANSIT';
    return 'CONFIRMED';
  }

  private buildCalculatorBody(
    credentials: InternalCarrierCredentials,
    shipperCityCode: number,
    consigneeCityCode: number,
    input: CreateShipmentRequestInput,
  ): string {
    const weightKg = Math.max(input.snapshot.cargo.weightGrams / 1000, 0.1).toFixed(3);
    const cost = Math.max(input.snapshot.cargo.declaredValueRub, 1).toFixed(2);
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Calculator xmlns="http://ltl-ws.major-express.ru/edclients/">
      <ShipperCityCode>${shipperCityCode}</ShipperCityCode>
      <ConsigneeCityCode>${consigneeCityCode}</ConsigneeCityCode>
      <Weight>${weightKg}</Weight>
      <Cost>${cost}</Cost>
    </Calculator>
  </soap:Body>
</soap:Envelope>`;
  }

  private buildCalculator1Body(
    credentials: InternalCarrierCredentials,
    shipperCityCode: number,
    consigneeCityCode: number,
    input: CreateShipmentRequestInput,
  ): string {
    const cargo = input.snapshot.cargo;
    const places = Math.max(Math.round(cargo.places || 1), 1);
    const totalWeightKg = Math.max(cargo.weightGrams / 1000, 0.1);
    const packageWeight = Math.max(totalWeightKg / places, 0.1).toFixed(3);
    const lengthCm = Math.max(Math.round((cargo.lengthMm ?? 100) / 10), 1);
    const widthCm = Math.max(Math.round((cargo.widthMm ?? 100) / 10), 1);
    const heightCm = Math.max(Math.round((cargo.heightMm ?? 100) / 10), 1);
    const cost = Math.max(cargo.declaredValueRub, 1).toFixed(2);
    const packagesXml = Array.from({ length: places })
      .map(
        () => `        <EDCalculatorPackageType>
          <Weight>${packageWeight}</Weight>
          <Length>${lengthCm}</Length>
          <Width>${widthCm}</Width>
          <Height>${heightCm}</Height>
        </EDCalculatorPackageType>`,
      )
      .join('\n');

    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Calculator1 xmlns="http://ltl-ws.major-express.ru/edclients/">
      <ShipperCityCode>${shipperCityCode}</ShipperCityCode>
      <ConsigneeCityCode>${consigneeCityCode}</ConsigneeCityCode>
      <Cost>${cost}</Cost>
      <Packages>
${packagesXml}
      </Packages>
    </Calculator1>
  </soap:Body>
</soap:Envelope>`;
  }
}
