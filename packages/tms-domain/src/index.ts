import type { CarrierDescriptor, CarrierQuote, ServiceFlag } from '@handyseller/tms-sdk';

export function carrierSupportsFlags(carrier: CarrierDescriptor, flags: ServiceFlag[]): boolean {
  return flags.every((flag) => carrier.supportedFlags.includes(flag));
}

export function computeQuoteScore(quote: Pick<CarrierQuote, 'priceRub' | 'etaDays' | 'serviceFlags'>): number {
  const expressBonus = quote.serviceFlags.includes('EXPRESS') ? 12 : 0;
  const airBonus = quote.serviceFlags.includes('AIR') ? 6 : 0;
  const pricePenalty = quote.priceRub / 120;
  const etaPenalty = quote.etaDays * 8;
  return Math.round((100 + expressBonus + airBonus - pricePenalty - etaPenalty) * 100) / 100;
}

export function rankQuotes<T extends CarrierQuote>(quotes: T[]): T[] {
  return [...quotes].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.priceRub !== b.priceRub) return a.priceRub - b.priceRub;
    return a.etaDays - b.etaDays;
  });
}
