"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { Loader2, Search } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

type RegistryOrder = {
  requestId: string
  shipmentId: string | null
  internalOrderNumber: string
  coreOrderId: string
  status: string
  requestStatus: string
  shipmentStatus: string | null
  externalOrderId: string | null
  orderType: string | null
  sourceSystem: string
  coreOrderNumber: string
  customerName: string | null
  customerPhone: string | null
  originLabel: string | null
  destinationLabel: string | null
  carrierId: string | null
  carrierName: string | null
  trackingNumber: string | null
  carrierOrderReference: string | null
  priceRub: number | null
  etaDays: number | null
  documentsCount: number
  trackingEventsCount: number
  lastEventAt: string | null
  createdAt: string
  updatedAt: string
  hasShipment: boolean
  hasArchivedShipments: boolean
  hasRequest: boolean
}

type RegistryResponse = {
  items: RegistryOrder[]
  nextCursor: string | null
}

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
    case "DELETED_EXTERNAL":
      return "Перенесен в архив"
    case "SUPERSEDED":
      return "Заменено"
    case "NO_REQUEST":
      return "Новый, без расчета"
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

export default function TmsRegistryPage() {
  const [view, setView] = useState<"active" | "deleted">("active")
  const [items, setItems] = useState<RegistryOrder[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const [carrierId, setCarrierId] = useState("")
  const [hasShipment, setHasShipment] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const token = getToken()

  const filterSnapshot = useMemo(
    () => ({ query, status, carrierId, hasShipment, view }),
    [query, status, carrierId, hasShipment, view],
  )
  const filterRef = useRef(filterSnapshot)
  filterRef.current = filterSnapshot

  const carrierOptions = useMemo(
    () =>
      [...new Map(items.filter((item) => item.carrierId).map((item) => [item.carrierId, item.carrierName ?? item.carrierId])).entries()]
        .map(([id, name]) => ({ id: id ?? "", name: name ?? id ?? "" }))
        .filter((item) => item.id),
    [items],
  )

  const loadRegistry = useCallback(
    async (cursor?: string | null, opts?: { silent?: boolean }) => {
      if (!token) return
      const f = filterRef.current
      if (cursor) setLoadingMore(true)
      else if (!opts?.silent) setLoading(true)
      if (!opts?.silent) setError(null)
      try {
        const params = new URLSearchParams()
        params.set("limit", "25")
        if (f.query.trim()) params.set("q", f.query.trim())
        params.set("deleted", f.view === "deleted" ? "true" : "false")
        if (f.view !== "deleted" && f.status) params.set("status", f.status)
        if (f.carrierId) params.set("carrierId", f.carrierId)
        if (f.view !== "deleted" && f.hasShipment) params.set("hasShipment", f.hasShipment)
        if (cursor) params.set("cursor", cursor)
        const res = await authFetch(`/api/tms/v1/orders?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = (await res.json().catch(() => ({}))) as Partial<RegistryResponse>
        if (!res.ok) throw new Error("Не удалось загрузить журнал TMS-заказов")
        const nextItems = Array.isArray(data.items) ? data.items : []
        if (cursor) {
          setItems((prev) => [...prev, ...nextItems])
          setNextCursor(data.nextCursor ?? null)
        } else if (opts?.silent) {
          /** Тихо подтягиваем актуальные статусы по первой странице, не сбрасывая пагинацию. */
          setItems((prev) => {
            if (prev.length === 0) return nextItems
            const byId = new Map(nextItems.map((i) => [i.requestId, i]))
            return prev.map((row) => byId.get(row.requestId) ?? row)
          })
        } else {
          setItems(nextItems)
          setNextCursor(data.nextCursor ?? null)
        }
      } catch (e) {
        if (!opts?.silent) {
          setError(e instanceof Error ? e.message : "Не удалось загрузить журнал TMS-заказов")
        }
      } finally {
        if (cursor) setLoadingMore(false)
        else if (!opts?.silent) setLoading(false)
      }
    },
    [token],
  )

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    void loadRegistry(null)
  }, [token, loadRegistry, view])

  /** Без кнопки «Обновить» в журнале: на фоне обновляем сводку по мере появления данных на бэке (и cron опроса ТК). */
  useEffect(() => {
    if (!token) return
    const tick = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return
      void loadRegistry(null, { silent: true })
    }
    const id = window.setInterval(tick, 45_000)
    return () => window.clearInterval(id)
  }, [token, loadRegistry])

  useEffect(() => {
    if (view !== "deleted") return
    if (status) setStatus("")
    if (hasShipment) setHasShipment("")
  }, [view, status, hasShipment])

  const applyFilters = () => {
    setNextCursor(null)
    void loadRegistry(null)
  }
  const showDeletedView = view === "deleted"

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Журнал TMS-заказов</CardTitle>
          <CardDescription>
            Постоянный реестр всех заявок, расчетов и перевозок, прошедших через HandySeller TMS. Записи не удаляются:
            при повторном бронировании старая отгрузка сохраняется в истории. Статусы в таблице подгружаются в фоне, отдельная
            кнопка обновления не требуется: данные приходят с сервера, где уже работает опрос и webhooks у перевозчиков.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="inline-flex rounded-md border bg-muted/20 p-1">
            <button
              type="button"
              onClick={() => setView("active")}
              className={`rounded px-3 py-1 text-sm ${view === "active" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Активные
            </button>
            <button
              type="button"
              onClick={() => setView("deleted")}
              className={`rounded px-3 py-1 text-sm ${view === "deleted" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
            >
              Удаленные заказы
            </button>
          </div>
          <div className={`grid gap-3 ${showDeletedView ? "md:grid-cols-[1fr_180px_auto]" : "md:grid-cols-[1fr_180px_180px_160px_auto]"}`}>
            <label className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Заказ, трек, телефон, получатель"
                className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm"
              />
            </label>
            <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="">Все перевозчики</option>
              {carrierOptions.map((carrier) => (
                <option key={carrier.id} value={carrier.id}>
                  {carrier.name}
                </option>
              ))}
            </select>
            {!showDeletedView ? (
              <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
                <option value="">Все статусы</option>
                <option value="DRAFT">Черновик</option>
                <option value="QUOTED">Тарифы рассчитаны</option>
                <option value="BOOKED">Забронировано</option>
                <option value="CONFIRMED">Подтверждено</option>
                <option value="IN_TRANSIT">В пути</option>
                <option value="DELIVERED">Доставлено</option>
                <option value="DELETED_EXTERNAL">Перенесен в архив</option>
                <option value="SUPERSEDED">Заменено</option>
                <option value="NO_REQUEST">Новый, без расчета</option>
              </select>
            ) : null}
            {!showDeletedView ? (
              <select value={hasShipment} onChange={(e) => setHasShipment(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
                <option value="">Все записи</option>
                <option value="true">Есть отгрузка</option>
                <option value="false">До бронирования</option>
              </select>
            ) : null}
            <Button type="button" onClick={applyFilters} disabled={loading}>
              Применить
            </Button>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">В журнале пока нет TMS-заказов.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[1120px] text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Дата</th>
                    <th className="px-3 py-2">Заказ</th>
                    <th className="px-3 py-2">Заказ клиента</th>
                    <th className="px-3 py-2">Получатель</th>
                    <th className="px-3 py-2">Маршрут</th>
                    <th className="px-3 py-2">Перевозчик</th>
                    <th className="px-3 py-2">Статус</th>
                    <th className="px-3 py-2 text-right">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.requestId} className="border-t align-top">
                      <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(item.createdAt)}</td>
                      <td className="px-3 py-3">
                        {item.hasRequest ? (
                          <Link
                            href={`/dashboard/tms/registry/${encodeURIComponent(item.requestId)}`}
                            className="font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {item.internalOrderNumber || item.coreOrderNumber || item.requestId}
                          </Link>
                        ) : (
                          <p className="font-medium">{item.internalOrderNumber || item.coreOrderNumber || item.requestId}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          ID: {item.coreOrderId || item.requestId}
                          {!item.hasRequest ? " · расчет доставки еще не запускался" : ""}
                        </p>
                        {item.hasArchivedShipments ? <Badge variant="secondary">Есть история замен</Badge> : null}
                      </td>
                      <td className="px-3 py-3">
                        <p>{item.externalOrderId || "—"}</p>
                        <p className="text-xs text-muted-foreground">{orderTypeLabel(item.orderType)}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p>{item.customerName || "—"}</p>
                        <p className="text-xs text-muted-foreground">{item.customerPhone || "—"}</p>
                      </td>
                      <td className="px-3 py-3">
                        <p>{item.originLabel || "—"}</p>
                        <p className="text-xs text-muted-foreground">→ {item.destinationLabel || "—"}</p>
                      </td>
                      <td className="px-3 py-3">{item.carrierName || "Еще не выбран"}</td>
                      <td className="px-3 py-3">
                        <Badge variant="outline">{statusLabel(item.status)}</Badge>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {item.priceRub != null ? `${item.priceRub.toLocaleString("ru-RU")} ₽` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {nextCursor ? (
            <Button type="button" variant="outline" onClick={() => void loadRegistry(nextCursor)} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Показать еще
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
