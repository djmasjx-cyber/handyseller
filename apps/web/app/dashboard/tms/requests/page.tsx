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

function QuoteDetails({ quote }: { quote: Quote }) {
  const price = quote.priceDetails
  const variantLabel = quote.notes?.split("·")[0]?.trim() ?? "Вариант"
  return (
    <div className="space-y-1 text-xs">
      <p className="font-medium text-foreground">{variantLabel}</p>
      <p className="text-muted-foreground">Срок: {quote.etaDays} дн.</p>
      <p className="font-semibold text-foreground">Итог: {quote.priceRub.toLocaleString("ru-RU")} ₽</p>
      {price?.tariffRub != null ? <p className="text-muted-foreground">Тариф: {price.tariffRub.toLocaleString("ru-RU")} ₽</p> : null}
      {price?.insuranceRub != null ? (
        <p className="text-muted-foreground">Страховка: {price.insuranceRub.toLocaleString("ru-RU")} ₽</p>
      ) : null}
      {price?.extrasRub != null && price.extrasRub > 0 ? (
        <p className="text-muted-foreground">Доп. услуги: {price.extrasRub.toLocaleString("ru-RU")} ₽</p>
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
              {quote.priceRub.toLocaleString("ru-RU")} ₽
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
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sortMode, setSortMode] = useState<SortMode>("newest")
  const requestIdFromQuery = searchParams.get("requestId")
  const orderIdFromQuery = searchParams.get("orderId")
  const autoQuote = searchParams.get("autoQuote") === "1"
  const autoQuoteTriggeredRef = useRef(false)
  const workQueue = workQueueFromSearchParam(searchParams.get("queue"))

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
        const r = await authFetch("/api/tms/shipment-requests", { headers })
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
      rows = rows.filter((item) => item.snapshot.logisticsScenario === "CARRIER_DELIVERY")
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

  const refreshQuotes = async (requestId: string) => {
    if (!token) return
    setRefreshingId(requestId)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const res = await authFetch(`/api/tms/shipment-requests/${requestId}/quotes/refresh`, {
        method: "POST",
        headers,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data?.message === "string" ? data.message : "Не удалось обновить тарифы")
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
      setError(e instanceof Error ? e.message : "Не удалось обновить тарифы")
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
    try {
      const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
      const res = await authFetch(`/api/tms/shipment-requests/${requestId}/select-quote`, {
        method: "POST",
        headers,
        body: JSON.stringify({ quoteId: quote.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data?.message === "string" ? data.message : "Не удалось выбрать тариф")
      }
      await loadAll({ silent: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выбрать тариф")
    } finally {
      setSelectingKey(null)
    }
  }

  const confirmQuote = async (requestId: string) => {
    if (!token) return
    setConfirmingId(requestId)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const res = await authFetch(`/api/tms/shipment-requests/${requestId}/confirm`, {
        method: "POST",
        headers,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data?.message === "string" ? data.message : "Не удалось подтвердить перевозку")
      }
      await loadAll({ silent: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось подтвердить перевозку")
    } finally {
      setConfirmingId(null)
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
    <Card>
      <CardHeader>
        <CardTitle>Сравнение тарифов</CardTitle>
        <CardDescription>
          Строки — заявки, колонки — перевозчики; в ячейках варианты тарифов (дверь/терминал и др.). Наведите на
          цену, чтобы увидеть состав суммы. Клик по варианту — выбор тарифа, далее нажмите «Подтвердить».
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
                        const minPrice = Math.min(...carrierQuotes.map((q) => q.priceRub))
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
                                {carrierQuotes.map((quote) => {
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
                        disabled={refreshingId === item.id || confirmingId === item.id}
                        onClick={() => void refreshQuotes(item.id)}
                      >
                        {refreshingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Обновить"}
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
                      colSpan={6 + carrierColumns.length}
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
                        return (
                          <td key={col.id} className="border-l p-1 align-top text-center">
                            {carrierQuotes.length > 0 ? (
                              <div className="grid grid-cols-2 gap-1">
                                {carrierQuotes.map((quote) => {
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
                            disabled={refreshingId === item.id || confirmingId === item.id}
                            onClick={() => void refreshQuotes(item.id)}
                          >
                            {refreshingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Обновить"}
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
