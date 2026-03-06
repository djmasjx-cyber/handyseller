"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@handyseller/ui"
import {
  BarChart3,
  TrendingUp,
  Package,
  ShoppingCart,
  Loader2,
  RefreshCw,
  AlertCircle,
  Lightbulb,
  Store,
  Target,
} from "lucide-react"
import Link from "next/link"

const MARKETPLACE_META: Record<string, { label: string; color: string }> = {
  wildberries: { label: "WB", color: "!bg-[#CB11AB] !border-[#CB11AB] text-white" },
  ozon: { label: "Ozon", color: "!bg-[#005BFF] !border-[#005BFF] text-white" },
  yandex: { label: "Яндекс", color: "!bg-[#FC3F1D] !border-[#FC3F1D] text-white" },
}

interface MarketplaceStats {
  totalOrders: number
  delivered: number
  cancelled: number
  revenue: number
  linkedProductsCount?: number
}

interface DashboardData {
  summary: {
    totalProducts: number
    totalRevenue: number
    totalOrders: number
    newOrdersCount: number
    ordersRequireAttention: number
    connectedMarketplaces: number
    marketplaceLabel: string
    totalProductsOnMarketplaces?: number
  }
  statistics?: Record<string, MarketplaceStats>
}

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

export default function AnalyticsPage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [productsLoading, setProductsLoading] = useState(true)
  const [productStats, setProductStats] = useState<ProductAnalyticsRow[]>([])
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const token = mounted && typeof window !== "undefined" ? localStorage.getItem("accessToken") : null

  const s = (data?.summary ?? {}) as DashboardData["summary"]
  const stats = data?.statistics ?? {}

  const perMarketplace = useMemo(
    () => Object.entries(stats) as [string, MarketplaceStats][],
    [stats],
  )

  const perMarketplaceRevenueLabel =
    perMarketplace.length > 0
      ? perMarketplace
          .map(([key, stat]) => {
            const meta = MARKETPLACE_META[key] ?? { label: key, color: "" }
            return `${meta.label}: ${(stat.revenue ?? 0).toLocaleString("ru-RU")} ₽`
          })
          .join(" · ")
      : null

  const perMarketplaceOrdersLabel =
    perMarketplace.length > 0
      ? perMarketplace
          .map(([key, stat]) => {
            const meta = MARKETPLACE_META[key] ?? { label: key, color: "" }
            return `${meta.label}: ${stat.totalOrders ?? 0} зак.`
          })
          .join(" · ")
      : null

  const perMarketplaceProductsLabel =
    perMarketplace.length > 0
      ? perMarketplace
          .map(([key, stat]) => {
            const meta = MARKETPLACE_META[key] ?? { label: key, color: "" }
            const count = stat.linkedProductsCount ?? 0
            return `${meta.label}: ${count}`
          })
          .join(" · ")
      : null

  const fetchData = () => {
    if (!token) return
    setLoading(true)
    fetch("/api/dashboard", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 401) {
          router.replace("/login?from=" + encodeURIComponent("/dashboard/analytics"))
          throw new Error("401")
        }
        return r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))
      })
      .then((d) => {
        if (d?.summary) setData(d)
        else setData(null)
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }

  const fetchProductStats = () => {
    if (!token) return
    setProductsLoading(true)
    fetch("/api/analytics/products", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setProductStats(Array.isArray(list) ? list : []))
      .catch(() => setProductStats([]))
      .finally(() => setProductsLoading(false))
  }

  useEffect(() => {
    if (!mounted) return
    if (!token) {
      router.replace("/login?from=" + encodeURIComponent("/dashboard/analytics"))
      return
    }
    fetchData()
    fetchProductStats()
  }, [mounted, token, router])

  if (!mounted || loading || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BarChart3 className="h-7 w-7 text-primary" />
            Аналитика
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Сводка по продажам и заказам с маркетплейсов за текущий календарный месяц.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { fetchData(); fetchProductStats(); }} title="Обновить данные">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* KPI по площадкам */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Выручка</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(s.totalRevenue ?? 0).toLocaleString("ru-RU")} ₽
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              за текущий месяц · {s.totalOrders ?? 0} заказов
            </p>
            {perMarketplaceRevenueLabel && (
              <p className="text-xs text-muted-foreground mt-1">{perMarketplaceRevenueLabel}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Заказы</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.totalOrders ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {s.newOrdersCount ?? 0} новых требуют внимания
            </p>
            {perMarketplaceOrdersLabel && (
              <p className="text-xs text-muted-foreground mt-1">{perMarketplaceOrdersLabel}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Активные товары</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.totalProducts ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Товары со склада «Мой склад»</p>
          </CardContent>
        </Card>
      </div>

      {/* Сравнение WB / Ozon */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            По площадкам
          </CardTitle>
          <CardDescription>
            Выручка и заказы по каждому подключённому маркетплейсу
          </CardDescription>
        </CardHeader>
        <CardContent>
          {Object.keys(stats).length === 0 ? (
            <div className="p-6 rounded-lg bg-muted/50 text-center text-muted-foreground">
              <Store className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="font-medium">Нет данных по площадкам</p>
              <p className="text-sm mt-1">Подключите WB или Ozon в разделе Маркетплейсы и дождитесь синхронизации</p>
              <Button variant="outline" size="sm" className="mt-4" asChild>
                <Link href="/dashboard/marketplaces">Перейти к маркетплейсам</Link>
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {(Object.entries(stats) as [string, MarketplaceStats][]).map(([key, stat]) => {
                const meta = MARKETPLACE_META[key] ?? { label: key, color: "" }
                return (
                  <div
                    key={key}
                    className="flex flex-col gap-3 rounded-lg border p-4 bg-card"
                  >
                    <Badge className={meta.color}>{meta.label}</Badge>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Выручка</p>
                        <p className="font-semibold">{(stat.revenue ?? 0).toLocaleString("ru-RU")} ₽</p>
                        <p className="text-xs text-muted-foreground">сумма выкупленных</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Заказы</p>
                        <p className="font-semibold">{stat.totalOrders ?? 0}</p>
                        <p className="text-xs text-muted-foreground">всего за месяц</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Выкуплено</p>
                        <p className="font-semibold text-green-600">{stat.delivered ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Отказы</p>
                        <p className="font-semibold text-red-600">{stat.cancelled ?? 0}</p>
                        <p className="text-xs text-muted-foreground">покупатель отказался</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Товаров</p>
                        <p className="font-semibold">{stat.linkedProductsCount ?? 0}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Аналитика по товарам */}
      <Card>
        <CardHeader>
          <CardTitle>Аналитика по товарам</CardTitle>
          <CardDescription>
            Выручка и заказы по каждому товару за текущий месяц. Сравнение WB и Ozon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {productsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : productStats.length === 0 ? (
            <div className="p-6 rounded-lg bg-muted/30 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="font-medium">Нет продаж за месяц</p>
              <p className="text-sm mt-1">Появятся после синхронизации заказов с маркетплейсов</p>
            </div>
          ) : (
            <div className="overflow-x-auto font-sans">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left font-medium p-3">Товар</th>
                    <th className="text-right font-medium p-3">WB</th>
                    <th className="text-right font-medium p-3">Ozon</th>
                    <th className="text-right font-medium p-3">Итого</th>
                    <th className="text-right font-medium p-3">Выкуп %</th>
                    <th className="text-right font-medium p-3">Остаток</th>
                  </tr>
                </thead>
                <tbody>
                  {productStats.map((row, index) => {
                    const byMp = row?.byMarketplace ?? {}
                    const wb = byMp.WILDBERRIES ?? { revenue: 0, orders: 0, delivered: 0 }
                    const ozon = byMp.OZON ?? { revenue: 0, orders: 0, delivered: 0 }
                    const totalOrders = Number(row?.totalOrders) || 0
                    const totalDelivered = Number(row?.totalDelivered) || 0
                    const deliveredPct = totalOrders > 0 ? Math.round((totalDelivered / totalOrders) * 100) : 0
                    const productName = (row?.title && String(row.title).trim()) || row?.article || "—"
                    const totalRevenue = Number(row?.totalRevenue) || 0
                    const stock = Number(row?.stock) ?? 0
                    return (
                      <tr key={row?.productId ?? `product-${index}`} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3">
                          <Link href={`/dashboard/products/${row?.productId ?? ""}`} className="flex items-center gap-2 hover:underline">
                            {row?.imageUrl ? (
                              <img src={String(row.imageUrl)} alt="" className="h-10 w-10 object-cover rounded" />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                <Package className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <span className="font-medium truncate max-w-[180px]">{productName}</span>
                          </Link>
                        </td>
                        <td className="p-3 text-right">
                          <span className="font-medium">{(wb.revenue ?? 0).toLocaleString("ru-RU")} ₽</span>
                          <span className="block text-xs text-muted-foreground">{wb.orders ?? 0} зак.</span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="font-medium">{(ozon.revenue ?? 0).toLocaleString("ru-RU")} ₽</span>
                          <span className="block text-xs text-muted-foreground">{ozon.orders ?? 0} зак.</span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="font-semibold">{totalRevenue.toLocaleString("ru-RU")} ₽</span>
                          <span className="block text-xs text-muted-foreground">{totalOrders} зак.</span>
                        </td>
                        <td className="p-3 text-right text-muted-foreground">{deliveredPct}%</td>
                        <td className="p-3 text-right">{stock}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Рекомендации (заглушка) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-amber-500" />
            Рекомендации
          </CardTitle>
          <CardDescription>
            Подсказки по улучшению карточек, остаткам и конверсии
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg bg-muted/50 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Раздел в разработке</p>
              <p className="text-sm text-muted-foreground mt-1">
                Здесь появятся рекомендации: товары с высоким трафиком и низкой конверсией, предупреждения об остатках,
                советы по поисковым запросам WB и Ozon.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
