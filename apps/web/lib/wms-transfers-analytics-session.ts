/**
 * Состояние списка аналитики перемещений при провале в заказ и обратно.
 * Длинные query (много ОП в фильтре) иногда теряются при round-trip через Next/router;
 * пин в sessionStorage гарантирует тот же набор параметров, что был на сводке.
 */
export const WMS_TRANSFERS_SESSION_LIST_QUERY_KEY = "wmsTransfersAnalyticsLastListQuery:v1"
export const WMS_TRANSFERS_SESSION_LIST_ORDER_KEY = "wmsTransfersAnalyticsLastListOrder:v1"
export const WMS_TRANSFERS_SESSION_SCROLL_TO_ORDERS_KEY = "wmsTransfersFocusTouristOrdersSection:v1"

const TRANSFERS_LIST_PATH = "/dashboard/wms/analytics/transfers"

export function persistTransfersListStateForOrderDrill(orderNumber: string, filtersQueryCanonical: string): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(WMS_TRANSFERS_SESSION_LIST_QUERY_KEY, filtersQueryCanonical)
    sessionStorage.setItem(WMS_TRANSFERS_SESSION_LIST_ORDER_KEY, orderNumber)
  } catch {
    /* quota / privacy */
  }
}

/** URL сводки: при совпадении заказа с пином — точная строка query из sessionStorage. */
export function resolveTransfersListHrefFromOrder(searchParams: URLSearchParams, orderNumber: string): string {
  const trimmedOrder = orderNumber.trim()
  if (typeof window !== "undefined" && trimmedOrder) {
    try {
      const pinnedOrder = sessionStorage.getItem(WMS_TRANSFERS_SESSION_LIST_ORDER_KEY)
      const pinnedQs = sessionStorage.getItem(WMS_TRANSFERS_SESSION_LIST_QUERY_KEY)
      if (pinnedQs != null && pinnedQs.length > 0 && pinnedOrder === trimmedOrder) {
        return `${TRANSFERS_LIST_PATH}?${pinnedQs}`
      }
    } catch {
      /* ignore */
    }
  }
  const q = new URLSearchParams(searchParams)
  q.delete("orderNumber")
  q.delete("orderGroupKind")
  const s = q.toString()
  return s ? `${TRANSFERS_LIST_PATH}?${s}` : TRANSFERS_LIST_PATH
}

export function requestScrollToTransfersTouristOrdersSection(): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(WMS_TRANSFERS_SESSION_SCROLL_TO_ORDERS_KEY, "1")
  } catch {
    /* ignore */
  }
}

/** Одноразово: вернул true, если нужно проскроллить к таблице заказов. */
export function consumeScrollToTransfersTouristOrdersSection(): boolean {
  if (typeof window === "undefined") return false
  try {
    if (sessionStorage.getItem(WMS_TRANSFERS_SESSION_SCROLL_TO_ORDERS_KEY) !== "1") return false
    sessionStorage.removeItem(WMS_TRANSFERS_SESSION_SCROLL_TO_ORDERS_KEY)
    return true
  } catch {
    return false
  }
}
