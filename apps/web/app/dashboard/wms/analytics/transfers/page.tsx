"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@handyseller/ui"
import { FileUp, RefreshCw, Trash2 } from "lucide-react"
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

type TouristRow = {
  receiverWarehouse: string
  receiverWarehouseType: string
  receiverOp: string
  senderWarehouse: string
  senderWarehouseType: string
  senderOp: string
  itemCode: string
  itemArticle: string | null
  itemName: string
  rows: number
  orders: number
  valueTotal: number
  firstDate: string | null
  lastDate: string | null
}

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
  retailMin: string
  retailMax: string
  costMin: string
  costMax: string
  item: string
  kind: "" | TransferKind
  batchId: string
  /** Лимиты строк таблиц на сервере (пагинация). */
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
    if (Array.isArray(value)) {
      if (value.length) qs.set(key, value.join(","))
    } else if (typeof value === "string" && value) {
      qs.set(key, value)
    }
  }
  const raw = qs.toString()
  return raw ? `?${raw}` : ""
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

export default function WmsTransferAnalyticsPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [summary, setSummary] = useState<Summary>(emptySummary)
  const [imports, setImports] = useState<ImportBatch[]>([])
  const [options, setOptions] = useState<FilterOptions>({
    warehouseTypes: [],
    receiverOps: [],
    senderOps: [],
    counterparties: [],
  })
  const [byOp, setByOp] = useState<ByOpRow[]>([])
  const [tourists, setTourists] = useState<TouristRow[]>([])
  const [risks, setRisks] = useState<RiskRow[]>([])
  const [filters, setFilters] = useState<Filters>({
    from: "",
    to: "",
    receiverOps: [],
    senderOps: [],
    warehouseTypes: [],
    counterparties: [],
    qtyMin: "",
    qtyMax: "",
    retailMin: "",
    retailMax: "",
    costMin: "",
    costMax: "",
    item: "",
    kind: "",
    batchId: "",
    byOpLimit: 500,
    byOpOffset: 0,
    touristsLimit: 300,
    touristsOffset: 0,
    risksLimit: 250,
    risksOffset: 0,
  })
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const query = useMemo(() => queryFromFilters(filters), [filters])

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
      setTourists(touristsRes.ok ? ((await touristsRes.json()) as TouristRow[]) : [])
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

  const setRangeFilter = (key: "qtyMin" | "qtyMax" | "retailMin" | "retailMax" | "costMin" | "costMax", value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const bumpTableLimits = () => {
    setFilters((prev) => ({
      ...prev,
      byOpLimit: Math.min(2000, prev.byOpLimit + 200),
      touristsLimit: Math.min(2000, prev.touristsLimit + 200),
      risksLimit: Math.min(2000, prev.risksLimit + 200),
      byOpOffset: 0,
      touristsOffset: 0,
      risksOffset: 0,
    }))
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
              label="Склад"
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
            <div className="space-y-1">
              <Label htmlFor="item">Товар / артикул</Label>
              <Input id="item" value={filters.item} onChange={(e) => setFilter("item", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <div className="space-y-1">
              <Label htmlFor="qtyMin">Количество от</Label>
              <Input
                id="qtyMin"
                inputMode="decimal"
                placeholder="напр. 1"
                value={filters.qtyMin}
                onChange={(e) => setRangeFilter("qtyMin", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="qtyMax">Количество до</Label>
              <Input
                id="qtyMax"
                inputMode="decimal"
                placeholder="напр. 100"
                value={filters.qtyMax}
                onChange={(e) => setRangeFilter("qtyMax", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="retailMin">Розничная цена от, ₽</Label>
              <Input
                id="retailMin"
                inputMode="decimal"
                value={filters.retailMin}
                onChange={(e) => setRangeFilter("retailMin", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="retailMax">Розничная цена до, ₽</Label>
              <Input
                id="retailMax"
                inputMode="decimal"
                value={filters.retailMax}
                onChange={(e) => setRangeFilter("retailMax", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="costMin">Себестоимость от, ₽</Label>
              <Input
                id="costMin"
                inputMode="decimal"
                value={filters.costMin}
                onChange={(e) => setRangeFilter("costMin", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="costMax">Себестоимость до, ₽</Label>
              <Input
                id="costMax"
                inputMode="decimal"
                value={filters.costMax}
                onChange={(e) => setRangeFilter("costMax", e.target.value)}
              />
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
              <p className="max-w-md text-xs text-muted-foreground">
                «Все партии» — суммируются все загрузки. Если выбрана одна партия, сводки и таблицы считаются только по ней;
                значения в фильтрах (ОП, склады, контрагенты) тоже только по этой партии.
              </p>
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
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Обновить
            </Button>
            <Button type="button" variant="secondary" onClick={() => bumpTableLimits()} disabled={loading}>
              +200 строк в таблицах
            </Button>
            <Button type="button" variant="outline" disabled={uploading}>
              <FileUp className="mr-2 h-4 w-4" />
              {uploading ? "Импорт..." : "Импорт через поле выше"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Stat title="Строк" value={numberRu.format(summary.rowsTotal)} hint={`${numberRu.format(summary.ordersTotal)} заказов`} />
        <Stat title="Пополнения" value={numberRu.format(summary.replenishmentRows)} hint={money(summary.replenishmentValue)} />
        <Stat title="Туристы" value={numberRu.format(summary.touristRows)} hint={money(summary.touristValue)} accent />
        <Stat title="Сумма" value={money(summary.valueTotal)} hint="по полю «Цена», целые ₽ (вверх при импорте)" />
        <Stat title="Период" value={`${dateRu(summary.minDate)} — ${dateRu(summary.maxDate)}`} hint={loading ? "загрузка..." : "по фильтру"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Частота по ОП</CardTitle>
            <CardDescription>
              ОП-получатели: кто чаще всего принимает перемещения и сколько из строк приходятся на туристов.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleTable
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

        <Card>
          <CardHeader>
            <CardTitle>Риск пополнения</CardTitle>
            <CardDescription>Товар был в пополнении, но до следующего пополнения ОП снова заказывал его туристом.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleTable
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

      <Card>
        <CardHeader>
          <CardTitle>Туристы по маршрутам и товарам</CardTitle>
          <CardDescription>Главная витрина для поиска товаров, которые путешествуют между ОП.</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleTable
            headers={["Получатель", "Отправитель", "Склад", "Товар", "Строк", "Заказов", "Сумма", "Период"]}
            rows={tourists.map((row) => [
              row.receiverOp,
              row.senderOp,
              row.receiverWarehouseType === row.senderWarehouseType
                ? row.receiverWarehouseType
                : `${row.senderWarehouseType} → ${row.receiverWarehouseType}`,
              row.itemArticle ? `${row.itemArticle} · ${row.itemName}` : row.itemName,
              numberRu.format(row.rows),
              numberRu.format(row.orders),
              money(row.valueTotal),
              `${dateRu(row.firstDate)} — ${dateRu(row.lastDate)}`,
            ])}
          />
        </CardContent>
      </Card>
    </main>
  )
}

function Stat({ title, value, hint, accent }: { title: string; value: string; hint: string; accent?: boolean }) {
  return (
    <Card className={accent ? "border-primary/30 bg-primary/5" : undefined}>
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
              <button
                type="button"
                className="mb-1 w-full rounded px-2 py-1 text-left text-sm text-muted-foreground hover:bg-muted"
                onClick={() => onChange([])}
              >
                Сбросить выбор
              </button>
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

function SimpleTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Данных пока нет. Загрузите файл или измените фильтры.</p>
  }
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b text-muted-foreground">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${row[0]}-${idx}`} className="border-b last:border-0">
              {row.map((cell, cellIdx) => (
                <td key={`${cellIdx}-${cell}`} className="max-w-[360px] px-3 py-2 align-top">
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
