"use client"

import { useState, useEffect, Fragment } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@handyseller/ui"
import { ArrowLeft, Loader2 } from "lucide-react"

interface AdminWebhook {
  id: string
  eventType: string
  vtbOrderId: string | null
  paymentId: string | null
  processed: boolean
  processingError: string | null
  ipAddress: string | null
  createdAt: string
  payload: unknown
}

export default function AdminWebhooksPage() {
  const router = useRouter()
  const [webhooks, setWebhooks] = useState<AdminWebhook[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const pageSize = 20

  useEffect(() => {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    if (!token) return

    setLoading(true)
    authFetch(
      `/api/admin/payments/webhooks?skip=${page * pageSize}&take=${pageSize}`,
      { headers: { Authorization: `Bearer ${token}` } },
      () => router.replace("/login?from=" + encodeURIComponent("/admin/payments/webhooks"))
    )
      .then((r) => {
        if (r.status === 401) return null
        return r.json()
      })
      .then((data) => {
        if (data?.webhooks) {
          setWebhooks(data.webhooks)
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
        second: "2-digit",
      })
    } catch {
      return "—"
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/admin/payments">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Вебхуки ВТБ</h1>
          <p className="text-muted-foreground">Лог callback-уведомлений от банка • Всего: {total}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Список вебхуков</CardTitle>
            <CardDescription>Все входящие запросы на POST /api/payments/webhook/vtb</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-2">Дата</th>
                    <th className="text-left py-3 px-2">Тип</th>
                    <th className="text-left py-3 px-2">Статус</th>
                    <th className="text-left py-3 px-2">orderId ВТБ</th>
                    <th className="text-left py-3 px-2">paymentId</th>
                    <th className="text-left py-3 px-2">IP</th>
                    <th className="text-left py-3 px-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {webhooks.map((w) => (
                    <Fragment key={w.id}>
                      <tr className="border-b last:border-0">
                        <td className="py-3 px-2">{formatDate(w.createdAt)}</td>
                        <td className="py-3 px-2">{w.eventType}</td>
                        <td className="py-3 px-2">
                          <Badge variant={w.processed ? "default" : w.processingError ? "destructive" : "secondary"}>
                            {w.processingError ? "Ошибка" : w.processed ? "Обработан" : "Нет"}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 font-mono text-xs max-w-[100px] truncate" title={w.vtbOrderId ?? undefined}>
                          {w.vtbOrderId || "—"}
                        </td>
                        <td className="py-3 px-2 font-mono text-xs max-w-[100px] truncate" title={w.paymentId ?? undefined}>
                          {w.paymentId || "—"}
                        </td>
                        <td className="py-3 px-2 text-muted-foreground">{w.ipAddress || "—"}</td>
                        <td className="py-3 px-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(expandedId === w.id ? null : w.id)}
                          >
                            {expandedId === w.id ? "▲" : "▼"}
                          </Button>
                        </td>
                      </tr>
                      {expandedId === w.id && (
                        <tr className="border-b bg-muted/30">
                          <td colSpan={7} className="py-3 px-4">
                            {w.processingError && (
                              <p className="text-destructive text-sm mb-2">
                                Ошибка: {w.processingError}
                              </p>
                            )}
                            <pre className="text-xs overflow-x-auto max-h-48 overflow-y-auto bg-background p-3 rounded border">
                              {JSON.stringify(w.payload, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {webhooks.length === 0 && !loading && (
              <p className="text-center text-muted-foreground py-8">Вебхуков пока нет</p>
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
    </div>
  )
}
