"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@handyseller/ui"
import { ArrowLeft, Loader2, Webhook } from "lucide-react"

interface AdminPayment {
  id: string
  userId: string
  userEmail: string
  userName: string | null
  amount: number
  status: string
  subjectType: string
  subjectId: string
  vtbOrderId: string | null
  createdAt: string
  refundedAmount?: number
  updatedAt?: string
}

export default function AdminPaymentsPage() {
  const router = useRouter()
  const [payments, setPayments] = useState<AdminPayment[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [refundingId, setRefundingId] = useState<string | null>(null)
  const [detailPayment, setDetailPayment] = useState<AdminPayment | null>(null)
  const [stats, setStats] = useState<{
    payments: { total: number; succeeded: number; processing: number }
    revenue: number
    webhooksUnprocessed: number
  } | null>(null)
  const pageSize = 20

  useEffect(() => {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    if (!token) return
    authFetch(`/api/admin/payments/stats`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats(d))
      .catch(() => {})
  }, [])

  const doRefund = useCallback(
    async (paymentId: string) => {
      const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
      if (!token || refundingId) return
      setRefundingId(paymentId)
      try {
        const r = await authFetch(`/api/admin/payments/${paymentId}/refund`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        })
        if (r.ok) {
          const data = await r.json()
          alert(`Возврат выполнен: ${data.refunded} ₽`)
          setPayments((prev) =>
            prev.map((p) => (p.id === paymentId ? { ...p, status: "REFUNDED" } : p))
          )
        } else {
          const err = await r.json().catch(() => ({}))
          alert(err?.message ?? "Ошибка возврата")
        }
      } catch (e) {
        alert("Ошибка: " + (e instanceof Error ? e.message : String(e)))
      } finally {
        setRefundingId(null)
      }
    },
    [refundingId]
  )

  useEffect(() => {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    if (!token) return

    setLoading(true)
    authFetch(
      `/api/admin/payments?skip=${page * pageSize}&take=${pageSize}`,
      { headers: { Authorization: `Bearer ${token}` } },
      () => router.replace("/login?from=" + encodeURIComponent("/admin/payments"))
    )
      .then((r) => {
        if (r.status === 401) return null
        return r.json()
      })
      .then((data) => {
        if (data?.payments) {
          setPayments(data.payments)
          setTotal(data.total ?? 0)
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, router])

  const formatDate = (s: string | null) => {
    if (!s) return "—"
    try {
      return new Date(s).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return "—"
    }
  }

  const formatAmount = (n: number) => {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB" }).format(n)
  }

  const statusVariant = (s: string) => {
    switch (s) {
      case "SUCCEEDED":
        return "default"
      case "FAILED":
      case "CANCELLED":
        return "destructive"
      case "PROCESSING":
      case "PENDING":
        return "secondary"
      case "REFUNDED":
        return "outline"
      default:
        return "secondary"
    }
  }

  const statusLabel: Record<string, string> = {
    PENDING: "Ожидание",
    PROCESSING: "В обработке",
    SUCCEEDED: "Оплачен",
    FAILED: "Ошибка",
    REFUNDED: "Возврат",
    CANCELLED: "Отменён",
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Платежи</h1>
          <p className="text-muted-foreground">
            ВТБ Эквайринг • Всего: {total}
            {stats && (
              <span className="ml-4">
                • Выручка: {stats.revenue.toLocaleString("ru-RU")} ₽
                {stats.webhooksUnprocessed > 0 && (
                  <span className="text-amber-600 dark:text-amber-400 ml-2">
                    ({stats.webhooksUnprocessed} необработанных вебхуков)
                  </span>
                )}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/admin/payments/webhooks">
            <Webhook className="h-4 w-4 mr-2" />
            Вебхуки
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Список платежей</CardTitle>
            <CardDescription>Оплаты подписок и другие операции</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">Дата</th>
                    <th className="text-left py-3 px-2">Пользователь</th>
                    <th className="text-right py-3 px-2">Сумма</th>
                    <th className="text-left py-3 px-2">Статус</th>
                    <th className="text-left py-3 px-2">Тип</th>
                    <th className="text-left py-3 px-2">ID платежа ВТБ</th>
                    <th className="text-right py-3 px-2 w-24">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                      onClick={() => {
                        const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
                        if (!token) return
                        authFetch(`/api/admin/payments/${p.id}`, {
                          headers: { Authorization: `Bearer ${token}` },
                        })
                          .then((r) => r.json())
                          .then((d) => d?.payment && setDetailPayment(d.payment))
                          .catch(() => {})
                      }}
                    >
                      <td className="py-3 px-2">{formatDate(p.createdAt)}</td>
                      <td className="py-3 px-2">
                        <span className="font-medium">{p.userEmail}</span>
                        {p.userName && (
                          <span className="text-muted-foreground ml-1">({p.userName})</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right font-medium">{formatAmount(p.amount)}</td>
                      <td className="py-3 px-2">
                        <Badge variant={statusVariant(p.status)}>
                          {statusLabel[p.status] ?? p.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-muted-foreground">{p.subjectType}</td>
                      <td className="py-3 px-2 font-mono text-xs">
                        {p.vtbOrderId ? (
                          <span className="truncate max-w-[120px] block" title={p.vtbOrderId}>
                            {p.vtbOrderId}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {p.status === "SUCCEEDED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            disabled={!!refundingId}
                            onClick={(e) => {
                              e.stopPropagation()
                              doRefund(p.id)
                            }}
                          >
                            {refundingId === p.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              "Возврат"
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {payments.length === 0 && !loading && (
              <p className="text-center text-muted-foreground py-8">Платежей пока нет</p>
            )}

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

      {detailPayment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDetailPayment(null)}
        >
          <Card
            className="w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Платёж {detailPayment.id.slice(0, 8)}…</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setDetailPayment(null)}>
                ×
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Пользователь:</span> {detailPayment.userEmail}</p>
              <p><span className="text-muted-foreground">Сумма:</span> {formatAmount(detailPayment.amount)}</p>
              <p><span className="text-muted-foreground">Статус:</span> {statusLabel[detailPayment.status] ?? detailPayment.status}</p>
              {detailPayment.refundedAmount != null && detailPayment.refundedAmount > 0 && (
                <p><span className="text-muted-foreground">Возвращено:</span> {formatAmount(detailPayment.refundedAmount)}</p>
              )}
              <p><span className="text-muted-foreground">Тип:</span> {detailPayment.subjectType} / {detailPayment.subjectId.slice(0, 8)}…</p>
              <p><span className="text-muted-foreground">VTB orderId:</span> {detailPayment.vtbOrderId || "—"}</p>
              <p><span className="text-muted-foreground">Создан:</span> {formatDate(detailPayment.createdAt)}</p>
              {detailPayment.updatedAt && (
                <p><span className="text-muted-foreground">Обновлён:</span> {formatDate(detailPayment.updatedAt)}</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
