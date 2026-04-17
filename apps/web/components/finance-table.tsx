"use client"

import { Fragment, useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button, Badge } from "@handyseller/ui"
import { RefreshCw, Loader2, AlertCircle, Info, PencilLine, Check, X } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarketplaceCommissionBlock {
  marketplace: string
  scheme: string
  /** Цена на данном маркетплейсе (₽). 0 если не синкалось. */
  marketplacePrice: number
  salesCommissionPct: number
  salesCommissionAmt: number
  logisticsAmt: number
  firstMileAmt: number
  returnAmt: number
  acceptanceAmt: number
  totalFeeAmt: number
  /** FBO: стоимость хранения в рублях за 1 день */
  storageCostPerDay: number
  syncedAt: string | null
}

interface ProductFinanceRow {
  productId: string
  displayId: number
  title: string
  article: string | null
  imageUrl: string | null
  cost: number
  commissions: MarketplaceCommissionBlock[]
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MP_META: Record<string, { label: string; color: string; textColor: string }> = {
  OZON: { label: "Ozon", color: "#005BFF", textColor: "#ffffff" },
  WILDBERRIES: { label: "WB", color: "#CB11AB", textColor: "#ffffff" },
  YANDEX: { label: "Яндекс", color: "#FC3F1D", textColor: "#ffffff" },
  AVITO: { label: "Avito", color: "#00AAFF", textColor: "#ffffff" },
}

/**
 * Конфигурация 3-го столбца блока (после комиссии и логистики) — зависит от маркетплейса и схемы.
 * У WB нет понятия «первая миля», поэтому для WB FBS 3-й столбец отсутствует.
 */
function getMpCol3Config(mp: string, scheme: string): { label: string; value: (b: MarketplaceCommissionBlock) => number } | null {
  if (mp === "WILDBERRIES") {
    if (scheme === "FBO") return { label: "Приёмка", value: (b) => b.acceptanceAmt }
    // WB FBS: «Обработка» = приёмка/обработка отправления на СЦ или ПВЗ WB (первая миля)
    return { label: "Обработка", value: (b) => b.firstMileAmt }
  }
  // Ozon и другие площадки
  if (scheme === "FBO") return { label: "Фулфилмент", value: (b) => b.acceptanceAmt }
  return { label: "1-я миля", value: (b) => b.firstMileAmt }
}

const fmt = (v: number) =>
  v.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const fmtPct = (v: number) =>
  v.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MarketplaceCommissionColumns({
  block,
  cost,
  mp,
  storageDays,
}: {
  block: MarketplaceCommissionBlock
  cost: number
  mp: string
  storageDays: number
}) {
  const col3 = getMpCol3Config(mp, block.scheme)
  const isFBO = block.scheme === "FBO"

  // Цена на этом маркетплейсе (0 = ещё не синкалась)
  const price = block.marketplacePrice > 0 ? block.marketplacePrice : null

  // Хранение FBO: storageCostPerDay × оборачиваемость (дней)
  const storageTotal = isFBO ? block.storageCostPerDay * storageDays : 0

  const totalWithStorage = block.totalFeeAmt + storageTotal
  const isDeficit = price != null && price > 0 && price - totalWithStorage < 0
  const margin = price != null && price > 0 ? price - totalWithStorage : null
  const marginPct = margin != null && price && price > 0 ? (margin / price) * 100 : null

  /* --- Временно скрыто: цена безубыточности ---
  const commPct = block.salesCommissionPct / 100
  const fixedFees = block.logisticsAmt + (col3 ? col3.value(block) : 0) + block.returnAmt + storageTotal
  const breakEven = commPct < 1 ? Math.ceil((cost + fixedFees) / (1 - commPct)) : null
  --- */

  return (
    <>
      {/* Цена на этом маркетплейсе */}
      <td className="px-2 py-2 text-right text-sm tabular-nums font-medium border-l">
        {price != null ? (
          <>{fmt(price)} ₽</>
        ) : (
          <span className="text-muted-foreground text-xs">нет данных</span>
        )}
      </td>
      {/* Комиссия % + ₽ */}
      <td className="px-2 py-2 text-right text-sm tabular-nums text-muted-foreground">
        {fmtPct(block.salesCommissionPct)}
        <div className="text-xs">{fmt(block.salesCommissionAmt)} ₽</div>
      </td>
      {/* Логистика */}
      <td className="px-2 py-2 text-right text-sm tabular-nums">{fmt(block.logisticsAmt)} ₽</td>
      {/* 3-й столбец: Фулфилмент / 1-я миля / Приёмка — или пустая ячейка */}
      {col3 ? (
        <td className="px-2 py-2 text-right text-sm tabular-nums">{fmt(col3.value(block))} ₽</td>
      ) : (
        <td className="px-2 py-2 text-center text-xs text-muted-foreground">—</td>
      )}
      {/* Хранение: только для FBO */}
      {isFBO && (
        <td className="px-2 py-2 text-right text-sm tabular-nums text-sky-600">
          {storageTotal > 0 ? (
            <>
              {fmt(storageTotal)} ₽
              <div className="text-xs text-muted-foreground">{fmt(block.storageCostPerDay)}/день</div>
            </>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </td>
      )}
      {/* Возврат — скрыт, учтён в totalFeeAmt
      <td className="px-2 py-2 text-right text-sm tabular-nums">{fmt(block.returnAmt)} ₽</td>
      */}
      {/* Итого */}
      <td
        className={`px-2 py-2 text-right text-sm font-semibold tabular-nums ${
          isDeficit ? "text-destructive" : "text-foreground"
        }`}
      >
        {fmt(totalWithStorage)} ₽
      </td>
      {/* Маржа */}
      <td
        className={`px-2 py-2 text-right text-sm font-semibold tabular-nums ${
          marginPct == null
            ? "text-muted-foreground"
            : marginPct < 0
            ? "text-destructive"
            : marginPct < 15
            ? "text-amber-500"
            : "text-green-600"
        }`}
      >
        {marginPct != null ? (
          <>
            {fmt(margin!)} ₽
            <div className="text-xs">{fmtPct(marginPct)}</div>
          </>
        ) : (
          <span className="text-muted-foreground text-xs">нет цены</span>
        )}
        {/* Цена безубыточности — временно скрыта
        {breakEven != null && (
          <div className="text-xs text-muted-foreground font-normal mt-0.5">
            б/у: {fmt(breakEven)} ₽
          </div>
        )}
        */}
      </td>
    </>
  )
}

function CostCell({
  productId,
  cost,
  token,
  onUpdated,
}: {
  productId: string
  cost: number
  token: string
  onUpdated: (productId: string, newCost: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(String(cost))
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setValue(String(cost))
  }, [cost])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const save = async () => {
    const parsed = parseFloat(value.replace(",", "."))
    if (isNaN(parsed) || parsed < 0) {
      setEditing(false)
      setValue(String(cost))
      return
    }
    setSaving(true)
    try {
      await fetch(`/api/finance/products?productId=${productId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ cost: parsed }),
      })
      onUpdated(productId, parsed)
    } catch {
      // ignore — keep old value
    }
    setSaving(false)
    setEditing(false)
  }

  const cancel = () => {
    setValue(String(cost))
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save()
            if (e.key === "Escape") cancel()
          }}
          className="w-20 rounded border border-input px-1.5 py-0.5 text-sm text-right bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button onClick={save} disabled={saving} className="text-green-600 hover:text-green-700" title="Сохранить">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        </button>
        <button onClick={cancel} className="text-muted-foreground hover:text-destructive" title="Отмена">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1 text-sm tabular-nums text-right w-full justify-end hover:text-primary"
      title="Редактировать себестоимость"
    >
      {fmt(cost)} ₽
      <PencilLine className="h-3 w-3 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  scheme: "FBO" | "FBS"
}

type FinanceSortField = "price" | "commission" | "logistics" | "col3" | "storage" | "total" | "margin"

interface FinanceSortKey {
  marketplace: string
  field: FinanceSortField
}

type SortDirection = "asc" | "desc"

export function FinanceTable({ scheme }: Props) {
  const router = useRouter()
  const PAGE_SIZE = 20
  const [rows, setRows] = useState<ProductFinanceRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  /** Оборачиваемость для расчёта хранения FBO (дней) */
  const [storageDays, setStorageDays] = useState(30)
  const [sortKey, setSortKey] = useState<FinanceSortKey | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  useEffect(() => { setMounted(true) }, [])

  const token = mounted && typeof window !== "undefined" ? localStorage.getItem("accessToken") : null

  const fetchRows = useCallback(async (reset = true, nextOffset?: number) => {
    if (!token) return
    const targetOffset = reset ? 0 : (nextOffset ?? offset)
    if (reset) {
      setLoading(true)
      setError(null)
    } else {
      setLoadingMore(true)
    }

    try {
      const params = new URLSearchParams({
        scheme,
        limit: String(PAGE_SIZE),
        offset: String(targetOffset),
      })
      const r = await fetch(`/api/finance/products/paged?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (r.status === 401) {
        router.replace("/login?from=" + encodeURIComponent(`/dashboard/finance/${scheme.toLowerCase()}`))
        throw new Error("401")
      }
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.error ?? "Ошибка")

      const items = Array.isArray(data?.items) ? (data.items as ProductFinanceRow[]) : []
      setRows((prev) => (reset ? items : [...prev, ...items]))
      setTotalRows(typeof data?.total === "number" ? data.total : 0)
      setHasMore(Boolean(data?.hasMore))
      const newOffset = targetOffset + items.length
      setOffset(newOffset)
      // Берём дату синхронизации из первой строки
      const first = items?.[0]?.commissions?.[0]
      if (first?.syncedAt) setSyncedAt(first.syncedAt)
    } catch (e) {
      if (e instanceof Error && e.message !== "401") {
        setError(e.message)
      }
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [token, scheme, router, offset])

  useEffect(() => {
    if (mounted && token) {
      setOffset(0)
      setHasMore(true)
      fetchRows(true)
    }
  }, [mounted, token, fetchRows])

  // Marketplace list for columns
  const marketplaces = Array.from(
    new Set(rows.flatMap((r) => r.commissions.map((c) => c.marketplace)))
  ).sort()

  // Инициализация сортировки по умолчанию: маржа по первому маркетплейсу
  useEffect(() => {
    if (!sortKey && marketplaces.length > 0) {
      setSortKey({ marketplace: marketplaces[0], field: "margin" })
      setSortDirection("desc")
    }
  }, [marketplaces, sortKey])

  const toggleSort = (marketplace: string, field: FinanceSortField) => {
    setSortKey((prevKey) => {
      if (prevKey && prevKey.marketplace === marketplace && prevKey.field === field) {
        setSortDirection((prevDir) => (prevDir === "desc" ? "asc" : "desc"))
        return prevKey
      }
      setSortDirection("desc")
      return { marketplace, field }
    })
  }

  const getMetricValue = (row: ProductFinanceRow, marketplace: string, field: FinanceSortField): number | null => {
    const block = row.commissions.find((c) => c.marketplace === marketplace && c.scheme === scheme)
    if (!block) return null

    const isFBO = block.scheme === "FBO"
    const col3 = getMpCol3Config(marketplace, block.scheme)
    const price = block.marketplacePrice > 0 ? block.marketplacePrice : null
    const storageTotal = isFBO ? block.storageCostPerDay * storageDays : 0
    const totalWithStorage = block.totalFeeAmt + storageTotal
    const margin = price != null && price > 0 ? price - totalWithStorage : null

    switch (field) {
      case "price":
        return price
      case "commission":
        return block.salesCommissionAmt
      case "logistics":
        return block.logisticsAmt
      case "col3":
        return col3 ? col3.value(block) : null
      case "storage":
        return storageTotal || null
      case "total":
        return totalWithStorage
      case "margin":
        return margin
      default:
        return null
    }
  }

  const sortedRows = (() => {
    if (!sortKey) return rows
    const { marketplace, field } = sortKey
    const dir = sortDirection === "desc" ? -1 : 1

    return [...rows].sort((a, b) => {
      const va = getMetricValue(a, marketplace, field)
      const vb = getMetricValue(b, marketplace, field)

      // null всегда в конце
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1

      if (va === vb) return 0
      return va > vb ? dir : -dir
    })
  })()

  const handleSync = async () => {
    if (!token) return
    setSyncing(true)
    try {
      await fetch("/api/finance/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      setOffset(0)
      setHasMore(true)
      fetchRows(true)
    } catch {
      // ignore
    } finally {
      setSyncing(false)
    }
  }

  const handleCostUpdated = (productId: string, newCost: number) => {
    setRows((prev) => prev.map((r) => r.productId === productId ? { ...r, cost: newCost } : r))
  }

  if (!mounted || loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Юнит-экономика по схеме <span className="font-medium">{scheme}</span>
            <span className="ml-2 text-xs text-muted-foreground/70">
              · загружено {rows.length} из {totalRows}
            </span>
            {syncedAt && (
              <span className="ml-2 text-xs text-muted-foreground/70">
                · тарифы от {new Date(syncedAt).toLocaleDateString("ru-RU")}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Оборачиваемость — временно скрыта (нет синка цен с маркетов)
          {scheme === "FBO" && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Оборачиваемость:</span>
              <input type="number" min={1} max={365} value={storageDays}
                onChange={(e) => setStorageDays(Math.max(1, Math.min(365, Number(e.target.value) || 30)))}
                className="w-16 rounded border border-input px-2 py-0.5 text-sm text-right bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span>дней</span>
            </label>
          )}
          */}
          <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5">{syncing ? "Синхронизация..." : "Обновить тарифы"}</span>
          </Button>
        </div>
      </div>

      {/* Notice */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        <Info className="h-4 w-4 mt-1 flex-shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">Данные носят ориентировочный характер</p>
          <p>
            Цены появятся после нажатия «Обновить тарифы» — они берутся из последней синхронизации с маркетплейсом.
            Комиссии Ozon — точные данные из API. Комиссии и логистика WB — <em>расчётные</em>: усреднены
            по тарифам всех складов и умножены на объём товара из карточки. Фактические списания могут
            отличаться из-за акций, СПП и динамических коэффициентов.
            {scheme === "FBO" && " Хранение рассчитано как тариф/день × 30 дней оборачиваемости (по умолчанию)."}
          </p>
          <p className="text-xs opacity-80">
            Используйте страницу как инструмент для первичного анализа ценообразования, а не для точной финансовой отчётности.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {rows.length === 0 && !error ? (
        <div className="rounded-lg border bg-muted/30 p-12 text-center">
          <p className="text-muted-foreground font-medium mb-2">Нет данных</p>
          <p className="text-sm text-muted-foreground mb-4">
            Добавьте товары, подключите Ozon или WB и нажмите «Обновить тарифы».
          </p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" size="sm" asChild>
              <Link href="/dashboard/products">Перейти к товарам</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Обновить тарифы
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              {/* Row 1: marketplace group headers */}
              <tr className="border-b bg-muted/50">
                <th className="text-left font-medium p-3 min-w-[200px]" rowSpan={2}>Товар</th>
                <th className="text-right font-medium px-2 py-2" rowSpan={2}>Себест. ₽</th>
                {marketplaces.map((mp) => {
                  const meta = MP_META[mp] ?? { label: mp, color: "#888", textColor: "#fff" }
                  // FBO: 7 cols (цена, комиссия, логистика, приёмка, хранение, итого, маржа)
                  // FBS: 6 cols (цена, комиссия, логистика, обработка, итого, маржа) — хранение н/а
                  const colCount = scheme === "FBO" ? 7 : 6
                  return (
                    <th
                      key={mp}
                      colSpan={colCount}
                      className="px-2 py-2 text-center font-semibold text-xs tracking-wide border-l"
                      style={{ backgroundColor: meta.color, color: meta.textColor }}
                    >
                      {meta.label} · {scheme}
                    </th>
                  )
                })}
              </tr>
              {/* Row 2: sub-column headers */}
              <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                {marketplaces.map((mp) => {
                  const col3 = getMpCol3Config(mp, scheme)
                  return (
                    <Fragment key={mp}>
                      <th className="px-2 py-1.5 text-right font-medium border-l">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-primary"
                          onClick={() => toggleSort(mp, "price")}
                        >
                          Цена ₽
                          {sortKey?.marketplace === mp && sortKey.field === "price" && (
                            <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                          )}
                        </button>
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-primary"
                          onClick={() => toggleSort(mp, "commission")}
                        >
                          Комиссия
                          {sortKey?.marketplace === mp && sortKey.field === "commission" && (
                            <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                          )}
                        </button>
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-primary"
                          onClick={() => toggleSort(mp, "logistics")}
                        >
                          Логистика
                          {sortKey?.marketplace === mp && sortKey.field === "logistics" && (
                            <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                          )}
                        </button>
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-primary"
                          onClick={() => toggleSort(mp, "col3")}
                        >
                          {col3?.label ?? "—"}
                          {sortKey?.marketplace === mp && sortKey.field === "col3" && (
                            <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                          )}
                        </button>
                      </th>
                      {/* Хранение: только для FBO */}
                      {scheme === "FBO" && (
                        <th className="px-2 py-1.5 text-right font-medium text-sky-700">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 hover:text-primary"
                            onClick={() => toggleSort(mp, "storage")}
                          >
                            Хранение ×{storageDays}д
                            {sortKey?.marketplace === mp && sortKey.field === "storage" && (
                              <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                            )}
                          </button>
                        </th>
                      )}
                      {/* Столбец Возврат скрыт — учтён в «Итого»
                      <th className="px-2 py-1.5 text-right font-medium">Возврат</th>
                      */}
                      <th className="px-2 py-1.5 text-right font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-primary"
                          onClick={() => toggleSort(mp, "total")}
                        >
                          Итого
                          {sortKey?.marketplace === mp && sortKey.field === "total" && (
                            <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                          )}
                        </button>
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-primary"
                          onClick={() => toggleSort(mp, "margin")}
                        >
                          Маржа
                          {sortKey?.marketplace === mp && sortKey.field === "margin" && (
                            <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                          )}
                        </button>
                      </th>
                    </Fragment>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => {
                const commByMp: Record<string, MarketplaceCommissionBlock> = {}
                for (const c of row.commissions) {
                  if (c.scheme === scheme) commByMp[c.marketplace] = c
                }

                return (
                  <tr key={row.productId} className={`border-b last:border-0 ${idx % 2 === 0 ? "bg-background" : "bg-muted/10"} hover:bg-muted/20`}>
                    {/* Product */}
                    <td className="p-3">
                      <Link href={`/dashboard/products/${row.productId}`} className="flex items-center gap-2 hover:underline">
                        {row.imageUrl ? (
                          <Image
                            src={row.imageUrl}
                            alt={row.title}
                            width={32}
                            height={32}
                            className="rounded object-cover flex-shrink-0"
                            unoptimized
                          />
                        ) : (
                          <div className="w-8 h-8 rounded bg-muted flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate max-w-[160px]">{row.title}</div>
                          {row.article && (
                            <div className="text-xs text-muted-foreground">арт. {row.article}</div>
                          )}
                        </div>
                      </Link>
                    </td>
                    {/* Cost — editable */}
                    <td className="px-2 py-2 text-right">
                      {token ? (
                        <CostCell
                          productId={row.productId}
                          cost={row.cost}
                          token={token}
                          onUpdated={handleCostUpdated}
                        />
                      ) : (
                        <span className="text-sm tabular-nums">{fmt(row.cost)} ₽</span>
                      )}
                    </td>
                    {/* Marketplace columns */}
                    {marketplaces.map((mp) => {
                      const block = commByMp[mp]
                      if (!block) {
                        const emptyCount = scheme === "FBO" ? 7 : 6
                        return (
                          <>
                            {Array.from({ length: emptyCount }).map((_, i) => (
                              <td key={`${mp}-empty-${i}`} className="px-2 py-2 text-center text-xs text-muted-foreground border-l first:border-l">—</td>
                            ))}
                          </>
                        )
                      }
                      return (
                        <MarketplaceCommissionColumns
                          key={mp}
                          block={block}
                          cost={row.cost}
                          mp={mp}
                          storageDays={storageDays}
                        />
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {!error && rows.length > 0 && hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => fetchRows(false, offset)}
            disabled={loadingMore}
          >
            {loadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Показать еще
          </Button>
        </div>
      )}
    </div>
  )
}
