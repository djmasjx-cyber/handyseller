"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

type RegistryDetail = {
  requestId: string
  internalOrderNumber: string
  coreOrderId: string
  externalOrderId: string | null
  orderType: string | null
  status: string
  customerName: string | null
  customerPhone: string | null
  originLabel: string | null
  destinationLabel: string | null
  priceRub: number | null
  request?: {
    selectedQuoteId?: string
    draft?: { serviceFlags?: string[]; notes?: string }
    snapshot?: {
      coreOrderNumber?: string
      itemSummary?: Array<{ title: string; quantity: number; weightGrams?: number | null }>
      cargo?: { weightGrams?: number; places?: number; declaredValueRub?: number }
    }
  }
  shipments?: Array<{
    id: string
    carrierName: string
    trackingNumber: string
    carrierOrderNumber?: string
    carrierOrderReference?: string
    status: string
    priceRub: number
    etaDays: number
    createdAt: string
  }>
  documents?: Array<{ id: string; shipmentId: string; title: string; type: string; createdAt: string }>
  tracking?: Array<{ id: string; description: string; status: string; occurredAt: string; location?: string }>
  auditEvents?: Array<{ type: string; occurredAt: string; title: string; details?: string | null }>
}

type TabId = "cart" | "shipments" | "history"

function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  try {
    return new Date(value).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return value
  }
}

function statusLabel(value: string): string {
  switch (value) {
    case "DRAFT":
      return "Черновик"
    case "QUOTED":
      return "Тарифы рассчитаны"
    case "BOOKED":
      return "Забронировано"
    case "CREATED":
      return "Создано"
    case "CONFIRMED":
      return "Подтверждено"
    case "IN_TRANSIT":
      return "В пути"
    case "OUT_FOR_DELIVERY":
      return "На доставке"
    case "DELIVERED":
      return "Доставлено"
    case "SUPERSEDED":
      return "Заменено"
    default:
      return value
  }
}

function orderTypeLabel(value: string | null): string {
  switch (value) {
    case "CLIENT_ORDER":
      return "Клиентский заказ"
    case "INTERNAL_TRANSFER":
      return "Внутреннее перемещение"
    case "SUPPLIER_PICKUP":
      return "Забор у поставщика"
    default:
      return "Не указан"
  }
}

export default function TmsRegistryOrderPage() {
  const params = useParams<{ requestId: string }>()
  const requestId = decodeURIComponent(params.requestId)
  const [detail, setDetail] = useState<RegistryDetail | null>(null)
  const [activeTab, setActiveTab] = useState<TabId>("cart")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const token = getToken()

  useEffect(() => {
    if (!token || !requestId) return
    setLoading(true)
    setError(null)
    authFetch(`/api/tms/v1/orders/${encodeURIComponent(requestId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as RegistryDetail
        if (!res.ok) throw new Error("Не удалось загрузить карточку заказа")
        setDetail(data)
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Не удалось загрузить карточку заказа"))
      .finally(() => setLoading(false))
  }, [requestId, token])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Карточка заказа</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-destructive">{error ?? "Заказ не найден"}</p>
          <Button asChild variant="outline">
            <Link href="/dashboard/tms/registry">Вернуться в журнал</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/tms/registry">← Журнал заказов</Link>
      </Button>

      <Card className="mx-auto w-full overflow-hidden" style={{ maxWidth: "20cm", minHeight: "15cm" }}>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Заказ {detail.internalOrderNumber}</CardTitle>
              <CardDescription>
                ID: {detail.coreOrderId} · requestId: {detail.requestId}
              </CardDescription>
            </div>
            <Badge variant="outline">{statusLabel(detail.status)}</Badge>
          </div>
          <div className="grid gap-2 pt-3 text-sm md:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Заказ клиента: </span>
              {detail.externalOrderId || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Тип: </span>
              {orderTypeLabel(detail.orderType)}
            </p>
            <p>
              <span className="text-muted-foreground">Получатель: </span>
              {detail.customerName || "—"} {detail.customerPhone ? `· ${detail.customerPhone}` : ""}
            </p>
            <p>
              <span className="text-muted-foreground">Маршрут: </span>
              {detail.originLabel || "—"} → {detail.destinationLabel || "—"}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap gap-2">
            {[
              ["cart", "Корзина"],
              ["shipments", "Отгрузки и документы"],
              ["history", "История"],
            ].map(([id, label]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={activeTab === id ? "default" : "outline"}
                onClick={() => setActiveTab(id as TabId)}
              >
                {label}
              </Button>
            ))}
          </div>

          {activeTab === "cart" ? <CartTab detail={detail} /> : null}
          {activeTab === "shipments" ? <ShipmentsTab detail={detail} /> : null}
          {activeTab === "history" ? <HistoryTab detail={detail} /> : null}
        </CardContent>
      </Card>
    </div>
  )
}

function CartTab({ detail }: { detail: RegistryDetail }) {
  const items = detail.request?.snapshot?.itemSummary ?? []
  const cargo = detail.request?.snapshot?.cargo
  return (
    <div className="space-y-3">
      <div className="grid gap-2 text-sm md:grid-cols-3">
        <p className="rounded-md border p-3">Товаров: {items.reduce((sum, item) => sum + item.quantity, 0)}</p>
        <p className="rounded-md border p-3">Мест: {cargo?.places ?? "—"}</p>
        <p className="rounded-md border p-3">
          Объявленная стоимость: {cargo?.declaredValueRub != null ? `${cargo.declaredValueRub.toLocaleString("ru-RU")} ₽` : "—"}
        </p>
      </div>
      <div className="rounded-md border">
        {items.length ? (
          items.map((item) => (
            <div key={`${item.title}-${item.quantity}`} className="flex justify-between gap-3 border-b px-3 py-2 last:border-b-0">
              <span>{item.title}</span>
              <span className="text-muted-foreground">× {item.quantity}</span>
            </div>
          ))
        ) : (
          <p className="p-3 text-sm text-muted-foreground">Состав корзины не передан.</p>
        )}
      </div>
    </div>
  )
}

function ShipmentsTab({ detail }: { detail: RegistryDetail }) {
  const shipments = detail.shipments ?? []
  const documents = detail.documents ?? []
  return (
    <div className="space-y-3">
      {shipments.length ? (
        shipments.map((shipment) => (
          <div key={shipment.id} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{shipment.carrierName}</p>
              <Badge variant="outline">{statusLabel(shipment.status)}</Badge>
            </div>
            <div className="mt-2 grid gap-1 text-muted-foreground md:grid-cols-2">
              <p>Номер заказа ТК: {shipment.carrierOrderReference || shipment.carrierOrderNumber || "—"}</p>
              <p>Трек-номер: {shipment.trackingNumber || "—"}</p>
              <p>Создано: {formatDateTime(shipment.createdAt)}</p>
              <p>Стоимость: {shipment.priceRub.toLocaleString("ru-RU")} ₽ · {shipment.etaDays} дн.</p>
            </div>
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">Перевозка еще не забронирована.</p>
      )}

      <div>
        <p className="mb-2 font-medium">Документы</p>
        {documents.length ? (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-md border px-3 py-2 text-sm">
                {doc.title} · {doc.type} · {formatDateTime(doc.createdAt)}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Документы пока не поступили.</p>
        )}
      </div>
    </div>
  )
}

function HistoryTab({ detail }: { detail: RegistryDetail }) {
  const audit = detail.auditEvents ?? []
  return (
    <div className="max-h-[9cm] space-y-2 overflow-y-auto">
      {audit.length ? (
        audit.map((event) => (
          <div key={`${event.type}-${event.occurredAt}-${event.title}`} className="rounded-md border p-3 text-sm">
            <p className="font-medium">{event.title}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</p>
            {event.details ? <p className="text-xs text-muted-foreground">{event.details}</p> : null}
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">История пока пустая.</p>
      )}
    </div>
  )
}
