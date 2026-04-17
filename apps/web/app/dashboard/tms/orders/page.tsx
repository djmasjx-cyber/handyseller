"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@handyseller/ui"
import { Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

type ClientOrder = {
  id: string
  externalId: string
  marketplace: string
  status: string
  tmsStatus: string
  totalAmount: number
  warehouseName?: string | null
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
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [items, setItems] = useState<ClientOrder[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    authFetch("/api/tms/client-orders", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Заказы клиентов</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Реальные заказы клиента пока не найдены.</p>
        ) : items.map((item) => (
          <div key={item.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{item.marketplace} · {item.externalId}</p>
                <p className="text-sm text-muted-foreground">
                  {item.items.map((row) => `${row.title} x${row.quantity}`).join(", ")}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {scenarioLabel(item.logisticsScenario)}{item.warehouseName ? ` · ${item.warehouseName}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{item.status}</Badge>
                <Badge>{tmsStatusLabel(item.tmsStatus)}</Badge>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
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
        ))}
      </CardContent>
    </Card>
  )
}
