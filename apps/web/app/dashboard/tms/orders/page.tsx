"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { Loader2, PackagePlus } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { TmsEstimateOrderModal } from "@/components/tms/tms-estimate-order-modal"

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

export default function TmsOrdersPage() {
  const router = useRouter()
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [items, setItems] = useState<ClientOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [estimateOpen, setEstimateOpen] = useState(false)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const r = await authFetch("/api/tms/client-orders", { headers: { Authorization: `Bearer ${token}` } })
      const data = r.ok ? await r.json() : []
      setItems(Array.isArray(data) ? data : [])
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
    <>
      <TmsEstimateOrderModal
        open={estimateOpen}
        onClose={() => setEstimateOpen(false)}
        onCreated={() => {
          void load()
          router.push("/dashboard/tms")
        }}
      />

      <div className="space-y-6">
        <Card className="border-primary/15 shadow-sm">
          <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl">Заказы клиентов</CardTitle>
              <CardDescription>
                Заказы из HandySeller и ручные заявки для расчёта доставки. Для быстрой оценки тарифов Major / Деловых Линий
                создайте заказ с маршрутом и габаритами — затем на главной TMS нажмите «Получить варианты».
              </CardDescription>
            </div>
            <Button type="button" className="shrink-0 gap-2" onClick={() => setEstimateOpen(true)}>
              <PackagePlus className="h-4 w-4" />
              Заказ для оценки доставки
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Пока нет заказов. Создайте ручной заказ для просчёта перевозки или дождитесь заказов из маркетплейсов.
                </p>
                <Button type="button" onClick={() => setEstimateOpen(true)} className="gap-2">
                  <PackagePlus className="h-4 w-4" />
                  Создать заказ для оценки
                </Button>
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border bg-card p-4 space-y-3 transition-shadow hover:shadow-md"
                >
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
                            {item.warehouseName ? (
                              <span>Откуда: {item.warehouseName}</span>
                            ) : null}
                            {item.warehouseName && item.deliveryAddressLabel ? " · " : null}
                            {item.deliveryAddressLabel ? (
                              <span>Куда: {item.deliveryAddressLabel}</span>
                            ) : null}
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
                          <Link href="/dashboard/tms/requests">Открыть расчет</Link>
                        </Button>
                      ) : (
                        <Button asChild size="sm">
                          <Link href="/dashboard/tms">Получить варианты</Link>
                        </Button>
                      )}
                      {item.shipmentId ? (
                        <Button asChild size="sm" variant="secondary">
                          <Link href="/dashboard/tms/shipments">Следующий этап</Link>
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
    </>
  )
}
