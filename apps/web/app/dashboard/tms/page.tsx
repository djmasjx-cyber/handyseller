"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, Input, Label } from "@handyseller/ui"
import { Loader2, Truck, Network, Route, PackageCheck, CircleDollarSign } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { looksLikeOrderReferenceDestination } from "@/lib/tms-create-request-from-order"

type ServiceFlag = "EXPRESS" | "HAZMAT" | "CONSOLIDATED" | "AIR" | "OVERSIZED"

type CandidateOrder = {
  id: string
  externalId: string
  marketplace: string
  status: string
  tmsStatus: string
  totalAmount: number
  warehouseName?: string | null
  /** Адрес доставки из core (ручные/TMS заказы) — обязателен для расчёта тарифов у ТК. */
  deliveryAddressLabel?: string | null
  logisticsScenario: "MARKETPLACE_RC" | "CARRIER_DELIVERY"
  createdAt: string
  requestId?: string
  shipmentId?: string
  items: Array<{ title: string; quantity: number }>
}

type Overview = {
  carriersCount: number
  requestsCount: number
  quotedCount: number
  bookedCount: number
  activeShipmentsCount: number
}

type Carrier = {
  id: string
  name: string
  modes: string[]
  supportedFlags: ServiceFlag[]
}

type Quote = {
  id: string
  carrierId: string
  carrierName: string
  priceRub: number
  etaDays: number
  score: number
  notes?: string
}

type ShipmentRequest = {
  id: string
  status: string
  draft: { originLabel: string; destinationLabel: string; serviceFlags: ServiceFlag[] }
  snapshot: { coreOrderNumber: string; marketplace: string }
  selectedQuoteId?: string
  createdAt: string
}

type Shipment = {
  id: string
  carrierName: string
  trackingNumber: string
  status: string
  priceRub: number
  etaDays: number
  createdAt: string
}

const SERVICE_FLAGS: Array<{ id: ServiceFlag; label: string }> = [
  { id: "EXPRESS", label: "Экспресс" },
  { id: "HAZMAT", label: "Опасный груз" },
  { id: "CONSOLIDATED", label: "Сборный" },
  { id: "AIR", label: "Авиа" },
  { id: "OVERSIZED", label: "Негабарит" },
]

function scenarioLabel(value: CandidateOrder["logisticsScenario"]) {
  return value === "MARKETPLACE_RC" ? "Доставка до РЦ маркетплейса" : "Доставка через ТК"
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

function requestStatusLabel(value: string) {
  switch (value) {
    case "DRAFT":
      return "Тарифы не получены"
    case "QUOTED":
      return "Варианты получены"
    case "BOOKED":
      return "Вариант выбран"
    default:
      return value
  }
}

export default function TmsDashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [carriers, setCarriers] = useState<Carrier[]>([])
  const [candidateOrders, setCandidateOrders] = useState<CandidateOrder[]>([])
  const [requests, setRequests] = useState<ShipmentRequest[]>([])
  const [shipments, setShipments] = useState<Shipment[]>([])
  const [quotesByRequest, setQuotesByRequest] = useState<Record<string, Quote[]>>({})
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [originLabel, setOriginLabel] = useState("")
  const [destinationLabel, setDestinationLabel] = useState("")
  const [flags, setFlags] = useState<ServiceFlag[]>([])
  const [error, setError] = useState<string | null>(null)

  const selectedOrder = useMemo(
    () => candidateOrders.find((item) => item.id === selectedOrderId) ?? null,
    [candidateOrders, selectedOrderId],
  )
  const orderIdFromQuery = searchParams.get("orderId")

  /** Старые ссылки ?orderId=&autoQuote=1 — сразу на матрицу тарифов, без шага через этот дашборд. */
  useEffect(() => {
    const oid = searchParams.get("orderId")
    if (searchParams.get("autoQuote") !== "1" || !oid) return
    router.replace(`/dashboard/tms/requests?${searchParams.toString()}`)
  }, [router, searchParams])

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [overviewRes, carriersRes, candidatesRes, requestsRes, shipmentsRes] = await Promise.all([
        authFetch("/api/tms/overview", { headers }),
        authFetch("/api/tms/carriers", { headers }),
        authFetch("/api/tms/client-orders", { headers }),
        authFetch("/api/tms/shipment-requests?view=operator", { headers }),
        authFetch("/api/tms/shipments", { headers }),
      ])

      const [overviewData, carriersData, candidatesData, requestsData, shipmentsData] = await Promise.all([
        overviewRes.json().catch(() => null),
        carriersRes.json().catch(() => []),
        candidatesRes.json().catch(() => []),
        requestsRes.json().catch(() => []),
        shipmentsRes.json().catch(() => []),
      ])

      setOverview(overviewData)
      setCarriers(Array.isArray(carriersData) ? carriersData : [])
      setCandidateOrders(Array.isArray(candidatesData) ? candidatesData : [])
      setRequests(Array.isArray(requestsData) ? requestsData : [])
      setShipments(Array.isArray(shipmentsData) ? shipmentsData : [])

      const topRequests = (Array.isArray(requestsData) ? requestsData : []).slice(0, 5)
      const quoteEntries = await Promise.all(
        topRequests.map(async (request: ShipmentRequest) => {
          const res = await authFetch(`/api/tms/shipment-requests/${request.id}/quotes`, { headers })
          const data = await res.json().catch(() => [])
          return [request.id, Array.isArray(data) ? data : []] as const
        }),
      )
      setQuotesByRequest(Object.fromEntries(quoteEntries))
    } catch {
      setError("Не удалось загрузить TMS-данные")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    if (!selectedOrder) return
    setOriginLabel(selectedOrder.warehouseName ?? "")
    setDestinationLabel(selectedOrder.deliveryAddressLabel?.trim() ?? "")
  }, [selectedOrder])

  useEffect(() => {
    if (!orderIdFromQuery || !candidateOrders.length) return
    const exists = candidateOrders.some((order) => order.id === orderIdFromQuery)
    if (exists) setSelectedOrderId(orderIdFromQuery)
  }, [orderIdFromQuery, candidateOrders])

  const toggleFlag = (flag: ServiceFlag) => {
    setFlags((prev) => (prev.includes(flag) ? prev.filter((item) => item !== flag) : [...prev, flag]))
  }

  const createShipmentRequest = async () => {
    if (!token || !selectedOrder) return
    setSubmitting(true)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      const snapshotRes = await authFetch(`/api/tms/core/orders/${selectedOrder.id}/snapshot`, { headers })
      if (!snapshotRes.ok) {
        const data = await snapshotRes.json().catch(() => ({}))
        throw new Error(data?.message ?? "Не удалось собрать данные заказа для расчёта")
      }
      const snapshot = await snapshotRes.json() as {
        destinationLabel?: string | null
        originLabel?: string | null
      }
      const snapDest = (snapshot.destinationLabel ?? "").trim()
      const orderDest = (selectedOrder.deliveryAddressLabel ?? "").trim()
      const typedDest = destinationLabel.trim()
      const destinationResolved =
        typedDest && !looksLikeOrderReferenceDestination(typedDest)
          ? typedDest
          : snapDest || orderDest || typedDest

      if (!destinationResolved || looksLikeOrderReferenceDestination(destinationResolved)) {
        throw new Error(
          "Укажите адрес доставки в поле «Точка Б» (город или полный адрес). Служебная строка вида «MANUAL / заказ …» не подходит для калькуляторов перевозчиков.",
        )
      }

      const res = await authFetch("/api/tms/shipment-requests", {
        method: "POST",
        headers,
        body: JSON.stringify({
          snapshot,
          draft: {
            originLabel: originLabel.trim() || selectedOrder.warehouseName || "Склад не указан",
            destinationLabel: destinationResolved,
            serviceFlags: flags,
          },
          integration: { fulfillmentMode: "OPERATOR_QUEUE" as const },
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message ?? "Не удалось создать заявку")
      }
      await res.json().catch(() => null)
      setSelectedOrderId(null)
      setFlags([])
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось получить варианты")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateShipmentRequestClick = () => {
    void createShipmentRequest()
  }

  const selectQuote = async (requestId: string, quoteId: string) => {
    if (!token) return
    setSubmitting(true)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      const res = await authFetch(`/api/tms/shipment-requests/${requestId}/select-quote`, {
        method: "POST",
        headers,
        body: JSON.stringify({ quoteId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message ?? "Не удалось сохранить выбор клиента")
      }
      await loadData()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить выбор клиента")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Truck className="h-7 w-7 text-primary" />
          TMS
        </h1>
        <p className="text-sm text-muted-foreground">
          Простой логистический помощник: берем заказ, запрашиваем тарифы и сроки у подключенных ТК клиента, показываем понятную матрицу вариантов и помогаем выбрать лучший сценарий.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-5">
        {[
          { label: "Перевозчики", value: overview?.carriersCount ?? 0, icon: Network },
          { label: "Расчеты", value: overview?.requestsCount ?? 0, icon: Route },
          { label: "Варианты получены", value: overview?.quotedCount ?? 0, icon: CircleDollarSign },
          { label: "Выбрано клиентом", value: overview?.bookedCount ?? 0, icon: PackageCheck },
          { label: "Следующий этап", value: overview?.activeShipmentsCount ?? 0, icon: Truck },
        ].map((item) => (
          <Card key={item.label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
              <item.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Получить тарифы по заказу</CardTitle>
            <CardDescription>Пользователь выбирает заказ, уточняет маршрут и получает готовую матрицу тарифов и сроков по своим подключенным ТК.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              {candidateOrders.slice(0, 6).map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setSelectedOrderId(order.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${selectedOrderId === order.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{order.marketplace} · {order.externalId}</p>
                      <p className="text-sm text-muted-foreground">{order.items.map((item) => `${item.title} x${item.quantity}`).join(", ")}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {scenarioLabel(order.logisticsScenario)} · {tmsStatusLabel(order.tmsStatus)}
                      </p>
                    </div>
                    <Badge variant="outline">{order.status}</Badge>
                  </div>
                </button>
              ))}
            </div>

            {selectedOrder && (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="originLabel">Точка А</Label>
                    <Input id="originLabel" value={originLabel} onChange={(e) => setOriginLabel(e.target.value)} placeholder="Склад / адрес отправления" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="destinationLabel">Точка Б</Label>
                    <Input id="destinationLabel" value={destinationLabel} onChange={(e) => setDestinationLabel(e.target.value)} placeholder="Адрес или город доставки" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Признаки перевозки</Label>
                  <div className="flex flex-wrap gap-2">
                    {SERVICE_FLAGS.map((flag) => (
                      <button
                        key={flag.id}
                        type="button"
                        onClick={() => toggleFlag(flag.id)}
                        className={`rounded-full border px-3 py-1 text-sm ${flags.includes(flag.id) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
                      >
                        {flag.label}
                      </button>
                    ))}
                  </div>
                </div>

                <Button onClick={handleCreateShipmentRequestClick} disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Получить варианты
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Доступные каналы расчета</CardTitle>
            <CardDescription>Показываем только те ТК, по которым пользователь может получить реальный тариф по своей учётке.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {carriers.map((carrier) => (
              <div key={carrier.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{carrier.name}</p>
                  <Badge variant="secondary">{carrier.modes.join(", ")}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Флаги: {carrier.supportedFlags.length ? carrier.supportedFlags.join(", ") : "базовая доставка"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Последние расчеты и варианты</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {requests.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет расчетов по перевозке.</p>
            ) : (
              requests.slice(0, 5).map((request) => (
                <div key={request.id} className="rounded-lg border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{request.snapshot.marketplace} · {request.snapshot.coreOrderNumber}</p>
                      <p className="text-sm text-muted-foreground">{request.draft.originLabel} → {request.draft.destinationLabel}</p>
                    </div>
                    <Badge>{requestStatusLabel(request.status)}</Badge>
                  </div>
                  <div className="grid gap-2">
                    {(quotesByRequest[request.id] ?? []).map((quote, index) => (
                      <div key={quote.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{quote.carrierName}</p>
                            {index === 0 ? <Badge variant="secondary">Рекомендуем</Badge> : null}
                            {request.selectedQuoteId === quote.id ? <Badge>Выбор клиента</Badge> : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {quote.etaDays} дн. · интегральная оценка {quote.score}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{quote.priceRub.toLocaleString("ru-RU")} ₽</span>
                          <Button
                            size="sm"
                            variant={request.selectedQuoteId === quote.id ? "secondary" : "outline"}
                            onClick={() => selectQuote(request.id, quote.id)}
                            disabled={submitting || request.status === "BOOKED"}
                          >
                            {request.selectedQuoteId === quote.id ? "Выбрано" : "Выбрать"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Следующий этап</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {shipments.length === 0 ? (
              <p className="text-sm text-muted-foreground">После выбора тарифа здесь появится следующий шаг оформления перевозки.</p>
            ) : (
              shipments.slice(0, 6).map((shipment) => (
                <div key={shipment.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{shipment.carrierName}</p>
                      <p className="text-sm text-muted-foreground">Трек: {shipment.trackingNumber}</p>
                    </div>
                    <Badge variant="outline">{shipment.status}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {shipment.priceRub.toLocaleString("ru-RU")} ₽ · {shipment.etaDays} дн.
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
