"use client"

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@handyseller/ui"
import { ArrowDown, ArrowUp, ArrowUpDown, FileUp, Layers, RefreshCw, Trash2 } from "lucide-react"
import { WmsSubnav } from "@/components/wms/wms-subnav"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

type TransferKind = "REPLENISHMENT" | "TOURIST"

type ImportBatch = {
  id: string
  fileName: string | null
  status: string
  rawRowCount: number
  importedRowCount: number
  errorCount: number
  createdAt: string
}

type Summary = {
  rowsTotal: number
  ordersTotal: number
  replenishmentRows: number
  replenishmentOrders: number
  replenishmentValue: number
  touristRows: number
  touristOrders: number
  touristValue: number
  valueTotal: number
  minDate: string | null
  maxDate: string | null
}

type ByOpRow = {
  receiverWarehouse: string
  receiverWarehouseType: string
  receiverOp: string
  rows: number
  orders: number
  replenishmentRows: number
  touristRows: number
  valueTotal: number
  touristValue: number
  firstDate: string | null
  lastDate: string | null
}

/** Одна строка = один туристский заказ (сводка для руководителя). */
type TouristOrderRow = {
  orderNumber: string
  senderOp: string
  receiverOp: string
  receiverWarehouseType: string
  productCount: number
  costTotal: number
  orderTotal: number
  marginTotal: number
  deliveryTotal: number
  differenceTotal: number | null
  orderDate: string
}

type TouristSortKey = "default" | "period" | "orderSum"

type RiskRow = {
  receiverWarehouse: string
  receiverWarehouseType: string
  receiverOp: string
  itemCode: string
  itemArticle: string | null
  itemName: string
  replenishmentDate: string
  nextReplenishmentDate: string | null
  touristRowsUntilNextReplenishment: number
  touristOrdersUntilNextReplenishment: number
  touristValueUntilNextReplenishment: number
}

type Filters = {
  from: string
  to: string
  receiverOps: string[]
  senderOps: string[]
  warehouseTypes: string[]
  counterparties: string[]
  qtyMin: string
  qtyMax: string
  item: string
  /** Точные коды номенклатуры (из каталога). */
  itemCodes: string[]
  kind: "" | TransferKind
  batchId: string
  /** Макс. строк в каждой агрегированной таблице (сервер, до 100 000). */
  byOpLimit: number
  byOpOffset: number
  touristsLimit: number
  touristsOffset: number
  risksLimit: number
  risksOffset: number
}

type FilterOptions = {
  warehouseTypes: string[]
  receiverOps: string[]
  senderOps: string[]
  counterparties: string[]
}

type ItemFrequencyRow = {
  itemCode: string
  itemArticle: string | null
  itemName: string
  rowCount: number
}

const emptySummary: Summary = {
  rowsTotal: 0,
  ordersTotal: 0,
  replenishmentRows: 0,
  replenishmentOrders: 0,
  replenishmentValue: 0,
  touristRows: 0,
  touristOrders: 0,
  touristValue: 0,
  valueTotal: 0,
  minDate: null,
  maxDate: null,
}

const numberRu = new Intl.NumberFormat("ru-RU")
const moneyRu = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })

function money(value: number): string {
  return `${moneyRu.format(value)} ₽`
}

function dateShort(value: string | null): string {
  if (!value) return "—"
  return value.slice(0, 10)
}

/** Дата в формате дд.мм.гггг (разделитель — точка). */
function dateRu(value: string | null): string {
  if (!value) return "—"
  const ymd = value.slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd.replace(/-/g, ".")
  return `${m[3]}.${m[2]}.${m[1]}`
}

const COUNTERPARTY_EMPTY_PARAM = "__EMPTY__"

/** Область таблицы: общая высота как у «Частота по ОП», скролл влево/вправо и вниз при переполнении. */
const ANALYTICS_TABLE_SCROLL =
  "max-h-[min(22rem,52vh)] overflow-x-auto overflow-y-auto rounded-md border border-border/60 bg-muted/15"

function queryFromFilters(filters: Filters): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (
      key === "byOpLimit" ||
      key === "byOpOffset" ||
      key === "touristsLimit" ||
      key === "touristsOffset" ||
      key === "risksLimit" ||
      key === "risksOffset"
    ) {
      qs.set(key, String(value as number))
      continue
    }
    if (key === "counterparties" && Array.isArray(value)) {
      if (value.length) {
        qs.set(
          key,
          value.map((c) => (c === "" ? COUNTERPARTY_EMPTY_PARAM : c)).join(","),
        )
      }
      continue
    }
    if (key === "itemCodes" && Array.isArray(value)) {
      if (value.length) qs.set(key, value.join(","))
      continue
    }
    if (Array.isArray(value)) {
      if (value.length) qs.set(key, value.join(","))
    } else if (typeof value === "string" && value) {
      qs.set(key, value)
    }
  }
  const raw = qs.toString()
  return raw ? `?${raw}` : ""
}

/** Ссылка на страницу состава заказа с теми же фильтрами. */
function orderDetailHref(filters: Filters, orderNumber: string): string {
  const base = queryFromFilters(filters)
  const search = base.startsWith("?") ? base.slice(1) : ""
  const u = new URLSearchParams(search)
  u.set("orderNumber", orderNumber)
  const q = u.toString()
  return q ? `/dashboard/wms/analytics/transfers/order?${q}` : `/dashboard/wms/analytics/transfers/order?orderNumber=${encodeURIComponent(orderNumber)}`
}

/** Запрос каталога номенклатуры: те же фильтры, но без отбора по товару. */
function queryFromFiltersExcludingItem(filters: Filters): string {
  return queryFromFilters({ ...filters, item: "", itemCodes: [] })
}

function getDefaultFilters(): Filters {
  return {
    from: "",
    to: "",
    receiverOps: [],
    senderOps: [],
    warehouseTypes: [],
    counterparties: [],
    qtyMin: "",
    qtyMax: "",
    item: "",
    itemCodes: [],
    kind: "",
    batchId: "",
    byOpLimit: 50_000,
    byOpOffset: 0,
    touristsLimit: 50_000,
    touristsOffset: 0,
    risksLimit: 50_000,
    risksOffset: 0,
  }
}

function clampTableInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw == null || raw === "") return fallback
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** Восстановление фильтров из адресной строки (тот же формат, что queryFromFilters). */
function parseFiltersFromSearchParams(sp: URLSearchParams): Filters {
  const d = getDefaultFilters()
  const from = sp.get("from")
  if (from) d.from = from
  const to = sp.get("to")
  if (to) d.to = to
  const splitList = (key: string) => {
    const raw = sp.get(key)
    if (!raw) return []
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }
  d.receiverOps = splitList("receiverOps")
  d.senderOps = splitList("senderOps")
  d.warehouseTypes = splitList("warehouseTypes")
  d.counterparties = splitList("counterparties").map((c) => (c === COUNTERPARTY_EMPTY_PARAM ? "" : c))
  d.itemCodes = splitList("itemCodes")
  d.qtyMin = sp.get("qtyMin") ?? ""
  d.qtyMax = sp.get("qtyMax") ?? ""
  d.item = sp.get("item") ?? ""
  const kind = sp.get("kind")
  if (kind === "REPLENISHMENT" || kind === "TOURIST") d.kind = kind
  d.batchId = sp.get("batchId") ?? ""
  d.byOpLimit = clampTableInt(sp.get("byOpLimit"), 1, 100_000, d.byOpLimit)
  d.byOpOffset = clampTableInt(sp.get("byOpOffset"), 0, 2_000_000, d.byOpOffset)
  d.touristsLimit = clampTableInt(sp.get("touristsLimit"), 1, 100_000, d.touristsLimit)
  d.touristsOffset = clampTableInt(sp.get("touristsOffset"), 0, 2_000_000, d.touristsOffset)
  d.risksLimit = clampTableInt(sp.get("risksLimit"), 1, 100_000, d.risksLimit)
  d.risksOffset = clampTableInt(sp.get("risksOffset"), 0, 2_000_000, d.risksOffset)
  return d
}

function filtersQueryKey(filters: Filters): string {
  return queryFromFilters(filters).slice(1)
}

/**
 * Одинаковые параметры в разном порядке дают разные строки у URLSearchParams и у queryFromFilters.
 * Без канонизации получается цикл: replace → новый порядок в адресе → снова replace.
 */
function canonicalQueryString(qs: string): string {
  if (!qs || qs === "") return ""
  const u = new URLSearchParams(qs)
  const pairs = [...u.entries()].sort((a, b) => {
    const cmp = a[0].localeCompare(b[0])
    if (cmp !== 0) return cmp
    return String(a[1]).localeCompare(String(b[1]))
  })
  const out = new URLSearchParams()
  for (const [k, v] of pairs) {
    out.append(k, v)
  }
  return out.toString()
}

/** Query без служебных для других экранов ключей (напр. orderNumber на карточке заказа). */
function filterSearchFromLocationSearch(search: string): string {
  const u = new URLSearchParams(search)
  u.delete("orderNumber")
  return u.toString()
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Не удалось прочитать файл."))
    reader.onload = () => {
      const value = String(reader.result ?? "")
      resolve(value.includes(",") ? value.split(",").pop() ?? "" : value)
    }
    reader.readAsDataURL(file)
  })
}

function formatHttpError(data: unknown, fallback: string): string {
  if (typeof data === "string") {
    const text = data.trim()
    if (text) return text.length > 240 ? `${text.slice(0, 240)}...` : text
  }
  if (!data || typeof data !== "object") return fallback
  const d = data as Record<string, unknown>
  const m = d.message
  const e = d.error
  if (typeof m === "string" && m.trim()) return m.trim()
  if (Array.isArray(m) && m.every((x) => typeof x === "string")) return m.join("; ")
  if (typeof e === "string" && e.trim()) return e.trim()
  return fallback
}

function WmsTransferAnalyticsPageContent() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname() ?? "/dashboard/wms/analytics/transfers"
  /**
   * Синхронизация URL ↔ фильтры без гонок:
   * - После router.replace Next присылает тот же query; без маркера снова parse → setFilters → replace → цикл.
   * - pendingOwnCanonical: каноническая строка query, которую мы только что отправили в replace; один layout-проход игнорируем.
   */
  const pendingOwnCanonical = useRef<string | null>(null)

  const [summary, setSummary] = useState<Summary>(emptySummary)
  const [imports, setImports] = useState<ImportBatch[]>([])
  const [options, setOptions] = useState<FilterOptions>({
    warehouseTypes: [],
    receiverOps: [],
    senderOps: [],
    counterparties: [],
  })
  const [byOp, setByOp] = useState<ByOpRow[]>([])
  const [tourists, setTourists] = useState<TouristOrderRow[]>([])
  const [risks, setRisks] = useState<RiskRow[]>([])
  const [filters, setFilters] = useState<Filters>(() => {
    if (typeof window === "undefined") return getDefaultFilters()
    return parseFiltersFromSearchParams(
      new URLSearchParams(filterSearchFromLocationSearch(window.location.search)),
    )
  })

  const searchParamsString = searchParams.toString()
  const searchKey = useMemo(
    () => filterSearchFromLocationSearch(searchParamsString),
    [searchParamsString],
  )

  useLayoutEffect(() => {
    const cs = canonicalQueryString(searchKey)
    if (pendingOwnCanonical.current != null && cs === pendingOwnCanonical.current) {
      pendingOwnCanonical.current = null
      return
    }
    const u = new URLSearchParams(searchKey)
    const parsed = parseFiltersFromSearchParams(u)
    setFilters((prev) => {
      const prevQ = canonicalQueryString(filtersQueryKey(prev))
      const nextQ = canonicalQueryString(filtersQueryKey(parsed))
      if (prevQ === nextQ) return prev
      return parsed
    })
  }, [searchKey])

  useEffect(() => {
    const want = filtersQueryKey(filters)
    const cw = canonicalQueryString(want)
    const cs = canonicalQueryString(searchKey)
    if (cw === cs) return
    const t = window.setTimeout(() => {
      const w = filtersQueryKey(filters)
      const cwn = canonicalQueryString(w)
      const csn = canonicalQueryString(searchKey)
      if (cwn === csn) return
      pendingOwnCanonical.current = cwn
      const href = w ? `${pathname}?${w}` : pathname
      router.replace(href, { scroll: false })
    }, 160)
    return () => window.clearTimeout(t)
  }, [filters, pathname, router, searchKey])
  const [itemPickerOpen, setItemPickerOpen] = useState(false)
  const [touristSort, setTouristSort] = useState<{ key: TouristSortKey; dir: "asc" | "desc" }>({
    key: "default",
    dir: "asc",
  })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const query = useMemo(() => queryFromFilters(filters), [filters])
  const catalogQuery = useMemo(() => queryFromFiltersExcludingItem(filters), [filters])

  const touristsSorted = useMemo(() => {
    const rows = tourists.slice()
    if (touristSort.key === "default") {
      rows.sort((a, b) =>
        a.orderNumber.localeCompare(b.orderNumber, "ru", { numeric: true, sensitivity: "base" }),
      )
      return rows
    }
    const dir = touristSort.dir === "asc" ? 1 : -1
    if (touristSort.key === "period") {
      rows.sort((a, b) => dir * a.orderDate.localeCompare(b.orderDate))
      return rows
    }
    rows.sort((a, b) => {
      const d = dir * (a.orderTotal - b.orderTotal)
      if (d !== 0) return d
      return a.orderNumber.localeCompare(b.orderNumber, "ru", { numeric: true, sensitivity: "base" })
    })
    return rows
  }, [tourists, touristSort])

  const toggleTouristSort = (key: "period" | "orderSum") => {
    setTouristSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    )
  }

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [summaryRes, importsRes, optionsRes, byOpRes, touristsRes, risksRes] = await Promise.all([
        authFetch(`/api/wms/v1/analytics/transfers/summary${query}`, { headers }),
        authFetch("/api/wms/v1/analytics/imports", { headers }),
        authFetch(`/api/wms/v1/analytics/transfers/options${query}`, { headers }),
        authFetch(`/api/wms/v1/analytics/transfers/by-op${query}`, { headers }),
        authFetch(`/api/wms/v1/analytics/transfers/tourists${query}`, { headers }),
        authFetch(`/api/wms/v1/analytics/transfers/replenishment-risks${query}`, { headers }),
      ])
      const summaryText = await summaryRes.text()
      if (!summaryRes.ok) {
        let detail = summaryText.trim().slice(0, 400)
        try {
          const j = JSON.parse(summaryText) as { message?: unknown }
          if (typeof j.message === "string" && j.message.trim()) detail = j.message.trim()
          else if (Array.isArray(j.message)) detail = j.message.map(String).join("; ")
        } catch {
          /* keep text */
        }
        throw new Error(
          detail
            ? `Не удалось загрузить сводку аналитики (HTTP ${summaryRes.status}): ${detail}`
            : `Не удалось загрузить сводку аналитики (HTTP ${summaryRes.status}).`,
        )
      }
      setSummary(JSON.parse(summaryText) as Summary)
      setImports(importsRes.ok ? ((await importsRes.json()) as ImportBatch[]) : [])
      setOptions(
        optionsRes.ok
          ? ((await optionsRes.json()) as FilterOptions)
          : { warehouseTypes: [], receiverOps: [], senderOps: [], counterparties: [] },
      )
      setByOp(byOpRes.ok ? ((await byOpRes.json()) as ByOpRow[]) : [])
      setTourists(touristsRes.ok ? ((await touristsRes.json()) as TouristOrderRow[]) : [])
      setRisks(risksRes.ok ? ((await risksRes.json()) as RiskRow[]) : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки аналитики.")
    } finally {
      setLoading(false)
    }
  }, [query, token])

  useEffect(() => {
    void load()
  }, [load])

  const upload = async (file: File | null) => {
    if (!file || !token) return
    setUploading(true)
    setError(null)
    setSuccess(null)
    try {
      const contentBase64 = await readFileAsBase64(file)
      const res = await authFetch("/api/wms/v1/analytics/imports/transfer-orders", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, contentBase64 }),
      })
      const responseText = await res.text()
      let data: unknown = responseText
      try {
        data = responseText ? JSON.parse(responseText) : {}
      } catch {
        data = responseText
      }
      if (!res.ok) {
        setError(formatHttpError(data, "Не удалось импортировать файл."))
        return
      }
      const result = data as { batch?: ImportBatch; summary?: Summary }
      setSuccess(
        `Импортировано строк: ${numberRu.format(result.batch?.importedRowCount ?? 0)} из ${numberRu.format(
          result.batch?.rawRowCount ?? 0,
        )}.`,
      )
      setFilters((prev) => ({ ...prev, batchId: result.batch?.id ?? prev.batchId }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка импорта.")
    } finally {
      setUploading(false)
    }
  }

  const setFilter = (key: "from" | "to" | "item" | "kind" | "batchId", value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const setListFilter = (key: "receiverOps" | "senderOps" | "warehouseTypes" | "counterparties", value: string[]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const setRangeFilter = (key: "qtyMin" | "qtyMax", value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const deleteSelectedBatch = async () => {
    if (!token || !filters.batchId) return
    const ok = window.confirm(
      "Удалить выбранную партию из базы вместе со всеми строками этой загрузки? Действие необратимо.",
    )
    if (!ok) return
    setError(null)
    setSuccess(null)
    try {
      const res = await authFetch(`/api/wms/v1/analytics/imports/${encodeURIComponent(filters.batchId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const text = await res.text()
      let data: unknown = text
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        data = text
      }
      if (!res.ok) {
        setError(formatHttpError(data, "Не удалось удалить партию."))
        return
      }
      setFilters((prev) => ({ ...prev, batchId: "" }))
      setSuccess("Партия удалена.")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления.")
    }
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">WMS / BI</p>
          <h1 className="text-2xl font-semibold">Заказы на перемещение</h1>
          <p className="text-sm text-muted-foreground">
            Пополнения и туристы по ОП, маршрутам, товарам и стоимости.
          </p>
        </div>
        <WmsSubnav />
      </div>

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
      {success ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{success}</div> : null}

      <Card>
        <CardHeader>
          <CardTitle>Импорт и фильтры</CardTitle>
          <CardDescription>
            Загрузите Excel «Заказы на перемещения.xlsx» или отфильтруйте партии. Для больших объёмов выберите конкретную
            партию — сводка и фильтры считаются быстрее; при «Все партии» без узких фильтров нагрузка выше.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1">
              <Label htmlFor="transfer-file">Excel-файл</Label>
              <Input
                id="transfer-file"
                type="file"
                accept=".xlsx,.xls"
                disabled={uploading}
                onChange={(e) => void upload(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="from">С даты</Label>
              <Input id="from" type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">По дату</Label>
              <Input id="to" type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} />
            </div>
            <CheckSelect
              id="warehouseTypes"
              label="Склад получателя"
              options={options.warehouseTypes}
              value={filters.warehouseTypes}
              onChange={(value) => setListFilter("warehouseTypes", value)}
            />
            <CheckSelect
              id="receiverOps"
              label="Получатель"
              options={options.receiverOps}
              value={filters.receiverOps}
              onChange={(value) => setListFilter("receiverOps", value)}
            />
            <CheckSelect
              id="senderOps"
              label="Отправитель"
              options={options.senderOps}
              value={filters.senderOps}
              onChange={(value) => setListFilter("senderOps", value)}
            />
            <CheckSelect
              id="counterparties"
              label="Контрагент"
              options={options.counterparties}
              value={filters.counterparties}
              onChange={(value) => setListFilter("counterparties", value)}
              formatOptionLabel={(v) => (v === "" ? "(не указан)" : v)}
            />
            <div className="space-y-1 md:col-span-2 xl:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="item">Товар / артикул</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 border-input bg-background text-foreground"
                  onClick={() => setItemPickerOpen(true)}
                >
                  <Layers className="mr-2 h-4 w-4" />
                  Каталог номенклатуры
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  id="item"
                  className="max-w-md flex-1 min-w-[12rem]"
                  value={filters.item}
                  placeholder={filters.itemCodes.length ? "Отключено: выбраны коды из каталога" : "Подстрока по названию, коду или артикулу"}
                  disabled={Boolean(filters.itemCodes.length)}
                  onChange={(e) => setFilter("item", e.target.value)}
                />
                {filters.itemCodes.length ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setFilters((p) => ({ ...p, itemCodes: [] }))}
                  >
                    Сбросить коды ({filters.itemCodes.length})
                  </Button>
                ) : null}
              </div>
              {filters.itemCodes.length ? (
                <p className="text-xs text-muted-foreground">
                  Фильтр по кодам: {filters.itemCodes.slice(0, 12).join(", ")}
                  {filters.itemCodes.length > 12 ? ` … +${filters.itemCodes.length - 12}` : ""}
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="kind">Тип</Label>
              <select
                id="kind"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={filters.kind}
                onChange={(e) => setFilter("kind", e.target.value)}
              >
                <option value="">Все</option>
                <option value="REPLENISHMENT">Пополнения</option>
                <option value="TOURIST">Туристы</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="batch">Партия импорта</Label>
              <select
                id="batch"
                className="h-10 max-w-80 rounded-md border border-input bg-background px-3 text-sm"
                value={filters.batchId}
                onChange={(e) => setFilter("batchId", e.target.value)}
              >
                <option value="">Все партии</option>
                {imports.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.fileName ?? batch.id} · {dateShort(batch.createdAt)}
                  </option>
                ))}
              </select>
            </div>
            {filters.batchId ? (
              <Button
                type="button"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => void deleteSelectedBatch()}
                disabled={loading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Удалить партию
              </Button>
            ) : null}
            <div className="space-y-1">
              <Label htmlFor="table-rows-cap">Строк в таблицах (после группировки в БД)</Label>
              <select
                id="table-rows-cap"
                className="h-10 max-w-xs rounded-md border border-input bg-background px-3 text-sm"
                value={filters.byOpLimit}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10)
                  setFilters((p) => ({
                    ...p,
                    byOpLimit: n,
                    touristsLimit: n,
                    risksLimit: n,
                    byOpOffset: 0,
                    touristsOffset: 0,
                    risksOffset: 0,
                  }))
                }}
              >
                <option value={5000}>5 000</option>
                <option value={10000}>10 000</option>
                <option value={25000}>25 000</option>
                <option value={50000}>50 000 (по умолчанию)</option>
                <option value={100000}>100 000 (макс.)</option>
              </select>
            </div>
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Обновить
            </Button>
          </div>
        </CardContent>
      </Card>

      <ItemCatalogModal
        open={itemPickerOpen}
        onClose={() => setItemPickerOpen(false)}
        token={token}
        catalogQuery={catalogQuery}
        seedCodes={filters.itemCodes}
        onApply={(codes) => {
          setFilters((p) => ({
            ...p,
            itemCodes: codes,
            item: "",
            byOpOffset: 0,
            touristsOffset: 0,
            risksOffset: 0,
          }))
          setItemPickerOpen(false)
        }}
      />

      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Stat title="Строк" value={numberRu.format(summary.rowsTotal)} hint={`${numberRu.format(summary.ordersTotal)} заказов`} />
        <Stat title="Пополнения" value={numberRu.format(summary.replenishmentRows)} hint={money(summary.replenishmentValue)} />
        <Stat title="Туристы" value={numberRu.format(summary.touristRows)} hint={money(summary.touristValue)} accent />
        <Stat title="Сумма" value={money(summary.valueTotal)} hint="по «Цена» (fallback: «РозничнаяЦена»), целые ₽" />
        <Stat title="Период" value={`${dateRu(summary.minDate)} — ${dateRu(summary.maxDate)}`} hint={loading ? "загрузка..." : "по фильтру"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2 xl:items-stretch">
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="shrink-0 space-y-1.5 pb-3">
            <CardTitle>Частота по ОП</CardTitle>
            <CardDescription>
              ОП-получатели: кто чаще всего принимает перемещения и сколько из строк приходятся на туристов.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 pt-0">
            <SimpleTable
              scrollClassName={ANALYTICS_TABLE_SCROLL}
              tableClassName="min-w-[720px]"
              headers={["Получатель", "Склад", "Строк", "Заказов", "Туристы", "Сумма туристов"]}
              rows={byOp.map((row) => [
                row.receiverOp,
                row.receiverWarehouseType,
                numberRu.format(row.rows),
                numberRu.format(row.orders),
                numberRu.format(row.touristRows),
                money(row.touristValue),
              ])}
            />
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <CardHeader className="shrink-0 space-y-1.5 pb-3">
            <CardTitle>Риск пополнения</CardTitle>
            <CardDescription>Товар был в пополнении, но до следующего пополнения ОП снова заказывал его туристом.</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 pt-0">
            <SimpleTable
              scrollClassName={ANALYTICS_TABLE_SCROLL}
              tableClassName="min-w-[720px]"
              headers={["Получатель", "Склад", "Товар", "После пополнения", "Туристов", "Сумма"]}
              rows={risks.map((row) => [
                row.receiverOp,
                row.receiverWarehouseType,
                row.itemArticle ? `${row.itemArticle} · ${row.itemName}` : row.itemName,
                dateShort(row.replenishmentDate),
                numberRu.format(row.touristRowsUntilNextReplenishment),
                money(row.touristValueUntilNextReplenishment),
              ])}
            />
          </CardContent>
        </Card>
      </section>

      <Card className="flex min-h-0 flex-col">
        <CardHeader className="shrink-0 space-y-1.5 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Туристы по маршрутам и товарам</CardTitle>
              <CardDescription>
                Сводка по заказам: одна строка на заказ. Состав заказа — по клику на номер. Сортировка по дате и стоимости
                заказа.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={touristSort.key === "default"}
              onClick={() => setTouristSort({ key: "default", dir: "asc" })}
            >
              По номеру заказа
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 pt-0">
          <div className={ANALYTICS_TABLE_SCROLL}>
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="sticky top-0 z-[1] border-b bg-background/95 text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <tr>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">№ заказа</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Отправитель</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Получатель</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Склад</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Товаров</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Себестоимость</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded hover:bg-muted"
                      onClick={() => toggleTouristSort("orderSum")}
                    >
                      Стоимость
                      {touristSort.key === "orderSum" ? (
                        touristSort.dir === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  </th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Маржа</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Доставка</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Разница</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded hover:bg-muted"
                      onClick={() => toggleTouristSort("period")}
                    >
                      Дата
                      {touristSort.key === "period" ? (
                        touristSort.dir === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowDown className="h-3.5 w-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                      )}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {touristsSorted.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="p-4 text-muted-foreground">
                      Данных пока нет. Загрузите файл или измените фильтры.
                    </td>
                  </tr>
                ) : (
                  touristsSorted.map((row) => (
                    <tr key={row.orderNumber} className="border-b last:border-0">
                      <td className="px-3 py-2 align-top">
                        <Link
                          href={orderDetailHref(filters, row.orderNumber)}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {row.orderNumber || "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 align-top">{row.senderOp || "—"}</td>
                      <td className="px-3 py-2 align-top">{row.receiverOp || "—"}</td>
                      <td className="max-w-[min(28rem,44vw)] px-3 py-2 align-top break-words">
                        {row.receiverWarehouseType || "—"}
                      </td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{numberRu.format(row.productCount)}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{money(row.costTotal)}</td>
                      <td className="px-3 py-2 align-top tabular-nums font-medium">{money(row.orderTotal)}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{money(row.marginTotal)}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">{money(row.deliveryTotal)}</td>
                      <td className="px-3 py-2 align-top text-right tabular-nums">
                        {row.differenceTotal == null ? "—" : money(row.differenceTotal)}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">{dateRu(row.orderDate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

export default function WmsTransferAnalyticsPage() {
  return (
    <Suspense
      fallback={
        <main className="space-y-6 p-6">
          <p className="text-sm text-muted-foreground">WMS / BI</p>
          <p className="text-muted-foreground">Загрузка аналитики…</p>
        </main>
      }
    >
      <WmsTransferAnalyticsPageContent />
    </Suspense>
  )
}

function ItemCatalogModal({
  open,
  onClose,
  token,
  catalogQuery,
  seedCodes,
  onApply,
}: {
  open: boolean
  onClose: () => void
  token: string | null
  catalogQuery: string
  seedCodes: string[]
  onApply: (codes: string[]) => void
}) {
  const [rows, setRows] = useState<ItemFrequencyRow[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSelected(new Set(seedCodes))
    }
    wasOpenRef.current = open
  }, [open, seedCodes])

  useEffect(() => {
    if (!open || !token) return
    let cancelled = false
    setLoading(true)
    setErr(null)
    void authFetch(`/api/wms/v1/analytics/transfers/item-frequency${catalogQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const text = await res.text()
        if (!res.ok) {
          let detail = text.slice(0, 400)
          try {
            const j = JSON.parse(text) as { message?: unknown }
            if (typeof j.message === "string") detail = j.message
          } catch {
            /* keep */
          }
          throw new Error(detail || `HTTP ${res.status}`)
        }
        return JSON.parse(text) as ItemFrequencyRow[]
      })
      .then((data) => {
        if (!cancelled) setRows(data)
      })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Ошибка загрузки каталога.")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, token, catalogQuery])

  if (!open) return null

  const toggle = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const selectAllLoaded = () => {
    setSelected(new Set(rows.map((r) => r.itemCode)))
  }

  const clearSel = () => setSelected(new Set())

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-catalog-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <Card className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden shadow-lg">
        <CardHeader className="shrink-0 border-b">
          <CardTitle id="item-catalog-title">Номенклатура по текущим фильтрам</CardTitle>
          <CardDescription>
            Группировка по полю «НоменклатураКод», сортировка по числу строк (чаще перемещались — выше). Отметьте коды и
            примените — дальше настройте ОП и остальные фильтры.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden pt-4">
          {err ? <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">{err}</div> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={selectAllLoaded} disabled={loading || !rows.length}>
              Выбрать все в списке
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={clearSel} disabled={loading}>
              Снять выбор
            </Button>
            <span className="self-center text-sm text-muted-foreground">
              {loading ? "Загрузка…" : `Позиций: ${numberRu.format(rows.length)} · выбрано кодов: ${selected.size}`}
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-md border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="sticky top-0 z-[1] border-b bg-background">
                <tr className="text-muted-foreground">
                  <th className="w-10 px-2 py-2" />
                  <th className="px-2 py-2 font-medium">НоменклатураАртикул</th>
                  <th className="px-2 py-2 font-medium">НоменклатураКод</th>
                  <th className="px-2 py-2 font-medium">Название</th>
                  <th className="px-2 py-2 font-medium text-right">Строк</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.itemCode} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-input"
                        checked={selected.has(r.itemCode)}
                        onChange={() => toggle(r.itemCode)}
                      />
                    </td>
                    <td className="px-2 py-1.5 align-top">{r.itemArticle ?? "—"}</td>
                    <td className="px-2 py-1.5 align-top font-mono text-xs">{r.itemCode}</td>
                    <td className="max-w-md px-2 py-1.5 align-top break-words">{r.itemName}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{numberRu.format(r.rowCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && rows.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Нет строк по фильтру — измените период или партию.</p>
            ) : null}
          </div>
          <div className="flex shrink-0 justify-end gap-2 border-t pt-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button type="button" onClick={() => onApply([...selected])}>
              Применить фильтр по кодам ({selected.size})
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ title, value, hint, accent }: { title: string; value: string; hint: string; accent?: boolean }) {
  return (
    <Card className={`flex h-full min-h-[7.5rem] flex-col ${accent ? "border-primary/30 bg-primary/5" : ""}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          {accent ? <Badge variant="outline">фокус</Badge> : null}
        </div>
        <CardTitle className="text-xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{hint}</CardContent>
    </Card>
  )
}

function CheckSelect({
  id,
  label,
  options,
  value,
  onChange,
  formatOptionLabel,
}: {
  id: string
  label: string
  options: string[]
  value: string[]
  onChange: (value: string[]) => void
  formatOptionLabel?: (option: string) => string
}) {
  const [open, setOpen] = useState(false)
  const selected = new Set(value)
  const toggle = (option: string) => {
    if (selected.has(option)) {
      onChange(value.filter((v) => v !== option))
      return
    }
    onChange([...value, option])
  }

  return (
    <div className="relative space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Button
        id={id}
        type="button"
        variant="outline"
        className="h-10 w-full justify-between overflow-hidden px-3 font-normal"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{value.length ? `Выбрано: ${value.length}` : "Все"}</span>
        <span className="text-muted-foreground">v</span>
      </Button>
      {open ? (
        <div className="absolute z-20 mt-1 max-h-72 w-72 overflow-auto rounded-md border bg-background p-2 shadow-sm">
          {options.length === 0 ? (
            <p className="px-2 py-1 text-sm text-muted-foreground">Нет данных</p>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap gap-2 border-b pb-2">
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs font-medium text-primary hover:underline"
                  onClick={() => onChange([...options])}
                >
                  Выбрать все
                </button>
                <button
                  type="button"
                  className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  onClick={() => onChange([])}
                >
                  Снять все
                </button>
              </div>
              {options.map((option) => (
                <label key={option} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={selected.has(option)}
                    onChange={() => toggle(option)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="truncate" title={option || "(не указан)"}>
                    {formatOptionLabel ? formatOptionLabel(option) : option}
                  </span>
                </label>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

function SimpleTable({
  headers,
  rows,
  scrollClassName,
  tableClassName,
}: {
  headers: string[]
  rows: string[][]
  /** Обёртка со скроллом (по умолчанию только overflow-auto). */
  scrollClassName?: string
  /** Минимальная ширина таблицы для горизонтального скролла, например min-w-[720px]. */
  tableClassName?: string
}) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Данных пока нет. Загрузите файл или измените фильтры.</p>
  }
  const tw = tableClassName ?? "min-w-[720px]"
  return (
    <div className={scrollClassName ?? "overflow-auto"}>
      <table className={`w-full text-left text-sm ${tw}`}>
        <thead className="sticky top-0 z-[1] border-b bg-background/95 text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <tr>
            {headers.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row[0]}-${idx}`} className="border-b last:border-0">
              {row.map((cell, cellIdx) => (
                <td key={`c${cellIdx}-r${idx}`} className="max-w-[min(28rem,44vw)] px-3 py-2 align-top break-words">
                  <span className={cellIdx === 0 ? "font-medium" : undefined}>{cell}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
