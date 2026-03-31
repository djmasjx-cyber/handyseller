"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { authFetch } from "@/lib/auth-fetch"
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Textarea } from "@handyseller/ui"
import { ArrowLeft, CheckCircle, Loader2, MessageSquare, XCircle } from "lucide-react"

type AdminReview = {
  id: string
  text: string
  rating: number
  status: "PENDING" | "PUBLISHED" | "REJECTED"
  createdAt: string
  moderatedAt?: string | null
  publishedAt?: string | null
  userEmail: string
  userName?: string | null
}

export default function AdminReviewsPage() {
  const router = useRouter()
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<"PENDING" | "PUBLISHED" | "REJECTED">("PENDING")
  const [actionId, setActionId] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState("")

  const load = useCallback(() => {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    if (!token) return
    setLoading(true)
    authFetch(`/api/admin/reviews?status=${status}`, { headers: { Authorization: `Bearer ${token}` } }, () => {
      router.replace("/login?from=" + encodeURIComponent("/admin/reviews"))
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setReviews(Array.isArray(data) ? data : []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false))
  }, [router, status])

  useEffect(() => {
    load()
  }, [load])

  async function publish(id: string) {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    if (!token) return
    setActionId(id)
    try {
      const r = await authFetch(`/api/admin/reviews/${id}/publish`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error("Не удалось опубликовать")
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setActionId(null)
    }
  }

  async function reject(id: string) {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    if (!token) return
    setActionId(id)
    try {
      const r = await authFetch(`/api/admin/reviews/${id}/reject`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ note: rejectNote.trim() || undefined }),
      })
      if (!r.ok) throw new Error("Не удалось отклонить")
      setRejectNote("")
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : "Ошибка")
    } finally {
      setActionId(null)
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
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Отзывы</h1>
          <p className="text-muted-foreground">Модерация перед публикацией на главной странице</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["PENDING", "PUBLISHED", "REJECTED"] as const).map((s) => (
          <Button key={s} variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)}>
            {s === "PENDING" ? "На модерации" : s === "PUBLISHED" ? "Опубликованные" : "Отклонённые"}
          </Button>
        ))}
      </div>

      {status === "PENDING" && (
        <Card>
          <CardHeader>
            <CardTitle>Причина отклонения (необязательно)</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Например: слишком короткий или не по теме"
              maxLength={300}
            />
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Список пуст</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="py-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{r.userName || r.userEmail}</span>
                    <span className="text-sm text-muted-foreground">({r.userEmail})</span>
                  </div>
                  <Badge variant="outline">{r.rating}/5</Badge>
                </div>
                <p className="text-sm leading-relaxed">{r.text}</p>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Создан: {new Date(r.createdAt).toLocaleString("ru-RU")}</span>
                  {r.publishedAt && <span>Опубликован: {new Date(r.publishedAt).toLocaleString("ru-RU")}</span>}
                </div>
                {status === "PENDING" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => publish(r.id)} disabled={actionId === r.id}>
                      {actionId === r.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      Опубликовать
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reject(r.id)} disabled={actionId === r.id}>
                      <XCircle className="h-4 w-4 mr-2" />
                      Отклонить
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
