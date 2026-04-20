import { Logger } from '@nestjs/common';
import type {
  CarrierDescriptor,
  CarrierQuote,
  CreateShipmentRequestInput,
  InternalCarrierCredentials,
  ShipmentRecord,
  TrackingEventRecord,
} from '@handyseller/tms-sdk';
import type { CarrierAdapter, CarrierQuoteContext } from './base-carrier.adapter';

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
    supportsBooking: false,
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

  async book(quote: CarrierQuote): Promise<{
    shipment: Omit<ShipmentRecord, 'id' | 'userId' | 'createdAt'>;
    tracking: Array<Omit<TrackingEventRecord, 'id'>>;
  }> {
    return {
      shipment: {
        requestId: quote.requestId,
        carrierId: quote.carrierId,
        carrierName: quote.carrierName,
        trackingNumber: `MAJOR-PENDING-${Date.now().toString().slice(-6)}`,
        status: 'CREATED',
        priceRub: quote.priceRub,
        etaDays: quote.etaDays,
      },
      tracking: [
        {
          shipmentId: '',
          status: 'CREATED',
          description: 'Тариф Major Express выбран. Бронирование выполняется следующим шагом.',
          occurredAt: new Date().toISOString(),
        },
      ],
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
