/** Маркетплейсы с отдельным потоком «Заказы МП» (консолидация → СЦ). */
export const TMS_MP_MARKETPLACES = new Set(["WILDBERRIES", "OZON", "YANDEX"])

export function isTmsMpMarketplace(marketplace: string): boolean {
  return TMS_MP_MARKETPLACES.has(marketplace)
}
