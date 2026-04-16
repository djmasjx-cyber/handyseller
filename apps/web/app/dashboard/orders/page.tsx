"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@handyseller/ui"
import { ShoppingCart, Loader2, RefreshCw, Package } from "lucide-react"

interface OrderItem {
  id: string
  quantity: number
  price: string | number
  product?: { title: string; article?: string; sku?: string; barcodeWb?: string; barcodeOzon?: string }
  productBarcodeWb?: string | null
  productBarcodeOzon?: string | null
}

interface Order {
  id: string
  marketplace: string
  externalId: string
  status: string
  totalAmount: string | number
  warehouseName?: string | null
  rawStatus?: string | null
  processingTimeMin?: number | null
  holdUntil?: string | null
  createdAt: string
  items: OrderItem[]
  wbStickerNumber?: string | null
  ozonPostingNumber?: string | null
  salesSource?: string | null
  isFbo?: boolean | null
}

const STATUS_LABELS: Record<string, string> = {
  NEW: "Новый",
  IN_PROGRESS: "На сборке",
  SHIPPED: "Доставляется",
  READY_FOR_PICKUP: "Готов к выдаче",
  DELIVERED: "Получен клиентом",
  CANCELLED: "Отменён",
}

/** Соответствие rawStatus WB → читаемый статус */
const WB_RAW_STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  confirm: "На сборке",
  confirmed: "На сборке",
  complete: "Доставляется",
  deliver: "Доставляется",
  sorted: "Доставляется",
  shipped: "Доставляется",
  sold: "Получен клиентом",
  receive: "Получен клиентом",
  delivered: "Получен клиентом",
  waiting: "На сборке",
  ready_for_pickup: "Готов к выдаче",
  postponed_delivery: "Доставка отложена",
  canceled: "Отменён",
  canceled_by_client: "Покупатель отказался",
  declined_by_client: "Покупатель отказался",
  defect: "Отмена из‑за дефекта",
  reject: "Покупатель отказался",
  rejected: "Покупатель отказался",
}

/** Стоимость заказа — реальная цена продажи на маркете (только на странице «Все заказы») */
const SHOW_ORDER_PRICES = true

const MARKETPLACE_LABELS: Record<string, { label: string; variant?: "default" | "secondary" | "outline" | "destructive" }> = {
  WILDBERRIES: { label: "WB", variant: "default" },
  OZON: { label: "Ozon", variant: "secondary" },
  YANDEX: { label: "Яндекс", variant: "outline" },
  AVITO: { label: "Avito", variant: "outline" },
  MANUAL: { label: "Ручной", variant: "outline" },
}

function formatMarketplace(mp: string) {
  return MARKETPLACE_LABELS[mp]?.label ?? mp
}

/** Для MANUAL заказов показываем введённый источник продажи (Авито, Инстаграм и т.д.) */
function getSourceDisplay(order: Order): string {
  if (order.marketplace === "MANUAL" && order.salesSource?.trim()) {
    return order.salesSource.trim()
  }
  return formatMarketplace(order.marketplace)
}

/** Цвета маркетплейсов для бейджей */
const MARKETPLACE_COLORS: Record<string, { bg: string; hover: string }> = {
  WILDBERRIES: { bg: "#CB11AB", hover: "#B00E99" },
  OZON: { bg: "#005BFF", hover: "#004FDD" },
  YANDEX: { bg: "#FC3F1D", hover: "#E33819" },
  AVITO: { bg: "#7FBA00", hover: "#6FA300" },
}

/** Бейдж источника: маркетплейс + прикреплённый FBO (два сцепленных овала) */
function SourceBadge({ order }: { order: Order }) {
  const colors = MARKETPLACE_COLORS[order.marketplace]
  const baseClass = colors
    ? "!border-[var(--mp-bg)] text-white"
    : ""
  const style = colors ? { "--mp-bg": colors.bg, "--mp-hover": colors.hover } as React.CSSProperties : undefined

  return (
    <span className="relative inline-flex items-center">
      <Badge
        variant={MARKETPLACE_LABELS[order.marketplace]?.variant ?? "outline"}
        className={
          colors
            ? `!bg-[var(--mp-bg)] hover:!bg-[var(--mp-hover)] ${baseClass}`
            : undefined
        }
        style={style}
      >
        {getSourceDisplay(order)}
      </Badge>
      {order.isFbo === true && (
        <span
          className="absolute -top-3 -right-0.5 min-w-[1.25rem] h-4 px-1 rounded-full text-[9px] font-medium flex items-center justify-center shadow-sm"
          style={colors ? { backgroundColor: colors.bg, color: "white", border: `1px solid ${colors.bg}` } : { backgroundColor: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))" }}
          title="FBO — товар со склада маркетплейса"
        >
          FBO
        </span>
      )}
    </span>
  )
}

function isInHold(order: Order): boolean {
  if (order.status !== "NEW" || !order.holdUntil) return false
  return new Date(order.holdUntil) > new Date()
}

function holdRemaining(order: Order): string {
  if (!order.holdUntil) return ""
  const end = new Date(order.holdUntil)
  const now = new Date()
  if (end <= now) return "Холд истёк"
  const ms = end.getTime() - now.getTime()
  const min = Math.floor(ms / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  return `${min}:${sec.toString().padStart(2, "0")}`
}

function formatStatus(order: Order): string {
  if (order.rawStatus) {
    const label = WB_RAW_STATUS_LABELS[order.rawStatus.toLowerCase()]
    if (label) return label
  }
  return STATUS_LABELS[order.status] ?? order.status
}

/** Время обработки: от «создан» до «сдача в пункт приема» (отсканирован), в часах */
function formatProcessingTime(min?: number | null): string {
  if (min == null || min < 0) return "—"
  const hours = min / 60
  if (hours < 1) return `${hours.toFixed(1)} ч`
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`
}

export default function OrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncingError, setSyncingError] = useState<string | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const PAGE_SIZE = 20
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [ordersTotal, setOrdersTotal] = useState(0)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  type OrdersSortKey = "totalAmount" | "warehouse" | "status" | "processingTime"
  type SortDirection = "asc" | "desc"
  const [sortKey, setSortKey] = useState<OrdersSortKey>("totalAmount")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null

  const fetchOrders = useCallback(async (reset = true) => {
    if (!token) return
    const nextOffset = reset ? 0 : offset
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
      sortBy: sortKey,
      sortDirection,
    })
    try {
      const res = await fetch(`/api/orders/paged?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json().catch(() => ({}))
      const items = Array.isArray(data?.items) ? data.items : []
      setOrders((prev) => (reset ? items : [...prev, ...items]))
      setHasMore(Boolean(data?.hasMore))
      setOffset(nextOffset + items.length)
      setOrdersTotal(typeof data?.total === "number" ? data.total : 0)
    } catch {
      if (reset) setOrders([])
    } finally {
      setLoading(false)
    }
  }, [token, offset, sortKey, sortDirection])

  useEffect(() => {
    if (!token) {
      router.push("/login")
      return
    }
    fetchOrders(true)
    const doSync = async () => {
      try {
        const res = await fetch("/api/orders/sync", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          fetchOrders(true)
          if (Array.isArray(data.errors) && data.errors.length > 0) {
            setSyncingError(`Ошибки: ${data.errors.join("; ")}`)
          }
        }
      } catch {
        /* автосинк — тихо */
      }
    }
    doSync()
    const refreshSilently = async () => {
      await doSync()
      fetchOrders(true)
    }
    const t = setInterval(refreshSilently, 60000)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSilently()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      clearInterval(t)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [router, token, fetchOrders])

  useEffect(() => {
    if (!token) return
    setLoading(true)
    fetchOrders(true)
  }, [token, sortKey, sortDirection, fetchOrders])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasMore || loading || loadingMore) return
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return
      setLoadingMore(true)
      fetchOrders(false).finally(() => setLoadingMore(false))
    }, { rootMargin: "300px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [fetchOrders, hasMore, loading, loadingMore])

  // Обновление таймера холда каждую секунду
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const hasHold = orders.some(isInHold)
    if (!hasHold) return
    const t = setInterval(() => setTick((c) => c + 1), 1000)
    return () => clearInterval(t)
  }, [orders, tick])

  const doSync = async (days?: number) => {
    if (!token) return
    setSyncing(true)
    setSyncingError(null)
    try {
      const url = days ? `/api/orders/sync?days=${days}` : "/api/orders/sync"
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("accessToken")
          router.push("/login")
          return
        }
        const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message || `Ошибка ${res.status}`
        setSyncingError(String(msg))
        return
      }
      fetchOrders()
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        setSyncingError(`Синхронизировано: ${data.synced ?? 0}. Ошибки: ${data.errors.join("; ")}`)
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleSync = () => doSync()
  const handleFullSync = () => doSync(365)

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    if (!token) return
    setStatusUpdatingId(orderId)
    setStatusError(null)
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message || `Ошибка ${res.status}`
        setStatusError(String(msg))
        return
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      )
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const handleWbDebug = async () => {
    if (!token) return
    try {
      const res = await fetch("/api/orders/wb-raw", { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json().catch(() => ({}))
      const fromWb = data.ordersFromWb ?? []
      const samples = data.productSamples ?? []
      const msg = [
        `Заказов с WB: ${fromWb.length}`,
        fromWb.length ? `Примеры nmId: ${fromWb.slice(0, 5).map((o: { productId?: string }) => o.productId).join(", ")}` : "",
        `Товаров в каталоге: ${data.productsCount ?? 0}`,
        samples.length ? `Артикулы/SKU: ${samples.map((p: { article?: string; sku?: string }) => p.article || p.sku || "—").join(", ")}` : "",
      ].filter(Boolean).join("\n")
      alert(msg)
    } catch {
      alert("Ошибка диагностики")
    }
  }

  const toggleSort = (key: OrdersSortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDirection((prevDir) => (prevDir === "desc" ? "asc" : "desc"))
        return prevKey
      }
      setSortDirection("desc")
      return key
    })
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
      {/* Мобильная верстка: заголовок + кнопка в одну строку, описание на всю ширину */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        <div className="flex flex-row md:flex-col items-center md:items-start justify-between md:justify-start gap-2 w-full md:w-auto">
          <h1 className="text-2xl md:text-3xl font-bold">Заказы</h1>
          <Button
            variant="outline"
            size="sm"
            className="md:hidden h-8 px-2.5 text-xs shrink-0 touch-manipulation"
            onClick={handleSync}
            disabled={syncing}
            title="Синхронизировать"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            <span className="ml-1">Синхр.</span>
          </Button>
        </div>
        <p className="text-muted-foreground text-sm w-full md:max-w-md">
          Заказы синхронизируются каждые 5 мин. Холд 1 ч — после него автоматический переход в «На сборке» при наличии остатка.
        </p>
        <div className="hidden md:flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} title="Обновить сейчас (14 дней)">
            {syncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Синхронизировать
          </Button>
          <Button variant="outline" size="sm" onClick={handleFullSync} disabled={syncing} title="Подтянуть все заказы FBO за год">
            Полная синхр. (365 дн.)
          </Button>
          <Button variant="ghost" size="sm" onClick={handleWbDebug} title="Проверить заказы с WB">
            Диагностика WB
          </Button>
        </div>
      </div>

      {syncingError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {syncingError}
        </div>
      )}
      {statusError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {statusError}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShoppingCart className="h-5 w-5" />
            Список заказов
          </CardTitle>
          <CardDescription>
            {ordersTotal}{" "}
            {ordersTotal === 1 ? "заказ" : ordersTotal < 5 ? "заказа" : "заказов"}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="overflow-x-auto font-sans">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3">Дата</th>
                  <th className="text-left font-medium p-3">Источник</th>
                  <th className="text-left font-medium p-3">№ заказа</th>
                  <th className="text-left font-medium p-3">Товар</th>
                  {SHOW_ORDER_PRICES && (
                    <th className="text-right font-medium p-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-primary"
                        onClick={() => toggleSort("totalAmount")}
                      >
                        Стоимость
                        {sortKey === "totalAmount" && (
                          <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                        )}
                      </button>
                    </th>
                  )}
                  <th className="text-left font-medium p-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      onClick={() => toggleSort("warehouse")}
                    >
                      Склад
                      {sortKey === "warehouse" && (
                        <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                      )}
                    </button>
                  </th>
                  <th className="text-left font-medium p-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      onClick={() => toggleSort("status")}
                    >
                      Статус
                      {sortKey === "status" && (
                        <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                      )}
                    </button>
                  </th>
                  <th
                    className="text-left font-medium p-3"
                    title="от создан до сдачи в пункт приема (отсканирован)"
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      onClick={() => toggleSort("processingTime")}
                    >
                      Время обработки
                      {sortKey === "processingTime" && (
                        <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                      )}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={SHOW_ORDER_PRICES ? 8 : 7} className="p-8 text-center text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Заказов пока нет</p>
                      <p className="text-xs mt-1">
                        Заказы подтягиваются автоматически каждые 5 мин
                      </p>
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => {
                    const item = order.items[0]
                    const rawTitle = item?.product?.title?.trim() ?? ""
                    const article = item?.product?.article ?? item?.product?.sku ?? ""
                    const looksLikeArticle = /^[a-zA-Z0-9_-]{1,25}$/.test(rawTitle)
                    const productName =
                      rawTitle && !looksLikeArticle
                        ? rawTitle
                        : article
                          ? article
                          : "—"
                    const inHold = isInHold(order)

                    return (
                      <tr key={order.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 text-muted-foreground whitespace-nowrap">
                          <span className="block">
                            {new Date(order.createdAt).toLocaleDateString("ru-RU", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </span>
                          <span className="block text-xs text-muted-foreground/80">
                            {new Date(order.createdAt).toLocaleTimeString("ru-RU", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </td>
                        <td className="p-3">
                          <SourceBadge order={order} />
                        </td>
                        <td className="p-3 text-xs">{order.externalId}</td>
                        <td className="p-3">
                          <span className="font-medium">{productName}</span>
                        </td>
                        {SHOW_ORDER_PRICES && (
                          <td className="p-3 text-right font-medium">
                            {Number(order.totalAmount).toLocaleString("ru-RU")} ₽
                          </td>
                        )}
                        <td className="p-3 text-muted-foreground text-sm">
                          {order.warehouseName ?? "—"}
                        </td>
                        <td className="p-3">
                          {order.marketplace === "MANUAL" ? (
                            <select
                              value={order.status}
                              disabled={!!statusUpdatingId}
                              onChange={(e) => handleStatusChange(order.id, e.target.value)}
                              className="text-sm font-medium rounded border bg-background px-2 py-1 min-w-[140px] disabled:opacity-50"
                            >
                              {Object.entries(STATUS_LABELS).map(([val, label]) => (
                                <option key={val} value={val}>{label}</option>
                              ))}
                            </select>
                          ) : (
                            <>
                              <span className="font-medium">
                                {formatStatus(order)}
                              </span>
                              {inHold && (
                                <span className="block text-xs text-amber-600">
                                  Холд: {holdRemaining(order)}
                                </span>
                              )}
                            </>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground text-sm">
                          {formatProcessingTime(order.processingTimeMin)}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <div ref={loadMoreRef} className="h-8 flex items-center justify-center text-xs text-muted-foreground">
        {loadingMore ? "Загрузка..." : hasMore ? "Прокрутите вниз для загрузки" : "Все записи загружены"}
      </div>
    </div>
  )
}
