"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS, setStoredUser } from "@/lib/auth-storage"
import { Button, Card, CardContent, CardHeader, CardTitle } from "@handyseller/ui"
import {
  Package,
  TrendingUp,
  ShoppingCart,
  RefreshCw,
  AlertCircle,
  Store,
  Loader2,
} from "lucide-react"

interface Order {
  id: string
  marketplaceOrderId: string
  productId: string
  productName?: string
  customerName?: string
  status: string
  amount: number
  createdAt: string
  marketplace?: string
}

type StatusStats = { count: number; sum: number }
type MarketplaceOrderStats = {
  delivered: StatusStats
  shipped: StatusStats
  inProgress: StatusStats
  cancelled: StatusStats
}

interface DashboardData {
  userName?: string | null
  summary: {
    totalProducts: number
    totalProductsInCatalog?: number
    totalRevenue: number
    totalOrders: number
    newOrdersCount: number
    ordersRequireAttention: number
    connectedMarketplaces: number
    marketplaceLabel: string
    isAdmin?: boolean
    monthlyRevenue?: number
  }
  orders: Order[]
  ordersStatsByStatus?: Record<string, MarketplaceOrderStats>
}

const EMPTY_SUMMARY = {
  totalProducts: 0,
  totalRevenue: 0,
  totalOrders: 0,
  newOrdersCount: 0,
  ordersRequireAttention: 0,
  connectedMarketplaces: 0,
  marketplaceLabel: "Нет подключений",
}

export default function DashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)

  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null

  useEffect(() => {
    if (!token) return

    setLoading(true)
    setApiError(null)
    const abort = { current: false }

    Promise.all([
      authFetch("/api/users/me", { headers: { Authorization: `Bearer ${token}` } }, () => {
        abort.current = true
        router.replace("/login?from=" + encodeURIComponent("/dashboard"))
      }).then((r) => (r.ok ? r.json().catch(() => null) : { _fail: true, status: r.status })),
      authFetch(
        "/api/dashboard",
        { headers: { Authorization: `Bearer ${token}` } },
        () => {
          abort.current = true
          router.replace("/login?from=" + encodeURIComponent("/dashboard"))
        }
      ).then((r) => (r.ok ? r.json().catch(() => null) : { _fail: true, status: r.status })),
    ])
      .then(([user, dashboard]) => {
        if (abort.current) return
        if (user?._fail) {
          setApiError(`Ошибка /users/me: ${user.status}`)
          setData({ userName: null, summary: EMPTY_SUMMARY, orders: [] })
          return
        }
        if (user?.id) {
          setStoredUser({ id: user.id, email: user.email, name: user.name, role: user.role })
          if (user.role === "ADMIN") {
            router.replace("/admin")
            return
          }
        }
        if (dashboard?._fail) {
          setApiError(`Ошибка API: /dashboard вернул ${dashboard.status}. Nginx → API → БД.`)
          setData({ userName: null, summary: EMPTY_SUMMARY, orders: [] })
          return
        }
        if (dashboard && !dashboard.error && typeof dashboard.summary === "object") {
          setData(dashboard)
          setApiError(null)
        } else {
          setApiError("API вернул некорректные данные")
          setData({ userName: null, summary: EMPTY_SUMMARY, orders: [] })
        }
      })
      .catch((err) => {
        setApiError(err?.message || "Ошибка сети")
        setData({ userName: null, summary: EMPTY_SUMMARY, orders: [] })
      })
      .finally(() => {
        if (!abort.current) setLoading(false)
      })
  }, [token, router])

  const fetchDashboard = (withSync = false) => {
    if (!token) return
    setLoading(true)
    setApiError(null)
    const authHeaders = () => ({ Authorization: `Bearer ${token}` })
    const doFetch = () =>
      authFetch("/api/dashboard", { headers: authHeaders() }, () =>
        router.replace("/login?from=" + encodeURIComponent("/dashboard"))
      ).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`API ${r.status}`))))

    const flow = withSync
      ? authFetch(
          "/api/orders/sync",
          { method: "POST", headers: authHeaders() },
          () => router.replace("/login?from=" + encodeURIComponent("/dashboard"))
        ).then((r) => (r.ok ? doFetch() : Promise.reject(new Error(`Sync ${r.status}`))))
      : doFetch()

    flow
      .then((d) => {
        if (d && !d.error) {
          setData(d)
          setApiError(null)
        }
      })
      .catch((err) => setApiError(err?.message || "Ошибка сети"))
      .finally(() => setLoading(false))
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const s = data.summary ?? {}

  return (
    <div className="space-y-6">
      {apiError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
          {apiError}
        </div>
      )}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Главная</h1>
        <Button variant="outline" size="sm" onClick={() => fetchDashboard(true)}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Синхронизировать
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Активные товары</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.totalProducts ?? 0}</div>
            {(s.totalProductsInCatalog ?? 0) > 0 && (s.totalProducts ?? 0) === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Всего в каталоге: {s.totalProductsInCatalog}. Укажите остаток в «Мой склад».
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Продаж за месяц</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(s.totalRevenue ?? 0).toLocaleString("ru-RU")} ₽
            </div>
            <p className="text-xs text-muted-foreground">
              {s.totalOrders ?? 0} заказов
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Новых заказов</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.newOrdersCount ?? 0}</div>
            <p className="text-xs text-muted-foreground">
              {s.ordersRequireAttention ?? 0} требуют внимания
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Подключено площадок</CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s.connectedMarketplaces ?? 0}</div>
            <p className="text-xs text-muted-foreground">{s.marketplaceLabel ?? "—"}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertCircle className="mr-2 h-5 w-5 text-yellow-500" />
              Требует внимания
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.ordersRequireAttention > 0 ? (
              <>
                {s.newOrdersCount > 0 && (
                  <div className="flex items-start justify-between p-3 bg-muted rounded-lg">
                    <div className="space-y-1">
                      <p className="font-medium">Новые заказы</p>
                      <p className="text-sm text-muted-foreground">
                        {s.newOrdersCount} заказ(ов) ожидают обработки
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => fetchDashboard(true)}>
                      Обновить
                    </Button>
                  </div>
                )}
                {(() => {
                  const stats = data.ordersStatsByStatus ?? {}
                  const ozon = stats.OZON ?? stats.ozon
                  const wb = stats.WILDBERRIES ?? stats.wildberries ?? stats.WB ?? stats.wb
                  const inProgress =
                    (ozon?.inProgress?.count ?? 0) + (wb?.inProgress?.count ?? 0)
                  if (inProgress <= 0) return null
                  return (
                    <div className="flex items-start justify-between p-3 bg-muted rounded-lg">
                      <div className="space-y-1">
                        <p className="font-medium">На сборке</p>
                        <p className="text-sm text-muted-foreground">
                          {inProgress} заказ(ов) в сборке
                        </p>
                      </div>
                      <Button size="sm" variant="outline" asChild>
                        <Link href="/dashboard/orders/assembly">Открыть</Link>
                      </Button>
                    </div>
                  )
                })()}
              </>
            ) : (
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium text-green-600">Всё в порядке</p>
                <p className="text-sm text-muted-foreground">Нет срочных задач</p>
              </div>
            )}
          </CardContent>
        </Card>

        {(() => {
          const stats = data.ordersStatsByStatus ?? {}
          const ozon = stats.OZON ?? stats.ozon
          const wb = stats.WILDBERRIES ?? stats.wildberries ?? stats.WB ?? stats.wb
          const emptyStats: MarketplaceOrderStats = {
            delivered: { count: 0, sum: 0 },
            shipped: { count: 0, sum: 0 },
            inProgress: { count: 0, sum: 0 },
            cancelled: { count: 0, sum: 0 },
          }
          const StatusBlock = ({
            title,
            data,
            cardClassName,
          }: {
            title: string
            data: MarketplaceOrderStats | undefined
            cardClassName?: string
          }) => {
            const d = data ?? emptyStats
            const rows = [
              { label: "Получен клиентом", key: "delivered" as const },
              { label: "Доставляется", key: "shipped" as const },
              { label: "На сборке", key: "inProgress" as const },
              { label: "Отменён", key: "cancelled" as const },
            ]
            return (
              <Card className={cardClassName}>
                <CardHeader>
                  <CardTitle className="text-base">{title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {rows.map(({ label, key }) => (
                    <div key={key} className="flex justify-between items-center py-2 border-b border-muted last:border-0">
                      <span className="text-sm">{label}</span>
                      <span className="text-sm font-medium">
                        {d[key].count} шт · {(d[key].sum ?? 0).toLocaleString("ru-RU")} ₽
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          }
          return (
            <>
              <StatusBlock title="Озон" data={ozon} cardClassName="bg-[#005BFF]/5 border-[#005BFF]/15" />
              <StatusBlock title="ВБ" data={wb} cardClassName="bg-[#CB11AB]/5 border-[#CB11AB]/15" />
            </>
          )
        })()}
      </div>
    </div>
  )
}
