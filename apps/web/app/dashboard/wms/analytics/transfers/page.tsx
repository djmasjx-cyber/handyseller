"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@handyseller/ui"
import { FileUp, RefreshCw } from "lucide-react"
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
  senderWarehouse: string
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
  receiverWarehouse: string
  senderWarehouse: string
  item: string
  kind: "" | TransferKind
  batchId: string
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

function queryFromFilters(filters: Filters): string {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value) qs.set(key, value)
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
  const [byOp, setByOp] = useState<ByOpRow[]>([])
  const [tourists, setTourists] = useState<TouristRow[]>([])
  const [risks, setRisks] = useState<RiskRow[]>([])
  const [filters, setFilters] = useState<Filters>({
    from: "",
    to: "",
    receiverWarehouse: "",
    senderWarehouse: "",
    item: "",
    kind: "",
    batchId: "",
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
      const [summaryRes, importsRes, byOpRes, touristsRes, risksRes] = await Promise.all([
        authFetch(`/api/wms/v1/analytics/transfers/summary${query}`, { headers }),
        authFetch("/api/wms/v1/analytics/imports", { headers }),
        authFetch(`/api/wms/v1/analytics/transfers/by-op${query}`, { headers }),
        authFetch(`/api/wms/v1/analytics/transfers/tourists${query}`, { headers }),
        authFetch(`/api/wms/v1/analytics/transfers/replenishment-risks${query}`, { headers }),
      ])
      if (!summaryRes.ok) throw new Error("Не удалось загрузить сводку аналитики.")
      setSummary((await summaryRes.json()) as Summary)
      setImports(importsRes.ok ? ((await importsRes.json()) as ImportBatch[]) : [])
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
      const data = (await res.json().catch(() => ({}))) as unknown
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

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
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
          <CardDescription>Загрузите Excel `Заказы на перемещения.xlsx` или отфильтруйте уже загруженные партии.</CardDescription>
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
            <div className="space-y-1">
              <Label htmlFor="receiver">ОП-получатель</Label>
              <Input id="receiver" value={filters.receiverWarehouse} onChange={(e) => setFilter("receiverWarehouse", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sender">Отправитель</Label>
              <Input id="sender" value={filters.senderWarehouse} onChange={(e) => setFilter("senderWarehouse", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="item">Товар / артикул</Label>
              <Input id="item" value={filters.item} onChange={(e) => setFilter("item", e.target.value)} />
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
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Обновить
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
        <Stat title="Сумма" value={money(summary.valueTotal)} hint="по полю Цена" />
        <Stat title="Период" value={`${dateShort(summary.minDate)} — ${dateShort(summary.maxDate)}`} hint={loading ? "загрузка..." : "по фильтру"} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Частота по ОП</CardTitle>
            <CardDescription>Кто чаще всего заказывает перемещения и сколько из них туристы.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleTable
              headers={["ОП", "Строк", "Заказов", "Туристы", "Сумма туристов"]}
              rows={byOp.slice(0, 20).map((row) => [
                row.receiverWarehouse,
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
              headers={["ОП", "Товар", "После пополнения", "Туристов", "Сумма"]}
              rows={risks.slice(0, 20).map((row) => [
                row.receiverWarehouse,
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
            headers={["Получатель", "Отправитель", "Товар", "Строк", "Заказов", "Сумма", "Период"]}
            rows={tourists.slice(0, 50).map((row) => [
              row.receiverWarehouse,
              row.senderWarehouse,
              row.itemArticle ? `${row.itemArticle} · ${row.itemName}` : row.itemName,
              numberRu.format(row.rows),
              numberRu.format(row.orders),
              money(row.valueTotal),
              `${dateShort(row.firstDate)} — ${dateShort(row.lastDate)}`,
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
