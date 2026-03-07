"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@handyseller/ui"
import { X, Package, TrendingUp, ChevronUp, ChevronDown, ShoppingCart } from "lucide-react"
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

  const monthIndex = MONTH_NAMES.indexOf(month)
  const fromDate = monthIndex >= 0 && year ? new Date(year, monthIndex, 1) : null
  const toDate = monthIndex >= 0 && year ? new Date(year, monthIndex + 1, 0, 23, 59, 59) : null

  useEffect(() => {
    if (!open || !token || !fromDate || !toDate) {
      setProducts([])
      return
    }
    setLoading(true)
    setSortBy(type)
    const from = fromDate.toISOString()
    const to = toDate.toISOString()
    fetch(`/api/analytics/products?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setProducts(Array.isArray(list) ? list : []))
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
  }, [open, token, fromDate, toDate, type])

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        className="relative z-10 w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border bg-background shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {type === "revenue" ? (
                <TrendingUp className="h-5 w-5" />
              ) : (
                <ShoppingCart className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="font-semibold text-lg">{title} · {month} {year}</h2>
              <p className="text-sm text-muted-foreground">
                Топ товаров по {type === "revenue" ? "выручке" : "количеству заказов"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Закрыть">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p className="font-medium">Нет продаж за этот месяц</p>
              <p className="text-sm mt-1">Данные появятся после синхронизации заказов</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm border-b">
                  <tr>
                    <th className="text-left font-medium p-3">Товар</th>
                    <th
                      className="text-right font-medium p-3 cursor-pointer hover:text-primary transition-colors select-none"
                      onClick={() => toggleSort("revenue")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Выручка
                        {sortBy === "revenue" && <SortIcon className="h-4 w-4" />}
                      </span>
                    </th>
                    <th
                      className="text-right font-medium p-3 cursor-pointer hover:text-primary transition-colors select-none"
                      onClick={() => toggleSort("orders")}
                    >
                      <span className="inline-flex items-center gap-1">
                        Заказы
                        {sortBy === "orders" && <SortIcon className="h-4 w-4" />}
                      </span>
                    </th>
                    <th className="text-right font-medium p-3 text-muted-foreground">Выкуп %</th>
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
                        className="border-b last:border-0 hover:bg-muted/40 transition-colors"
                      >
                        <td className="p-3">
                          <Link
                            href={`/dashboard/products/${row?.productId ?? ""}`}
                            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                          >
                            {row?.imageUrl ? (
                              <img
                                src={String(row.imageUrl)}
                                alt=""
                                className="h-10 w-10 object-cover rounded-lg shrink-0"
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                                <Package className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <span className="font-medium truncate max-w-[200px]">{productName}</span>
                          </Link>
                        </td>
                        <td className="p-3 text-right font-medium">
                          {totalRevenue.toLocaleString("ru-RU")} ₽
                        </td>
                        <td className="p-3 text-right">{totalOrders}</td>
                        <td className="p-3 text-right text-muted-foreground">{deliveredPct}%</td>
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
