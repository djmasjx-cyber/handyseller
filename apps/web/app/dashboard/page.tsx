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
  CheckCircle,
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <AlertCircle className="mr-2 h-5 w-5 text-yellow-500" />
              Требует внимания
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {s.ordersRequireAttention > 0 ? (
              <div className="flex items-start justify-between p-3 bg-muted rounded-lg">
                <div className="space-y-1">
                  <p className="font-medium">Новые заказы</p>
                  <p className="text-sm text-muted-foreground">
                    {s.ordersRequireAttention} заказ(ов) ожидают обработки
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => fetchDashboard(true)}>
                  Обновить
                </Button>
              </div>
            ) : (
              <div className="p-3 bg-muted rounded-lg">
                <p className="font-medium text-green-600">Всё в порядке</p>
                <p className="text-sm text-muted-foreground">Нет срочных задач</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="mr-2 h-5 w-5 text-green-500" />
              Сводка
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium mb-2">Выручка</p>
              <p className="text-sm text-muted-foreground">
                {(s.totalRevenue ?? 0).toLocaleString("ru-RU")} ₽ за последние 30 дней
              </p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="font-medium mb-2">Подключённые площадки</p>
              <p className="text-sm text-muted-foreground">{s.marketplaceLabel || "Нет подключений"}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
