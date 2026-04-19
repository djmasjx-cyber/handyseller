import { authFetch } from "@/lib/auth-fetch"

/** Служебная подпись вместо адреса (не подходит для калькуляторов ТК). */
export function looksLikeOrderReferenceDestination(value: string): boolean {
  const t = value.trim()
  return t.length > 0 && /\/\s*заказ\s+/i.test(t)
}

export type TmsOrderForShipment = {
  id: string
  externalId: string
  marketplace: string
  warehouseName?: string | null
  deliveryAddressLabel?: string | null
}

/**
 * Создаёт заявку TMS + первичный расчёт тарифов из заказа core (как с дашборда TMS).
 * Используется с экрана «Сравнение тарифов» для autoQuote без лишних переходов.
 */
export async function createTmsShipmentRequestFromOrder(
  accessToken: string,
  order: TmsOrderForShipment,
  options?: { serviceFlags?: string[] },
): Promise<{ requestId: string }> {
  const serviceFlags = options?.serviceFlags ?? []
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }

  const snapshotRes = await authFetch(`/api/tms/core/orders/${order.id}/snapshot`, { headers })
  if (!snapshotRes.ok) {
    const data = await snapshotRes.json().catch(() => ({}))
    throw new Error(typeof data?.message === "string" ? data.message : "Не удалось собрать данные заказа для расчёта")
  }

  const snapshot = (await snapshotRes.json()) as {
    destinationLabel?: string | null
    originLabel?: string | null
  }

  const snapDest = (snapshot.destinationLabel ?? "").trim()
  const orderDest = (order.deliveryAddressLabel ?? "").trim()
  const typedDest = ""
  const destinationResolved =
    typedDest && !looksLikeOrderReferenceDestination(typedDest)
      ? typedDest
      : snapDest || orderDest || typedDest

  if (!destinationResolved || looksLikeOrderReferenceDestination(destinationResolved)) {
    throw new Error(
      "Укажите адрес доставки для заказа (в карточке заказа). Служебная строка вида «MANUAL / заказ …» не подходит для калькуляторов перевозчиков.",
    )
  }

  const res = await authFetch("/api/tms/shipment-requests", {
    method: "POST",
    headers,
    body: JSON.stringify({
      snapshot,
      draft: {
        originLabel: (order.warehouseName ?? "").trim() || "Склад не указан",
        destinationLabel: destinationResolved,
        serviceFlags,
      },
    }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data?.message === "string" ? data.message : "Не удалось создать заявку")
  }

  const created = (await res.json().catch(() => ({}))) as { request?: { id?: string } }
  const requestId = created?.request?.id
  if (!requestId) {
    throw new Error("Не удалось создать заявку: пустой ответ")
  }

  return { requestId }
}
