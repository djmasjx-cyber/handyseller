"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, Label } from "@handyseller/ui"
import { Loader2, RefreshCw, Package, Printer, Send, Box, Truck, QrCode } from "lucide-react"
import { PrintLabelsModal } from "@/components/print-labels-modal"

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
  waiting: "Ожидание",
  ready_for_pickup: "Готов к выдаче",
  postponed_delivery: "Доставка отложена",
  canceled: "Отменён",
  canceled_by_client: "Покупатель отказался",
  declined_by_client: "Покупатель отказался",
  defect: "Отмена из‑за дефекта",
  reject: "Покупатель отказался",
  rejected: "Покупатель отказался",
}

/** Временно скрыто: ценообразование WB в разработке */
const SHOW_ORDER_PRICES = false

const MARKETPLACE_LABELS: Record<string, { label: string; variant?: "default" | "secondary" | "outline" | "destructive" }> = {
  WILDBERRIES: { label: "WB", variant: "default" },
  OZON: { label: "Ozon", variant: "secondary" },
  YANDEX: { label: "Яндекс", variant: "outline" },
  AVITO: { label: "Avito", variant: "outline" },
}

function formatMarketplace(mp: string) {
  return MARKETPLACE_LABELS[mp]?.label ?? mp
}

function formatStatus(order: Order): string {
  if (order.rawStatus) {
    const label = WB_RAW_STATUS_LABELS[order.rawStatus.toLowerCase()]
    if (label) return label
  }
  return STATUS_LABELS[order.status] ?? order.status
}

function formatProcessingTime(min?: number | null): string {
  if (min == null || min < 0) return "—"
  const hours = min / 60
  if (hours < 1) return `${hours.toFixed(1)} ч`
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`
}

/** Финальные статусы — не показывать на странице «На сборке» */
const FINAL_STATUSES = new Set(["SHIPPED", "READY_FOR_PICKUP", "DELIVERED", "CANCELLED"])
const FINAL_RAW_STATUSES = new Set([
  "sold", "canceled", "canceled_by_client", "declined_by_client", "defect", "receive", "reject", "complete", "delivered",
  "ready_for_pickup", "waiting",
])
function isFinalOrder(o: Order): boolean {
  if (FINAL_STATUSES.has(o.status)) return true
  if (o.rawStatus && FINAL_RAW_STATUSES.has(o.rawStatus.toLowerCase())) return true
  return false
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

export default function OrdersAssemblyPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncingError, setSyncingError] = useState<string | null>(null)
  const [printOrder, setPrintOrder] = useState<Order | null>(null)
  const [printLabelType, setPrintLabelType] = useState<"product" | "order">("product")

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null
  const [statusError, setStatusError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [retryError, setRetryError] = useState<string | null>(null)
  const [retrySuccessId, setRetrySuccessId] = useState<string | null>(null)
  const [wbSupply, setWbSupply] = useState<{ supplyId: string; trbxes: Array<{ id: string }> } | null>(null)
  const [wbSupplyLoading, setWbSupplyLoading] = useState(false)
  const [wbSupplyError, setWbSupplyError] = useState<string | null>(null)
  const [wbSupplyAction, setWbSupplyAction] = useState<string | null>(null)
  const [wbSupplyBarcode, setWbSupplyBarcode] = useState<string | null>(null)
  const [trbxLabelSize, setTrbxLabelSize] = useState<"60x40" | "40x25">("60x40")
  const assemblyOrders = orders.filter(
    (o) => (o.status === "IN_PROGRESS" || o.status === "NEW") && !isFinalOrder(o)
  )

  const fetchOrders = () => {
    if (!token) return
    return fetch("/api/orders", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
  }

  const hasWbInProgress = assemblyOrders.some((o) => o.marketplace === "WILDBERRIES" && o.status === "IN_PROGRESS")

  const fetchWbSupply = () => {
    if (!token || !hasWbInProgress) {
      setWbSupply(null)
      setWbSupplyError(null)
      return
    }
    setWbSupplyLoading(true)
    setWbSupplyError(null)
    fetch("/api/marketplaces/wb-supply", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (ok && data?.supplyId) setWbSupply({ supplyId: data.supplyId, trbxes: data.trbxes ?? [] })
        else {
          setWbSupply(null)
          if (!ok && data?.message) setWbSupplyError(data.message)
        }
      })
      .catch(() => setWbSupply(null))
      .finally(() => setWbSupplyLoading(false))
  }

  useEffect(() => {
    if (hasWbInProgress) fetchWbSupply()
    else setWbSupply(null)
  }, [hasWbInProgress, token])

  useEffect(() => {
    if (!token) {
      router.push("/login")
      return
    }
    const refreshSilently = async () => {
      try {
        const res = await fetch("/api/orders/sync", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message || `Ошибка ${res.status}`
          setSyncingError(String(msg))
        } else {
          setSyncingError(null)
        }
        await fetchOrders()
      } catch {
        /* фоновое обновление — тихо, не мешаем пользователю */
      }
    }
    const initialLoad = async () => {
      setLoading(true)
      setSyncingError(null)
      try {
        await refreshSilently()
      } catch {
        setSyncingError("Ошибка загрузки")
      } finally {
        setLoading(false)
      }
    }
    initialLoad()
    const t = setInterval(refreshSilently, 60000)
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshSilently()
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      clearInterval(t)
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [router, token])

  const handleSync = async () => {
    if (!token) return
    setSyncing(true)
    setSyncingError(null)
    try {
      const res = await fetch("/api/orders/sync", {
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
    } finally {
      setSyncing(false)
    }
  }

  const handleRetryWbPush = async (order: Order) => {
    if (!token || order.marketplace !== "WILDBERRIES" || order.status !== "IN_PROGRESS") return
    setRetryingId(order.id)
    setRetryError(null)
    try {
      const res = await fetch(`/api/orders/${order.id}/retry-wb-push`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRetryError(data.message ?? data.error ?? "Ошибка отправки")
        return
      }
      if (data.ok) {
        setRetryError(null)
        setRetrySuccessId(order.id)
        setTimeout(() => setRetrySuccessId(null), 3000)
      } else {
        setRetryError(data.message ?? "Не удалось отправить")
      }
    } finally {
      setRetryingId(null)
    }
  }

  const handleSetInProgress = async (order: Order) => {
    if (!token) return
    setUpdatingId(order.id)
    setStatusError(null)
    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message || `Ошибка ${res.status}`
        setStatusError(String(msg))
        return
      }
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, status: "IN_PROGRESS" } : o))
      )
    } finally {
      setUpdatingId(null)
    }
  }

  const [tick, setTick] = useState(0)
  useEffect(() => {
    const hasHold = assemblyOrders.some(isInHold)
    if (!hasHold) return
    const t = setInterval(() => setTick((c) => c + 1), 1000)
    return () => clearInterval(t)
  }, [assemblyOrders, tick])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
        <div className="flex flex-row md:flex-col items-center md:items-start justify-between md:justify-start gap-2 w-full md:w-auto">
          <h1 className="text-2xl md:text-3xl font-bold">Заказы на сборке</h1>
          <Button
            variant="outline"
            size="sm"
            className="md:hidden h-8 px-2.5 text-xs shrink-0 touch-manipulation"
            onClick={handleSync}
            disabled={syncing}
            title="Синхронизировать"
          >
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1">Синхр.</span>
          </Button>
        </div>
        <p className="text-muted-foreground text-sm w-full md:max-w-md">
          Заказы «Новые» и «На сборке» — можно печатать стикеры и этикетки (для WB/Ozon — при статусе «На сборке»).
        </p>
        <div className="hidden md:flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing} title="Обновить сейчас">
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Синхронизировать
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/orders">Все заказы</Link>
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
      {retryError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {retryError}
        </div>
      )}

      {hasWbInProgress && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Truck className="h-5 w-5" />
              Поставка WB — сдача на СЦ или ПВЗ
            </CardTitle>
            <CardDescription>
              Этикетки заказов уже есть. Добавьте коробки → распечатайте QR коробок (WB-MP-xxx) → наклейте на коробки → сдайте в доставку. При сдаче на ПВЗ достаточно QR коробок. QR поставки нужен только при сдаче на сортировочный центр (СЦ).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {wbSupplyLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Загрузка поставки...
              </div>
            )}
            {wbSupplyError && (
              <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {wbSupplyError}
              </div>
            )}
            {wbSupply && !wbSupplyLoading && (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Поставка:</span>
                  <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{wbSupply.supplyId}</code>
                  <span className="text-muted-foreground">Грузомест: {wbSupply.trbxes.length}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="trbx-size" className="text-xs text-muted-foreground whitespace-nowrap">
                      Этикетки:
                    </Label>
                    <select
                      id="trbx-size"
                      value={trbxLabelSize}
                      onChange={(e) => setTrbxLabelSize(e.target.value as "60x40" | "40x25")}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="60x40">60×40 мм</option>
                      <option value="40x25">40×25 мм</option>
                    </select>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!wbSupplyAction}
                    onClick={async () => {
                      if (!token) return
                      setWbSupplyAction("add")
                      setWbSupplyError(null)
                      try {
                        const res = await fetch("/api/marketplaces/wb-supply/trbx", {
                          method: "POST",
                          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                          body: JSON.stringify({ amount: 1 }),
                        })
                        const data = await res.json().catch(() => ({}))
                        if (!res.ok) {
                          setWbSupplyError(data.message ?? "Ошибка")
                          return
                        }
                        fetchWbSupply()
                      } finally {
                        setWbSupplyAction(null)
                      }
                    }}
                  >
                    {wbSupplyAction === "add" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Box className="h-3.5 w-3.5 mr-1" />}
                    Добавить коробку
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!wbSupplyAction || wbSupply.trbxes.length === 0}
                    onClick={async () => {
                      if (!token || wbSupply.trbxes.length === 0) return
                      setWbSupplyAction("stickers")
                      setWbSupplyError(null)
                      try {
                        const res = await fetch("/api/marketplaces/wb-supply/trbx/stickers?type=png", {
                          headers: { Authorization: `Bearer ${token}` },
                        })
                        const data = await res.json().catch(() => ({}))
                        if (!res.ok) {
                          setWbSupplyError(data.message ?? "Ошибка")
                          return
                        }
                        const stickers = data.stickers ?? []
                        if (stickers.length > 0) {
                          const dim = trbxLabelSize === "60x40"
                            ? { w: "60mm", h: "40mm" }
                            : { w: "40mm", h: "25mm" }
                          const w = window.open("", "_blank")
                          if (w) {
                            w.document.write(`
                              <!DOCTYPE html>
                              <html><head><title>Стикеры грузомест</title>
                              <style>
                                @page { size: ${dim.w} ${dim.h}; margin: 0; }
                                body { margin: 0; padding: 0; }
                                .label { width: ${dim.w}; height: ${dim.h}; box-sizing: border-box;
                                  padding: 0.5mm; display: flex; align-items: center; justify-content: center;
                                  page-break-after: always; overflow: hidden; page-break-inside: avoid;
                                  min-width: unset !important; min-height: unset !important; }
                                .label:last-child { page-break-after: auto; }
                                .label img { max-width: 100% !important; max-height: 100% !important; width: auto !important; height: auto !important; object-fit: contain !important; }
                                @media print { .label { width: ${dim.w} !important; height: ${dim.h} !important; overflow: hidden !important; min-width: unset !important; min-height: unset !important; } }
                              </style></head>
                              <body>
                              ${stickers.map((s: { trbxId: string; file: string }) => `<div class="label"><img src="data:image/png;base64,${s.file}" alt="${s.trbxId}" /></div>`).join("")}
                              </body></html>`)
                            w.document.close()
                            w.focus()
                            setTimeout(() => { w.print(); w.close() }, 250)
                          }
                        }
                      } finally {
                        setWbSupplyAction(null)
                      }
                    }}
                  >
                    {wbSupplyAction === "stickers" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Printer className="h-3.5 w-3.5 mr-1" />}
                    QR коробок (стикеры грузомест)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!wbSupplyAction}
                    onClick={async () => {
                      if (!token) return
                      setWbSupplyAction("deliver")
                      setWbSupplyError(null)
                      try {
                        const res = await fetch("/api/marketplaces/wb-supply/deliver", {
                          method: "POST",
                          headers: { Authorization: `Bearer ${token}` },
                        })
                        const data = await res.json().catch(() => ({}))
                        if (!res.ok) {
                          setWbSupplyError(data.message ?? "Ошибка")
                          return
                        }
                        if (data.ok) {
                          setWbSupplyBarcode("ready")
                          fetchWbSupply()
                        } else {
                          setWbSupplyError(data.message ?? "Не удалось сдать")
                        }
                      } finally {
                        setWbSupplyAction(null)
                      }
                    }}
                  >
                    {wbSupplyAction === "deliver" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Truck className="h-3.5 w-3.5 mr-1" />}
                    Сдать в доставку
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!!wbSupplyAction}
                    title={wbSupplyBarcode ? "Распечатать QR поставки для сдачи на СЦ" : "QR доступен только после «Сдать в доставку». Нужен только при сдаче на СЦ."}
                    onClick={async () => {
                      if (!token) return
                      setWbSupplyAction("barcode")
                      setWbSupplyError(null)
                      try {
                        const res = await fetch("/api/marketplaces/wb-supply/barcode?type=png", {
                          headers: { Authorization: `Bearer ${token}` },
                        })
                        const data = await res.json().catch(() => ({}))
                        if (!res.ok) {
                          setWbSupplyError(data.message ?? "Сначала сдайте поставку в доставку")
                          return
                        }
                        if (data.file) {
                          const w = window.open("", "_blank")
                          if (w) {
                            w.document.write(`
                              <!DOCTYPE html><html><head><title>QR поставки для СЦ</title></head><body style="margin:0;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:16px;">
                              <h2 style="margin-bottom:16px;">QR-код поставки для СЦ</h2>
                              <p style="margin-bottom:8px;font-size:14px;">${data.barcode ?? ""}</p>
                              <img src="data:image/png;base64,${data.file}" alt="QR" style="max-width:300px;height:auto;" />
                              </body></html>`)
                            w.document.close()
                            w.print()
                          }
                        }
                      } finally {
                        setWbSupplyAction(null)
                      }
                    }}
                  >
                    {wbSupplyAction === "barcode" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <QrCode className="h-3.5 w-3.5 mr-1" />}
                    QR поставки (для СЦ)
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {wbSupplyBarcode
                    ? "QR поставки доступен. Нужен только при сдаче на СЦ — распечатайте и покажите при приёмке."
                    : "При ПВЗ: QR коробок достаточно. При СЦ: 1) Добавить коробку 2) QR коробок — наклейте на коробки 3) Сдать в доставку 4) QR поставки — покажите при сдаче на СЦ"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-5 w-5" />
            Список заказов на сборке
          </CardTitle>
          <CardDescription>
            {assemblyOrders.length}{" "}
            {assemblyOrders.length === 1 ? "заказ" : assemblyOrders.length < 5 ? "заказа" : "заказов"}
            {" (Новые + На сборке)"}
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
                  {SHOW_ORDER_PRICES && <th className="text-right font-medium p-3">Стоимость</th>}
                  <th className="text-left font-medium p-3">Склад</th>
                  <th className="text-left font-medium p-3">Статус</th>
                  <th className="text-left font-medium p-3" title="от создан до сдачи в пункт приема (отсканирован)">
                    Время обработки
                  </th>
                  <th className="text-right font-medium p-3"></th>
                </tr>
              </thead>
              <tbody>
                {assemblyOrders.length === 0 ? (
                  <tr>
                    <td colSpan={SHOW_ORDER_PRICES ? 9 : 8} className="p-8 text-center text-muted-foreground">
                      <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>Нет заказов «Новых» и «На сборке»</p>
                      <p className="text-xs mt-1">
                        <Link href="/dashboard/orders" className="text-primary hover:underline">
                          Все заказы
                        </Link>
                      </p>
                    </td>
                  </tr>
                ) : (
                  assemblyOrders.map((order) => {
                    const item = order.items[0]
                    const rawTitle = item?.product?.title?.trim() ?? ""
                    const article = item?.product?.article ?? item?.product?.sku ?? ""
                    const looksLikeArticle = /^[a-zA-Z0-9_-]{1,25}$/.test(rawTitle)
                    const productName =
                      rawTitle && !looksLikeArticle ? rawTitle : article ? article : "—"

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
                          <Badge
                            variant={MARKETPLACE_LABELS[order.marketplace]?.variant ?? "outline"}
                            className={
                              order.marketplace === "WILDBERRIES"
                                ? "!bg-[#CB11AB] !border-[#CB11AB] text-white hover:!bg-[#B00E99]"
                                : order.marketplace === "OZON"
                                  ? "!bg-[#005BFF] !border-[#005BFF] text-white hover:!bg-[#004FDD]"
                                  : order.marketplace === "YANDEX"
                                    ? "!bg-[#FC3F1D] !border-[#FC3F1D] text-white hover:!bg-[#E33819]"
                                    : order.marketplace === "AVITO"
                                      ? "!bg-[#7FBA00] !border-[#7FBA00] text-white hover:!bg-[#6FA300]"
                                      : undefined
                            }
                          >
                            {formatMarketplace(order.marketplace)}
                          </Badge>
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
                          <span className="font-medium">{formatStatus(order)}</span>
                          {isInHold(order) && (
                            <span className="block text-xs text-amber-600">
                              Холд: {holdRemaining(order)}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-muted-foreground text-sm">
                          {formatProcessingTime(order.processingTimeMin)}
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            {(order.marketplace === "WILDBERRIES" || order.marketplace === "OZON") && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2"
                                  onClick={() => {
                                    setPrintOrder(order)
                                    setPrintLabelType("product")
                                  }}
                                  title="Печать этикетки товара"
                                >
                                  <Printer className="h-3.5 w-3.5 mr-1" />
                                  <span className="hidden sm:inline">Товар</span>
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-2"
                                  onClick={() => {
                                    setPrintOrder(order)
                                    setPrintLabelType("order")
                                  }}
                                  title="Печать этикетки заказа"
                                >
                                  <Printer className="h-3.5 w-3.5 mr-1" />
                                  <span className="hidden sm:inline">Заказ</span>
                                </Button>
                              </>
                            )}
                            {order.status === "NEW" && !isInHold(order) && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={updatingId === order.id}
                                onClick={() => handleSetInProgress(order)}
                              >
                                {updatingId === order.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "На сборку"
                                )}
                              </Button>
                            )}
                            {order.marketplace === "WILDBERRIES" && order.status === "IN_PROGRESS" && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={retryingId === order.id}
                                onClick={() => handleRetryWbPush(order)}
                                title="Повторить отправку на WB (если статус не обновился)"
                              >
                                {retryingId === order.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : retrySuccessId === order.id ? (
                                  "Отправлено"
                                ) : (
                                  <>
                                    <Send className="h-3.5 w-3.5 mr-1" />
                                    <span className="hidden sm:inline">Отправить на WB</span>
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
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

      {printOrder && (
        <PrintLabelsModal
          open={!!printOrder}
          onClose={() => setPrintOrder(null)}
          order={printOrder}
          labelType={printLabelType}
        />
      )}
    </div>
  )
}
