"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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

  // Хранение — только для FBO: storageCostPerDay × кол-во дней оборачиваемости
  const storageTotal = isFBO ? block.storageCostPerDay * storageDays : 0

  // totalFeeAmt из базы НЕ включает хранение (хранение динамическое, зависит от дней)
  const totalWithStorage = block.totalFeeAmt + storageTotal

  // Цена безубыточности: price = (cost + fixedFees) / (1 - commPct/100)
  // fixedFees = logistics + acceptance/firstMile + return + storage
  const commPct = block.salesCommissionPct / 100
  const fixedFees =
    block.logisticsAmt +
    (col3 ? col3.value(block) : 0) +
    block.returnAmt +
    storageTotal
  const breakEven =
    commPct < 1 ? Math.ceil((cost + fixedFees) / (1 - commPct)) : null

  const isDeficit = price != null && price > 0 && price - totalWithStorage < 0
  const margin = price != null && price > 0 ? price - totalWithStorage : null
  const marginPct = margin != null && price && price > 0 ? (margin / price) * 100 : null

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
      {/* Хранение: только для FBO, для FBS — прочерк */}
      {isFBO ? (
        <td className="px-2 py-2 text-right text-sm tabular-nums text-sky-600">
          {fmt(storageTotal)} ₽
          <div className="text-xs text-muted-foreground">{fmt(block.storageCostPerDay)}/день</div>
        </td>
      ) : (
        <td className="px-2 py-2 text-center text-xs text-muted-foreground">—</td>
      )}
      {/* Возврат — скрыт, но учтён в totalFeeAmt
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
      {/* Маржа + цена безубыточности */}
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
        {breakEven != null && (
          <div className="text-xs text-muted-foreground font-normal mt-0.5" title="Минимальная цена при маржа = 0">
            б/у: {fmt(breakEven)} ₽
          </div>
        )}
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

export function FinanceTable({ scheme }: Props) {
  const router = useRouter()
  const [rows, setRows] = useState<ProductFinanceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  /** Оборачиваемость для расчёта хранения FBO (дней) */
  const [storageDays, setStorageDays] = useState(30)

  useEffect(() => { setMounted(true) }, [])

  const token = mounted && typeof window !== "undefined" ? localStorage.getItem("accessToken") : null

  const fetchRows = useCallback(() => {
    if (!token) return
    setLoading(true)
    setError(null)
    fetch(`/api/finance/products?scheme=${scheme}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (r.status === 401) {
          router.replace("/login?from=" + encodeURIComponent(`/dashboard/finance/${scheme.toLowerCase()}`))
          throw new Error("401")
        }
        return r.ok ? r.json() : r.json().then((d) => { throw new Error(d?.error ?? "Ошибка") })
      })
      .then((data: ProductFinanceRow[]) => {
        setRows(Array.isArray(data) ? data : [])
        // Берём дату синхронизации из первой строки
        const first = data?.[0]?.commissions?.[0]
        if (first?.syncedAt) setSyncedAt(first.syncedAt)
      })
      .catch((e) => { if (e.message !== "401") setError(e.message) })
      .finally(() => setLoading(false))
  }, [token, scheme, router])

  useEffect(() => {
    if (mounted && token) fetchRows()
  }, [mounted, token, fetchRows])

  const handleSync = async () => {
    if (!token) return
    setSyncing(true)
    try {
      await fetch("/api/finance/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      fetchRows()
    } catch {
      // ignore
    } finally {
      setSyncing(false)
    }
  }

  const handleCostUpdated = (productId: string, newCost: number) => {
    setRows((prev) => prev.map((r) => r.productId === productId ? { ...r, cost: newCost } : r))
  }

  // Collect unique marketplaces from all rows
  const marketplaces = Array.from(
    new Set(rows.flatMap((r) => r.commissions.map((c) => c.marketplace)))
  ).sort()

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
            {syncedAt && (
              <span className="ml-2 text-xs text-muted-foreground/70">
                · тарифы от {new Date(syncedAt).toLocaleDateString("ru-RU")}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {scheme === "FBO" && (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Оборачиваемость:</span>
              <input
                type="number"
                min={1}
                max={365}
                value={storageDays}
                onChange={(e) => setStorageDays(Math.max(1, Math.min(365, Number(e.target.value) || 30)))}
                className="w-16 rounded border border-input px-2 py-0.5 text-sm text-right bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span>дней</span>
            </label>
          )}
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
            Цены берутся из последней синхронизации с маркетплейсом.
            Комиссии Ozon — точные данные из API. Комиссии и логистика WB — <em>расчётные</em>: усреднены
            по тарифам всех складов, умножены на объём товара из карточки. Фактические списания в отчёте
            WB могут отличаться из-за акций, СПП, динамических складских коэффициентов и округлений.
            {scheme === "FBO" && " Хранение = тариф/день × оборачиваемость (настраивается выше)."}
            {" "}«Б/у» — цена безубыточности: минимальная цена при нулевой марже.
          </p>
          <p className="text-xs opacity-80">
            Используйте как инструмент для первичного анализа ценообразования, а не для точных финансовых расчётов.
            Нажмите «Обновить тарифы» чтобы актуализировать данные.
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
                  // 7 cols: цена на маркете, комиссия, логистика, 3-й (приёмка/1-я миля/—), хранение, итого, маржа
                  // Возврат скрыт (учтён в итого)
                  return (
                    <th
                      key={mp}
                      colSpan={7}
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
                    <>
                      <th key={`${mp}-prc`} className="px-2 py-1.5 text-right font-medium border-l">Цена ₽</th>
                      <th key={`${mp}-com`} className="px-2 py-1.5 text-right font-medium">Комиссия</th>
                      <th key={`${mp}-log`} className="px-2 py-1.5 text-right font-medium">Логистика</th>
                      <th key={`${mp}-acc`} className="px-2 py-1.5 text-right font-medium">
                        {col3?.label ?? "—"}
                      </th>
                      {/* Хранение: для FBO показываем ×дней, для FBS — «—» */}
                      <th key={`${mp}-str`} className="px-2 py-1.5 text-right font-medium text-sky-700">
                        {scheme === "FBO" ? `Хранение ×${storageDays}д` : "Хранение"}
                      </th>
                      {/* Столбец Возврат скрыт — учтён в «Итого»
                      <th key={`${mp}-ret`} className="px-2 py-1.5 text-right font-medium">Возврат</th>
                      */}
                      <th key={`${mp}-tot`} className="px-2 py-1.5 text-right font-medium">Итого</th>
                      <th key={`${mp}-mrg`} className="px-2 py-1.5 text-right font-medium">Маржа / б/у</th>
                    </>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
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
                        return (
                          <>
                            {Array.from({ length: 7 }).map((_, i) => (
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
    </div>
  )
}
