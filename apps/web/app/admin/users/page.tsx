"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@handyseller/ui"
import { ArrowLeft, Loader2 } from "lucide-react"

interface AdminUser {
  id: string
  email: string
  name: string | null
  role: string
  isActive: boolean
  createdAt: string
  ordersCount: number
  productsCount: number
  plan: string
  subscriptionExpiresAt: string | null
}

const PLANS = [
  { id: "FREE", name: "Бесплатный" },
  { id: "PROFESSIONAL", name: "Любительский" },
  { id: "BUSINESS", name: "Профессиональный" },
] as const

export default function AdminUsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const pageSize = 20

  useEffect(() => {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    if (!token) return

    setLoading(true)
    authFetch(
      `/api/admin/users?skip=${page * pageSize}&take=${pageSize}`,
      { headers: { Authorization: `Bearer ${token}` } },
      () => router.replace("/login?from=" + encodeURIComponent("/admin/users"))
    )
      .then((r) => {
        if (r.status === 401) return null
        return r.json()
      })
      .then((data) => {
        if (data?.users) {
          setUsers(data.users)
          setTotal(data.total ?? 0)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, router])

  const formatDate = (s: string | null) => {
    if (!s) return "—"
    try {
      return new Date(s).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })
    } catch {
      return "—"
    }
  }

  const handlePlanChange = async (userId: string, newPlan: string) => {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    if (!token) return

    setSavingUserId(userId)
    try {
      const r = await authFetch(`/api/admin/users/${userId}/subscription`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ plan: newPlan }),
      }, () => router.replace("/login?from=" + encodeURIComponent("/admin/users")))

      if (r.ok) {
        const data = await r.json().catch(() => ({}))
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  plan: data.plan ?? newPlan,
                  subscriptionExpiresAt: data.expiresAt ?? (newPlan === "FREE" ? null : u.subscriptionExpiresAt),
                }
              : u
          )
        )
      } else {
        const err = await r.json().catch(() => ({}))
        alert(err?.message ?? "Не удалось изменить план")
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setSavingUserId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Пользователи</h1>
          <p className="text-muted-foreground">Всего: {total}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Список клиентов</CardTitle>
            <CardDescription>Email, роль, подписка, заказы и товары</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">Email</th>
                    <th className="text-left py-3 px-2">Имя</th>
                    <th className="text-left py-3 px-2">Роль</th>
                    <th className="text-right py-3 px-2">Заказы</th>
                    <th className="text-right py-3 px-2">Товары</th>
                    <th className="text-left py-3 px-2">План</th>
                    <th className="text-left py-3 px-2">Подписка до</th>
                    <th className="text-left py-3 px-2">Регистрация</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="py-3 px-2 font-medium">{u.email}</td>
                      <td className="py-3 px-2">{u.name || "—"}</td>
                      <td className="py-3 px-2">
                        <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>{u.role}</Badge>
                      </td>
                      <td className="py-3 px-2 text-right">{u.ordersCount}</td>
                      <td className="py-3 px-2 text-right">{u.productsCount}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={u.plan}
                            onChange={(e) => handlePlanChange(u.id, e.target.value)}
                            disabled={savingUserId === u.id}
                            className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 hover:border-primary/50 cursor-pointer min-w-[120px]"
                          >
                            {PLANS.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          {savingUserId === u.id && (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-2">{formatDate(u.subscriptionExpiresAt)}</td>
                      <td className="py-3 px-2">{formatDate(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total > pageSize && (
              <div className="flex justify-between items-center mt-4 pt-4 border-t">
                <p className="text-muted-foreground text-sm">
                  {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} из {total}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Назад
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(page + 1) * pageSize >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Далее
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
