"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { Users, DollarSign, BarChart3, ArrowRight, Loader2, MessageSquare } from "lucide-react"

interface AdminStats {
  revenue: number
  revenueCount: number
  monthlyRevenue: number
  monthlyRevenueCount: number
  payments: { total: number; succeeded: number; processing: number }
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
    if (!token) return

    authFetch("/api/admin/payments/stats", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Админ-панель</h1>
        <p className="text-muted-foreground">Управление клиентами, финансами и отчётами</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : stats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Выручка за месяц</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(stats.monthlyRevenue ?? 0).toLocaleString("ru-RU")} ₽</div>
              <p className="text-xs text-muted-foreground">
                {stats.monthlyRevenueCount ?? 0} платежей за текущий месяц
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Платежи</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.payments?.succeeded ?? 0}</div>
              <p className="text-xs text-muted-foreground">
                успешных из {stats.payments?.total ?? 0} всего
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link href="/admin/users">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Пользователи</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription>Список клиентов, их подписки и активность</CardDescription>
              <div className="mt-2 flex items-center gap-1 text-primary text-sm font-medium">
                Перейти <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/payments">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Платежи</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription>Платежи ВТБ Эквайринг, список операций</CardDescription>
              <div className="mt-2 flex items-center gap-1 text-primary text-sm font-medium">
                Перейти <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/reviews">
          <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Отзывы</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <CardDescription>Модерация отзывов перед публикацией на главной</CardDescription>
              <div className="mt-2 flex items-center gap-1 text-primary text-sm font-medium">
                Перейти <ArrowRight className="h-4 w-4" />
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card className="opacity-60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Отчёты</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <CardDescription>Сводные отчёты по платформе (скоро)</CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
