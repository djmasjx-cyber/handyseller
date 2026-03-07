"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Button } from "@handyseller/ui"
import { X, Package, TrendingUp, ChevronUp, ChevronDown, ShoppingCart, Loader2 } from "lucide-react"
import Link from "next/link"

interface ProductMarketplaceStats {
  revenue: number
  orders: number
  delivered: number
}

interface ProductAnalyticsRow {
  productId: string
  title: string
  article: string | null
  imageUrl: string | null
  stock: number
  byMarketplace: Record<string, ProductMarketplaceStats>
  totalRevenue: number
  totalOrders: number
  totalDelivered: number
}

const MONTH_NAMES = [
  "январь", "февраль", "март", "апрель", "май", "июнь",
  "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
]

interface MonthDrilldownModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  type: "revenue" | "orders"
  month: string
  year: number
  token: string | null
}

export function MonthDrilldownModal({
  open,
  onOpenChange,
  type,
  month,
  year,
  token,
}: MonthDrilldownModalProps) {
  const [products, setProducts] = useState<ProductAnalyticsRow[]>([])
  const [loading, setLoading] = useState(false)
  const [sortBy, setSortBy] = useState<"revenue" | "orders">(type)
  const [sortDesc, setSortDesc] = useState(true)
  const fetchIdRef = useRef(0)

  const monthIndex = MONTH_NAMES.indexOf(month)
  const canFetch = open && !!token && monthIndex >= 0 && year > 0

  useEffect(() => {
    if (!canFetch) {
      setProducts([])
      setLoading(false)
      return
    }
    const fromDate = new Date(year, monthIndex, 1)
    const toDate = new Date(year, monthIndex + 1, 0, 23, 59, 59)
    const from = fromDate.toISOString()
    const to = toDate.toISOString()

    setSortBy(type)
    setLoading(true)
    setProducts([])

    const id = ++fetchIdRef.current
    const abort = new AbortController()

    fetch(`/api/analytics/products?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: abort.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((list) => {
        if (id !== fetchIdRef.current) return
        setProducts(Array.isArray(list) ? list : [])
      })
      .catch((err) => {
        if (id !== fetchIdRef.current || err?.name === "AbortError") return
        setProducts([])
      })
      .finally(() => {
        if (id === fetchIdRef.current) setLoading(false)
      })

    return () => {
      abort.abort()
    }
  }, [canFetch, monthIndex, year, type, token])

  const sortedProducts = useMemo(() => {
    const withSales = products.filter((p) => (p.totalRevenue ?? 0) > 0 || (p.totalOrders ?? 0) > 0)
    return [...withSales].sort((a, b) => {
      const aVal = sortBy === "revenue" ? (a.totalRevenue ?? 0) : (a.totalOrders ?? 0)
      const bVal = sortBy === "revenue" ? (b.totalRevenue ?? 0) : (b.totalOrders ?? 0)
      return sortDesc ? bVal - aVal : aVal - bVal
    })
  }, [products, sortBy, sortDesc])

  const toggleSort = (col: "revenue" | "orders") => {
    if (sortBy === col) setSortDesc((d) => !d)
    else {
      setSortBy(col)
      setSortDesc(true)
    }
  }

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = "" }
  }, [open])

  if (!open) return null

  const title = type === "revenue" ? "Выручка" : "Заказы"
  const SortIcon = sortDesc ? ChevronDown : ChevronUp

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        className="relative z-10 w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-xl border bg-background shadow-xl overflow-hidden pb-[env(safe-area-inset-bottom)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {type === "revenue" ? (
                <TrendingUp className="h-5 w-5" />
              ) : (
                <ShoppingCart className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="font-semibold text-base sm:text-lg truncate">{title} · {month} {year}</h2>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Топ товаров по {type === "revenue" ? "выручке" : "заказам"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="shrink-0 h-10 w-10" onClick={() => onOpenChange(false)} aria-label="Закрыть">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-16 min-h-[240px]">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Нет продаж за этот месяц</p>
              <p className="text-sm mt-1">Данные появятся после синхронизации заказов</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-px">
              <table className="w-full text-sm min-w-[320px]">
                <thead className="sticky top-0 bg-muted/95 backdrop-blur-sm border-b z-10">
                  <tr>
                    <th className="text-left font-medium p-2 sm:p-3">Товар</th>
                    <th
                      className="text-right font-medium p-2 sm:p-3 cursor-pointer hover:text-primary transition-colors select-none touch-manipulation"
                      onClick={() => toggleSort("revenue")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Выручка
                        {sortBy === "revenue" && <SortIcon className="h-4 w-4" />}
                      </span>
                    </th>
                    <th
                      className="text-right font-medium p-2 sm:p-3 cursor-pointer hover:text-primary transition-colors select-none touch-manipulation"
                      onClick={() => toggleSort("orders")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Заказы
                        {sortBy === "orders" && <SortIcon className="h-4 w-4" />}
                      </span>
                    </th>
                    <th className="text-right font-medium p-2 sm:p-3 text-muted-foreground hidden sm:table-cell">Выкуп %</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedProducts.map((row, index) => {
                    const totalOrders = Number(row?.totalOrders) || 0
                    const totalDelivered = Number(row?.totalDelivered) || 0
                    const deliveredPct = totalOrders > 0 ? Math.round((totalDelivered / totalOrders) * 100) : 0
                    const productName = (row?.title && String(row.title).trim()) || row?.article || "—"
                    const totalRevenue = Number(row?.totalRevenue) || 0
                    return (
                      <tr
                        key={row?.productId ?? index}
                        className="border-b last:border-0 hover:bg-muted/40 active:bg-muted/50 transition-colors"
                      >
                        <td className="p-2 sm:p-3">
                          <Link
                            href={`/dashboard/products/${row?.productId ?? ""}`}
                            className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity py-1"
                          >
                            {row?.imageUrl ? (
                              <img
                                src={String(row.imageUrl)}
                                alt=""
                                className="h-9 w-9 sm:h-10 sm:w-10 object-cover rounded-lg shrink-0"
                              />
                            ) : (
                              <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                <Package className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                              </div>
                            )}
                            <span className="font-medium truncate max-w-[140px] sm:max-w-[200px]">{productName}</span>
                          </Link>
                        </td>
                        <td className="p-2 sm:p-3 text-right font-medium whitespace-nowrap">
                          {totalRevenue.toLocaleString("ru-RU")} ₽
                        </td>
                        <td className="p-2 sm:p-3 text-right whitespace-nowrap">{totalOrders}</td>
                        <td className="p-2 sm:p-3 text-right text-muted-foreground hidden sm:table-cell">{deliveredPct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
