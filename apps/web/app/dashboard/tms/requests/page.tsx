"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@handyseller/ui"
import { Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { extractApiError, normalizeMessageLines } from "@/lib/api-error"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { createTmsShipmentRequestFromOrder } from "@/lib/tms-create-request-from-order"

type LogisticsScenario = "MARKETPLACE_RC" | "CARRIER_DELIVERY"

type ShipmentRequest = {
  id: string
  status: string
  selectedQuoteId?: string
  createdAt: string
  snapshot: {
    coreOrderNumber: string
    marketplace: string
    /** Сценарий из core: маркетплейс до РЦ vs доставка через ТК (клиент / ручной канал). */
    logisticsScenario?: LogisticsScenario
    /** Зарезервировано: перемещения между филиалами (появится в API заказа). */
    tmsWorkType?: "CUSTOMER_DELIVERY" | "INTERNAL_TRANSFER"
  }
  draft: { originLabel: string; destinationLabel: string; serviceFlags: string[] }
}

type Quote = {
  id: string
  carrierId: string
  carrierName: string
  priceRub: number
  etaDays: number
  score: number
  serviceFlags?: string[]
  notes?: string
  priceDetails?: {
    source?: string
    totalRub?: number
    tariffRub?: number
    insuranceRub?: number
    extrasRub?: number
    currency?: string
    comment?: string
  }
}

const SERVICE_LABELS: Record<string, string> = {
  EXPRESS: "Экспресс",
  HAZMAT: "Опасный груз",
  CONSOLIDATED: "Сборный",
  AIR: "Авиа",
  OVERSIZED: "Негабарит",
}

function requestStatusLabel(value: string) {
  switch (value) {
    case "DRAFT":
      return "Тарифы не получены"
    case "QUOTED":
      return "Есть варианты"
    case "BOOKED":
      return "Выбран перевозчик"
    default:
      return value
  }
}

function formatServiceFlags(flags: string[] | undefined): string {
  if (!flags?.length) return "—"
  return flags.map((f) => SERVICE_LABELS[f] ?? f).join(" · ")
}

function isManualCustomerDelivery(item: ShipmentRequest): boolean {
  const marketplace = item.snapshot.marketplace?.trim().toUpperCase()
  return (
    item.snapshot.logisticsScenario === "CARRIER_DELIVERY" ||
    item.snapshot.tmsWorkType === "CUSTOMER_DELIVERY" ||
    marketplace === "MANUAL" ||
    marketplace === "РУЧНОЙ" ||
    marketplace === "РУЧНОЙ ЗАКАЗ"
  )
}

function quoteMatchesDraft(quote: Quote, draftFlags: string[]): boolean {
  if (!draftFlags.length) return true
  const qf = quote.serviceFlags ?? []
  return draftFlags.every((f) => qf.includes(f))
}

function pickQuoteForCarrier(
  quotes: Quote[],
  carrierId: string,
  draftFlags: string[],
): Quote | null {
  const exact = quotes
    .filter((q) => q.carrierId === carrierId && quoteMatchesDraft(q, draftFlags))
    .sort((a, b) => a.priceRub - b.priceRub)
  const pool = exact.length ? exact : quotes.filter((q) => q.carrierId === carrierId).sort((a, b) => a.priceRub - b.priceRub)
  if (!pool.length) return null
  return pool[0]
}

function quotesForCarrier(quotes: Quote[], carrierId: string, draftFlags: string[]): Quote[] {
  const exact = quotes
    .filter((q) => q.carrierId === carrierId && quoteMatchesDraft(q, draftFlags))
    .sort((a, b) => a.priceRub - b.priceRub)
  const fallback = quotes.filter((q) => q.carrierId === carrierId).sort((a, b) => a.priceRub - b.priceRub)
  return exact.length ? exact : fallback
}

function displayRub(value: number, carrierId?: string): number {
  if (!Number.isFinite(value)) return value
  if (carrierId === "major-express") return Math.ceil(value)
  return value
}

function QuoteDetails({ quote }: { quote: Quote }) {
  const price = quote.priceDetails
  const variantLabel = quote.notes?.split("·")[0]?.trim() ?? "Вариант"
  return (
    <div className="space-y-1 text-xs">
      <p className="font-medium text-foreground">{variantLabel}</p>
      <p className="text-muted-foreground">Срок: {quote.etaDays} дн.</p>
      <p className="font-semibold text-foreground">Итог: {displayRub(quote.priceRub, quote.carrierId).toLocaleString("ru-RU")} ₽</p>
      {price?.tariffRub != null ? <p className="text-muted-foreground">Тариф: {displayRub(price.tariffRub, quote.carrierId).toLocaleString("ru-RU")} ₽</p> : null}
      {price?.insuranceRub != null ? (
        <p className="text-muted-foreground">Страховка: {displayRub(price.insuranceRub, quote.carrierId).toLocaleString("ru-RU")} ₽</p>
      ) : null}
      {price?.extrasRub != null && price.extrasRub > 0 ? (
        <p className="text-muted-foreground">Доп. услуги: {displayRub(price.extrasRub, quote.carrierId).toLocaleString("ru-RU")} ₽</p>
      ) : null}
      {price?.comment ? <p className="text-muted-foreground">{price.comment}</p> : null}
    </div>
  )
}

function QuoteTile({
  quote,
  selected,
  busy,
  canPick,
  disabled,
  onSelect,
}: {
  quote: Quote
  selected: boolean
  busy: boolean
  canPick: boolean
  disabled: boolean
  onSelect: () => void
}) {
  const variantLabel = quote.notes?.split("·")[0]?.trim() ?? "Вариант"
  return (
    <div
      className={`relative min-h-[56px] rounded-md transition-colors ${
        selected ? "ring-2 ring-primary ring-offset-1" : ""
      }`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={`h-full w-full rounded-md px-1 py-1 pr-6 text-left ${
          selected
            ? "bg-primary text-primary-foreground"
            : canPick
              ? "bg-muted/60 hover:bg-primary/15 hover:ring-1 hover:ring-primary/40"
              : "bg-muted/40 opacity-80"
        }`}
      >
        {busy ? (
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        ) : (
          <>
            <div className="text-[10px] leading-tight truncate opacity-90">{variantLabel}</div>
            <div className="text-xs font-semibold tabular-nums leading-tight">
              {displayRub(quote.priceRub, quote.carrierId).toLocaleString("ru-RU")} ₽
            </div>
            <div className="text-[10px] leading-tight opacity-85">{quote.etaDays} дн.</div>
          </>
        )}
      </button>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="absolute right-1 top-1 z-10 h-4 w-4 rounded-full border border-border/70 bg-background/90 text-[10px] leading-none text-muted-foreground"
            onClick={(e) => e.stopPropagation()}
            aria-label="Состав цены"
          >
            i
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" side="top" className="w-72">
          <QuoteDetails quote={quote} />
        </PopoverContent>
      </Popover>
    </div>
  )
}

function collectCarrierColumns(quotesByRequest: Record<string, Quote[]>): Array<{ id: string; name: string }> {
  const map = new Map<string, string>()
  for (const qs of Object.values(quotesByRequest)) {
    for (const q of qs) {
      if (!map.has(q.carrierId)) map.set(q.carrierId, q.carrierName)
    }
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
}

function minFinite(values: number[]): number | null {
  const xs = values.filter((n) => Number.isFinite(n))
  if (!xs.length) return null
  return Math.min(...xs)
}

type SortMode = "newest" | "cheapest_lane" | "fastest_lane" | `carrier:${string}`

/** Очереди работы логиста: одна матрица, разные «входные» потоки заказов. */
type WorkQueueKey = "all" | "MARKETPLACE_RC" | "CARRIER_DELIVERY" | "INTERNAL_TRANSFER"

type ToastState = {
  kind: "success" | "error"
  message: string
} | null

function workQueueFromSearchParam(raw: string | null): WorkQueueKey {
  if (raw === "rc" || raw === "MARKETPLACE_RC") return "MARKETPLACE_RC"
  if (raw === "tk" || raw === "CARRIER_DELIVERY") return "CARRIER_DELIVERY"
  if (raw === "internal" || raw === "INTERNAL_TRANSFER") return "INTERNAL_TRANSFER"
  return "all"
}

export default function TmsRequestsPage() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [items, setItems] = useState<ShipmentRequest[]>([])
  const [quotesByRequest, setQuotesByRequest] = useState<Record<string, Quote[]>>({})
  const [loading, setLoading] = useState(true)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [selectingKey, setSelectingKey] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [expandedVariants, setExpandedVariants] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string[]>([])
  const [success, setSuccess] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [archivingKey, setArchivingKey] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sortMode, setSortMode] = useState<SortMode>("newest")
  const requestIdFromQuery = searchParams.get("requestId")
  const orderIdFromQuery = searchParams.get("orderId")
  const autoQuote = searchParams.get("autoQuote") === "1"
  const autoQuoteTriggeredRef = useRef(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workQueue = workQueueFromSearchParam(searchParams.get("queue"))

  const showToast = useCallback((kind: "success" | "error", message: string) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current)
    }
    setToast({ kind, message })
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, 3500)
  }, [])

  const setWorkQueue = (key: WorkQueueKey) => {
    const next = new URLSearchParams(searchParams.toString())
    if (key === "all") next.delete("queue")
    else next.set("queue", key === "MARKETPLACE_RC" ? "rc" : key === "CARRIER_DELIVERY" ? "tk" : "internal")
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const loadAll = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token) return
      if (!opts?.silent) setError(null)
      const headers = { Authorization: `Bearer ${token}` }
      try {
        const r = await authFetch("/api/tms/shipment-requests?view=operator", { headers })
        const data = r.ok ? await r.json() : []
        const requests = Array.isArray(data) ? data : []
        setItems(requests)
        const quoteEntries = await Promise.all(
          requests.map(async (request: ShipmentRequest) => {
            const res = await authFetch(`/api/tms/shipment-requests/${request.id}/quotes`, { headers })
            const quotes = await res.json().catch(() => [])
            return [request.id, Array.isArray(quotes) ? quotes : []] as const
          }),
        )
        setQuotesByRequest(Object.fromEntries(quoteEntries))
      } catch {
        if (!opts?.silent) setError("Не удалось загрузить расчеты и тарифы")
      }
    },
    [token],
  )

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    void loadAll().finally(() => setLoading(false))
  }, [token, loadAll])

  /** Приток новых заявок без WebSocket: тихое обновление, пока вкладка видима. */
  useEffect(() => {
    if (!token) return
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void loadAll({ silent: true })
      }
    }
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [token, loadAll])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
      }
    }
  }, [])

  /**
   * Авто-создание заявки и расчёт сразу на этой странице (без перехода на дашборд TMS).
   * Ссылка: ?orderId=…&autoQuote=1 — заложено под события/ИИ: тот же URL может выставляться извне.
   */
  useEffect(() => {
    if (!token || !orderIdFromQuery || !autoQuote) return
    if (autoQuoteTriggeredRef.current) return
    autoQuoteTriggeredRef.current = true

    const run = async () => {
      type Row = {
        id: string
        externalId: string
        marketplace: string
        warehouseName?: string | null
        deliveryAddressLabel?: string | null
        requestId?: string
      }
      const headers = { Authorization: `Bearer ${token}` }
      const r = await authFetch("/api/tms/client-orders", { headers })
      const data = r.ok ? await r.json() : []
      const orders = Array.isArray(data) ? (data as Row[]) : []
      const order = orders.find((o) => o.id === orderIdFromQuery)
      if (!order) {
        setError("Заказ не найден в списке клиентских заказов.")
        return
      }

      const nextQs = new URLSearchParams(searchParams.toString())
      nextQs.delete("orderId")
      nextQs.delete("autoQuote")

      if (order.requestId) {
        nextQs.set("requestId", order.requestId)
        router.replace(`${pathname}?${nextQs.toString()}`, { scroll: false })
        await loadAll({ silent: true })
        return
      }

      try {
        const { requestId } = await createTmsShipmentRequestFromOrder(token, order)
        nextQs.set("requestId", requestId)
        router.replace(`${pathname}?${nextQs.toString()}`, { scroll: false })
        await loadAll({ silent: true })
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось создать заявку")
      }
    }

    void run()
  }, [token, orderIdFromQuery, autoQuote, pathname, router, searchParams, loadAll])

  const carrierColumns = useMemo(() => collectCarrierColumns(quotesByRequest), [quotesByRequest])

  const sortedRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = !q
      ? [...items]
      : items.filter((item) => {
          const blob = [
            item.snapshot.coreOrderNumber,
            item.snapshot.marketplace,
            item.draft.originLabel,
            item.draft.destinationLabel,
          ]
            .join(" ")
            .toLowerCase()
          return blob.includes(q)
        })

    if (workQueue === "MARKETPLACE_RC") {
      rows = rows.filter((item) => item.snapshot.logisticsScenario === "MARKETPLACE_RC")
    } else if (workQueue === "CARRIER_DELIVERY") {
      rows = rows.filter((item) => isManualCustomerDelivery(item))
    } else if (workQueue === "INTERNAL_TRANSFER") {
      rows = rows.filter((item) => item.snapshot.tmsWorkType === "INTERNAL_TRANSFER")
    }

    const quotesFor = (id: string) => quotesByRequest[id] ?? []

    const cmpCreated = (a: ShipmentRequest, b: ShipmentRequest) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? "")

    if (sortMode === "newest") {
      rows.sort(cmpCreated)
      return rows
    }

    if (sortMode === "cheapest_lane") {
      rows.sort((a, b) => {
        const pa = minFinite(quotesFor(a.id).map((x) => x.priceRub)) ?? Number.POSITIVE_INFINITY
        const pb = minFinite(quotesFor(b.id).map((x) => x.priceRub)) ?? Number.POSITIVE_INFINITY
        if (pa !== pb) return pa - pb
        return cmpCreated(a, b)
      })
      return rows
    }

    if (sortMode === "fastest_lane") {
      rows.sort((a, b) => {
        const ta = minFinite(quotesFor(a.id).map((x) => x.etaDays)) ?? Number.POSITIVE_INFINITY
        const tb = minFinite(quotesFor(b.id).map((x) => x.etaDays)) ?? Number.POSITIVE_INFINITY
        if (ta !== tb) return ta - tb
        return cmpCreated(a, b)
      })
      return rows
    }

    if (sortMode.startsWith("carrier:")) {
      const cid = sortMode.slice("carrier:".length)
      rows.sort((a, b) => {
        const qa = pickQuoteForCarrier(quotesFor(a.id), cid, a.draft.serviceFlags)?.priceRub ?? Number.POSITIVE_INFINITY
        const qb = pickQuoteForCarrier(quotesFor(b.id), cid, b.draft.serviceFlags)?.priceRub ?? Number.POSITIVE_INFINITY
        if (qa !== qb) return qa - qb
        return cmpCreated(a, b)
      })
      return rows
    }

    rows.sort(cmpCreated)
    return rows
  }, [items, quotesByRequest, search, sortMode, workQueue])
  const visibleIds = useMemo(() => sortedRows.map((item) => item.id), [sortedRows])
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))

  const refreshQuotes = async (requestId: string) => {
    if (!token) return
    setRefreshingId(requestId)
    setError(null)
    setErrorDetails([])
    setSuccess(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const res = await authFetch(`/api/tms/shipment-requests/${requestId}/quotes/refresh`, {
        method: "POST",
        headers,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const parsed = extractApiError(data, "Не удалось обновить тарифы")
        throw new Error([parsed.message, ...parsed.details].join("\n"))
      }
      const nextQuotes = await res.json().catch(() => [])
      const list = Array.isArray(nextQuotes) ? nextQuotes : []
      setQuotesByRequest((prev) => ({ ...prev, [requestId]: list }))
      setItems((prev) =>
        prev.map((item) =>
          item.id === requestId ? { ...item, status: list.length > 0 ? "QUOTED" : "DRAFT" } : item,
        ),
      )
    } catch (e) {
      const text = e instanceof Error ? e.message : "Не удалось обновить тарифы"
      const lines = normalizeMessageLines(text.split("\n"))
      setError(lines[0] ?? "Не удалось обновить тарифы")
      setErrorDetails(lines.length > 1 ? lines.slice(1) : [])
      showToast("error", lines[0] ?? "Не удалось обновить тарифы")
    } finally {
      setRefreshingId(null)
    }
  }

  const selectQuote = async (requestId: string, quote: Quote) => {
    if (!token) return
    const row = items.find((i) => i.id === requestId)
    if (row?.status === "BOOKED") return
    const key = `${requestId}:${quote.id}`
    setSelectingKey(key)
    setError(null)
    setErrorDetails([])
    setSuccess(null)
    try {
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      const res = await authFetch(`/api/tms/shipment-requests/${requestId}/select-quote`, {
        method: "POST",
        headers,
        body: JSON.stringify({ quoteId: quote.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const parsed = extractApiError(data, "Не удалось выбрать тариф")
        throw new Error([parsed.message, ...parsed.details].join("\n"))
      }
      await loadAll({ silent: true })
    } catch (e) {
      const text = e instanceof Error ? e.message : "Не удалось выбрать тариф"
      const lines = normalizeMessageLines(text.split("\n"))
      setError(lines[0] ?? "Не удалось выбрать тариф")
      setErrorDetails(lines.length > 1 ? lines.slice(1) : [])
      showToast("error", lines[0] ?? "Не удалось выбрать тариф")
    } finally {
      setSelectingKey(null)
    }
  }

  const confirmQuote = async (requestId: string) => {
    if (!token) return
    setConfirmingId(requestId)
    setError(null)
    setErrorDetails([])
    setSuccess(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const res = await authFetch(`/api/tms/shipment-requests/${requestId}/confirm`, {
        method: "POST",
        headers,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const parsed = extractApiError(data, "Не удалось подтвердить перевозку")
        throw new Error([parsed.message, ...parsed.details].join("\n"))
      }
      const shipment = await res.json().catch(() => null)
      const trackingNumber =
        shipment && typeof shipment === "object" && typeof (shipment as { trackingNumber?: unknown }).trackingNumber === "string"
          ? (shipment as { trackingNumber: string }).trackingNumber
          : null
      const isPendingCdekNumber = typeof trackingNumber === "string" && trackingNumber.startsWith("CDEK-PENDING-")
      setSuccess(
        isPendingCdekNumber
          ? "Заявка принята CDEK. Номер CDEK еще формируется, проверьте отгрузку через 1-2 минуты."
          : trackingNumber
          ? `Перевозка подтверждена. Трек-номер: ${trackingNumber}`
          : "Перевозка подтверждена и отправлена в ТК.",
      )
      showToast(
        "success",
        isPendingCdekNumber
          ? "CDEK принял заявку, номер будет доступен позже."
          : trackingNumber
          ? `Подтверждено. Трек-номер: ${trackingNumber}`
          : "Перевозка подтверждена и отправлена в ТК.",
      )
      await loadAll({ silent: true })
    } catch (e) {
      const text = e instanceof Error ? e.message : "Не удалось подтвердить перевозку"
      const lines = normalizeMessageLines(text.split("\n"))
      setError(lines[0] ?? "Не удалось подтвердить перевозку")
      setErrorDetails(lines.length > 1 ? lines.slice(1) : [])
      showToast("error", lines[0] ?? "Не удалось подтвердить перевозку")
    } finally {
      setConfirmingId(null)
    }
  }

  const archiveRequests = async (requestIds: string[]) => {
    if (!token || requestIds.length === 0) return
    const uniqueIds = [...new Set(requestIds)]
    const isBulk = uniqueIds.length > 1
    setArchivingKey(isBulk ? "bulk" : uniqueIds[0])
    setError(null)
    setErrorDetails([])
    setSuccess(null)
    try {
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      const res = isBulk
        ? await authFetch("/api/tms/shipment-requests/archive", {
            method: "POST",
            headers,
            body: JSON.stringify({ requestIds: uniqueIds }),
          })
        : await authFetch(`/api/tms/shipment-requests/${uniqueIds[0]}/archive`, {
            method: "POST",
            headers,
          })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const parsed = extractApiError(data, "Не удалось перенести заявку в архив")
        throw new Error([parsed.message, ...parsed.details].join("\n"))
      }
      const result = await res.json().catch(() => ({}))
      const archivedCount =
        isBulk && result && typeof result === "object" && typeof (result as { archived?: unknown }).archived === "number"
          ? (result as { archived: number }).archived
          : 1
      setSuccess(
        archivedCount > 1
          ? `В архив перенесено ${archivedCount} заявок.`
          : "Заявка перенесена в архив и доступна во вкладке «Удаленные заказы».",
      )
      showToast(
        "success",
        archivedCount > 1 ? `В архив: ${archivedCount}` : "Заявка перенесена в архив",
      )
      setSelectedIds((prev) => prev.filter((id) => !uniqueIds.includes(id)))
      await loadAll({ silent: true })
    } catch (e) {
      const text = e instanceof Error ? e.message : "Не удалось перенести заявку в архив"
      const lines = normalizeMessageLines(text.split("\n"))
      setError(lines[0] ?? "Не удалось перенести заявку в архив")
      setErrorDetails(lines.length > 1 ? lines.slice(1) : [])
      showToast("error", lines[0] ?? "Не удалось перенести заявку в архив")
    } finally {
      setArchivingKey(null)
    }
  }

  const toggleVariants = (requestId: string, carrierId: string) => {
    const key = `${requestId}:${carrierId}`
    setExpandedVariants((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleSelected = (requestId: string) => {
    setSelectedIds((prev) => (prev.includes(requestId) ? prev.filter((id) => id !== requestId) : [...prev, requestId]))
  }

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      if (allVisibleSelected) return prev.filter((id) => !visibleIds.includes(id))
      const merged = new Set([...prev, ...visibleIds])
      return [...merged]
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
    <Card>
      <CardHeader>
        <CardTitle>Сравнение тарифов</CardTitle>
        <CardDescription>
          Здесь — заявки, где логист выбирает перевозчика в HandySeller (в т.ч. с 1С). Заказы витрины, где выбор
          сделан на сайте, попадают в «Журнал» после оформления, не дублируясь в этой матрице. Строки — заявки,
          колонки — перевозчики; в ячейках варианты тарифов (дверь/терминал и др.). Наведите на цену, чтобы увидеть
          состав суммы. Клик по варианту — выбор тарифа, далее нажмите «Подтвердить».
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <div className="space-y-1">
            <p className="text-sm text-destructive">{error}</p>
            {errorDetails.length > 0 ? (
              <ul className="list-disc pl-5 text-xs text-destructive/90">
                {errorDetails.map((line, idx) => (
                  <li key={`${line}-${idx}`}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {success ? <p className="text-sm text-emerald-600">{success}</p> : null}
        {toast ? (
          <div className="pointer-events-none fixed right-4 top-4 z-[60]">
            <div
              className={`max-w-sm rounded-md border px-3 py-2 text-sm shadow-lg ${
                toast.kind === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-destructive/30 bg-destructive/10 text-destructive"
              }`}
            >
              {toast.message}
            </div>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="flex flex-wrap gap-2 border-b pb-3">
            {(
              [
                ["all", "Все потоки"],
                ["MARKETPLACE_RC", "Маркетплейс → РЦ"],
                ["CARRIER_DELIVERY", "Клиенты (ТК / ручной)"],
                ["INTERNAL_TRANSFER", "Между филиалами"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={workQueue === key ? "default" : "outline"}
                disabled={key === "INTERNAL_TRANSFER"}
                title={
                  key === "INTERNAL_TRANSFER"
                    ? "Нужно поле типа заказа в core; см. дорожную карту в описании задачи"
                    : undefined
                }
                onClick={() => setWorkQueue(key)}
              >
                {label}
              </Button>
            ))}
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1 flex-1 min-w-[200px]">
              <Label htmlFor="tms-matrix-search">Поиск по заказу / адресу</Label>
              <Input
                id="tms-matrix-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Номер, город, улица…"
              />
            </div>
            <div className="space-y-1 min-w-[220px]">
              <Label htmlFor="tms-matrix-sort">Сортировка строк</Label>
              <select
                id="tms-matrix-sort"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as SortMode)}
              >
                <option value="newest">Сначала новые заявки</option>
                <option value="cheapest_lane">По минимальной цене среди ТК</option>
                <option value="fastest_lane">По минимальному сроку среди ТК</option>
                {carrierColumns.map((c) => (
                  <option key={c.id} value={`carrier:${c.id}`}>
                    По цене: {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:ml-auto">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={selectedIds.length === 0 || archivingKey === "bulk"}
                onClick={() => void archiveRequests(selectedIds)}
              >
                {archivingKey === "bulk" ? <Loader2 className="h-4 w-4 animate-spin" /> : "В архив (выбранные)"}
              </Button>
            </div>
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Расчётов пока нет. Создайте заявку из дашборда TMS или из заказов.</p>
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {sortedRows.map((item) => {
                const quotes = quotesByRequest[item.id] ?? []
                return (
                  <div key={item.id} className="rounded-md border p-3 space-y-3">
                    <div>
                      <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          className="h-4 w-4"
                        />
                        Выбрать для массового архива
                      </label>
                      <p className="text-sm font-medium">{item.snapshot.marketplace}</p>
                      <p className="text-xs text-muted-foreground">{item.snapshot.coreOrderNumber}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 text-xs text-muted-foreground">
                      <p>Откуда: {item.draft.originLabel}</p>
                      <p>Куда: {item.draft.destinationLabel}</p>
                      <p>Условия: {formatServiceFlags(item.draft.serviceFlags)}</p>
                    </div>
                    <Badge variant={item.status === "BOOKED" ? "default" : "secondary"}>
                      {requestStatusLabel(item.status)}
                    </Badge>
                    <div className="space-y-2">
                      {carrierColumns.map((col) => {
                        const carrierQuotes = quotesForCarrier(quotes, col.id, item.draft.serviceFlags)
                        const canPick = item.status !== "BOOKED"
                        if (carrierQuotes.length === 0) return null
                        const variantsKey = `${item.id}:${col.id}`
                        const expanded = Boolean(expandedVariants[variantsKey])
                        const shownQuotes = expanded ? carrierQuotes : carrierQuotes.slice(0, 4)
                        const minPrice = Math.min(...carrierQuotes.map((q) => displayRub(q.priceRub, q.carrierId)))
                        const minEta = Math.min(...carrierQuotes.map((q) => q.etaDays))
                        return (
                          <details key={col.id} className="rounded-md border">
                            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
                              <span className="text-xs font-medium">{col.name}</span>
                              <span className="text-[11px] text-muted-foreground">
                                от {minPrice.toLocaleString("ru-RU")} ₽ · от {minEta} дн.
                              </span>
                            </summary>
                            <div className="border-t p-2">
                              <div className="grid grid-cols-2 gap-1">
                                {shownQuotes.map((quote) => {
                                  const selected = item.selectedQuoteId === quote.id
                                  const busy = selectingKey === `${item.id}:${quote.id}`
                                  return (
                                    <QuoteTile
                                      key={quote.id}
                                      quote={quote}
                                      selected={selected}
                                      busy={busy}
                                      canPick={canPick}
                                      disabled={!canPick || Boolean(refreshingId === item.id) || Boolean(busy)}
                                      onSelect={() => void selectQuote(item.id, quote)}
                                    />
                                  )
                                })}
                              </div>
                              {carrierQuotes.length > 4 ? (
                                <button
                                  type="button"
                                  className="mt-1 text-[11px] text-primary underline-offset-2 hover:underline"
                                  onClick={() => toggleVariants(item.id, col.id)}
                                >
                                  {expanded ? "Скрыть лишние" : `Показать еще (${carrierQuotes.length - 4})`}
                                </button>
                              ) : null}
                            </div>
                          </details>
                        )
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        disabled={
                          item.status === "BOOKED" ||
                          !item.selectedQuoteId ||
                          confirmingId === item.id ||
                          refreshingId === item.id
                        }
                        onClick={() => void confirmQuote(item.id)}
                      >
                        {confirmingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Подтвердить"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={refreshingId === item.id || confirmingId === item.id || archivingKey === item.id}
                        onClick={() => void refreshQuotes(item.id)}
                      >
                        {refreshingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Обновить"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={refreshingId === item.id || confirmingId === item.id || archivingKey === item.id}
                        onClick={() => void archiveRequests([item.id])}
                      >
                        {archivingKey === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "В архив"}
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="hidden md:block overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAllVisible}
                      aria-label="Выбрать все видимые заявки"
                      className="h-4 w-4"
                    />
                  </th>
                  <th className="sticky left-0 z-10 bg-muted/95 px-3 py-2 font-medium whitespace-nowrap">Заказ</th>
                  <th className="px-3 py-2 font-medium min-w-[140px]">Откуда</th>
                  <th className="px-3 py-2 font-medium min-w-[140px]">Куда</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Условия</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Статус</th>
                  {carrierColumns.map((c) => (
                    <th key={c.id} className="px-2 py-2 font-medium text-center min-w-[112px] border-l bg-muted/50">
                      {c.name}
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap border-l">Действия</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7 + carrierColumns.length}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      В этой очереди сейчас нет заявок. Смените фильтр или снимите поиск.
                    </td>
                  </tr>
                ) : null}
                {sortedRows.map((item) => {
                  const quotes = quotesByRequest[item.id] ?? []
                  const highlight = item.id === requestIdFromQuery
                  return (
                    <tr
                      key={item.id}
                      className={`border-b last:border-0 ${highlight ? "bg-primary/5" : ""} hover:bg-muted/30`}
                    >
                      <td className="px-2 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          aria-label={`Выбрать заявку ${item.snapshot.coreOrderNumber}`}
                          className="h-4 w-4"
                        />
                      </td>
                      <td className="sticky left-0 z-[1] bg-background px-3 py-2 align-top whitespace-nowrap font-medium">
                        <span className="block">{item.snapshot.marketplace}</span>
                        <span className="text-muted-foreground">{item.snapshot.coreOrderNumber}</span>
                      </td>
                      <td className="px-3 py-2 align-top text-muted-foreground max-w-[200px]">{item.draft.originLabel}</td>
                      <td className="px-3 py-2 align-top text-muted-foreground max-w-[200px]">{item.draft.destinationLabel}</td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <span className="text-xs">{formatServiceFlags(item.draft.serviceFlags)}</span>
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <Badge variant={item.status === "BOOKED" ? "default" : "secondary"}>
                          {requestStatusLabel(item.status)}
                        </Badge>
                      </td>
                      {carrierColumns.map((col) => {
                        const carrierQuotes = quotesForCarrier(quotes, col.id, item.draft.serviceFlags)
                        const canPick = item.status !== "BOOKED"
                        const variantsKey = `${item.id}:${col.id}`
                        const expanded = Boolean(expandedVariants[variantsKey])
                        const shownQuotes = expanded ? carrierQuotes : carrierQuotes.slice(0, 4)
                        return (
                          <td key={col.id} className="border-l p-1 align-top text-center">
                            {carrierQuotes.length > 0 ? (
                              <div className="space-y-1">
                                <div className="grid grid-cols-2 gap-1">
                                {shownQuotes.map((quote) => {
                                  const selected = item.selectedQuoteId === quote.id
                                  const busy = selectingKey === `${item.id}:${quote.id}`
                                  return (
                                    <QuoteTile
                                      key={quote.id}
                                      quote={quote}
                                      selected={selected}
                                      busy={busy}
                                      canPick={canPick}
                                      disabled={!canPick || Boolean(refreshingId === item.id) || Boolean(busy)}
                                      onSelect={() => void selectQuote(item.id, quote)}
                                    />
                                  )
                                })}
                                </div>
                                {carrierQuotes.length > 4 ? (
                                  <button
                                    type="button"
                                    className="text-[11px] text-primary underline-offset-2 hover:underline"
                                    onClick={() => toggleVariants(item.id, col.id)}
                                  >
                                    {expanded ? "Скрыть лишние" : `Показать еще (${carrierQuotes.length - 4})`}
                                  </button>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-muted-foreground py-2 block">—</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="border-l px-2 py-2 align-top text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <Button
                            size="sm"
                            disabled={
                              item.status === "BOOKED" ||
                              !item.selectedQuoteId ||
                              confirmingId === item.id ||
                              refreshingId === item.id
                            }
                            onClick={() => void confirmQuote(item.id)}
                          >
                            {confirmingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Подтвердить"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={refreshingId === item.id || confirmingId === item.id || archivingKey === item.id}
                            onClick={() => void refreshQuotes(item.id)}
                          >
                            {refreshingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Обновить"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={refreshingId === item.id || confirmingId === item.id || archivingKey === item.id}
                            onClick={() => void archiveRequests([item.id])}
                          >
                            {archivingKey === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "В архив"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
