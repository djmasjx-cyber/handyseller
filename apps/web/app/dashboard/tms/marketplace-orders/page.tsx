"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { isTmsMpMarketplace } from "@/lib/tms-mp-marketplaces"

type ClientOrder = {
  id: string
  externalId: string
  marketplace: string
  status: string
  tmsStatus: string
  totalAmount: number
  warehouseName?: string | null
  deliveryAddressLabel?: string | null
  logisticsScenario: "MARKETPLACE_RC" | "CARRIER_DELIVERY"
  createdAt: string
  requestId?: string
  shipmentId?: string
  items: Array<{ title: string; quantity: number }>
}

function scenarioLabel(value: ClientOrder["logisticsScenario"]) {
  return value === "MARKETPLACE_RC" ? "До РЦ маркетплейса" : "Доставка через ТК"
}

function tmsStatusLabel(value: string) {
  switch (value) {
    case "NO_REQUEST":
      return "Тарифы не запрошены"
    case "DRAFT":
      return "Черновик расчета"
    case "QUOTED":
      return "Варианты получены"
    case "BOOKED":
      return "Вариант выбран"
    case "IN_TRANSIT":
      return "В процессе"
    case "DELIVERED":
      return "Завершено"
    default:
      return value
  }
}

export default function TmsMarketplaceOrdersPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [items, setItems] = useState<ClientOrder[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const r = await authFetch("/api/tms/client-orders", { headers: { Authorization: `Bearer ${token}` } })
      const data = r.ok ? await r.json() : []
      const all = Array.isArray(data) ? (data as ClientOrder[]) : []
      setItems(all.filter((o) => isTmsMpMarketplace(o.marketplace)))
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Заказы маркетплейсов</CardTitle>
          <CardDescription>
            Wildberries, Ozon, Яндекс — отдельный поток под консолидацию и отгрузку на сортировочный центр. Тарифы
            смотрите на странице «Сравнение тарифов» (один клик).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Заказов с маркетплейсов пока нет.</p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="rounded-xl border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {item.marketplace} · {item.externalId}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.items.map((row) => `${row.title} x${row.quantity}`).join(", ")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2 space-y-0.5">
                      <span>{scenarioLabel(item.logisticsScenario)}</span>
                      {item.warehouseName || item.deliveryAddressLabel ? (
                        <span className="block">
                          {item.warehouseName ? <span>Откуда: {item.warehouseName}</span> : null}
                          {item.warehouseName && item.deliveryAddressLabel ? " · " : null}
                          {item.deliveryAddressLabel ? <span>Куда: {item.deliveryAddressLabel}</span> : null}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{item.status}</Badge>
                    <Badge>{tmsStatusLabel(item.tmsStatus)}</Badge>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-border/60">
                  <p className="text-sm text-muted-foreground">
                    {item.totalAmount.toLocaleString("ru-RU")} ₽ · {new Date(item.createdAt).toLocaleString("ru-RU")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {item.requestId ? (
                      <Button asChild size="sm" variant="outline">
                        <Link
                          href={`/dashboard/tms/requests?requestId=${encodeURIComponent(item.requestId)}`}
                        >
                          Сравнение тарифов
                        </Link>
                      </Button>
                    ) : (
                      <Button asChild size="sm">
                        <Link
                          href={`/dashboard/tms/requests?orderId=${encodeURIComponent(item.id)}&autoQuote=1`}
                        >
                          Получить варианты
                        </Link>
                      </Button>
                    )}
                    {item.shipmentId ? (
                      <Button asChild size="sm" variant="secondary">
                        <Link href="/dashboard/tms/shipments">Отгрузки</Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
