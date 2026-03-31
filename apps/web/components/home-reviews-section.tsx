"use client"

import { useEffect, useMemo, useState } from "react"
import { Button, Card, CardContent, CardHeader, CardTitle, Badge, Textarea } from "@handyseller/ui"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import Link from "next/link"
import { Loader2, MessageSquare, Star } from "lucide-react"

type PublishedReview = {
  id: string
  text: string
  rating: number
  authorName: string
  publishedAt?: string | null
}

function formatDate(value?: string | null) {
  if (!value) return ""
  try {
    return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" })
  } catch {
    return ""
  }
}

export function HomeReviewsSection() {
  const [reviews, setReviews] = useState<PublishedReview[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [text, setText] = useState("")
  const [rating, setRating] = useState(5)
  const [message, setMessage] = useState<string | null>(null)

  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const isLoggedIn = !!token

  useEffect(() => {
    fetch("/api/reviews?limit=6")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setReviews(Array.isArray(data) ? data : []))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false))
  }, [])

  const canSubmit = useMemo(() => text.trim().length >= 10 && text.trim().length <= 1000, [text])

  async function submitReview() {
    if (!token || !canSubmit || submitting) return
    setSubmitting(true)
    setMessage(null)
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: text.trim(), rating }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || "Не удалось отправить отзыв")
      setText("")
      setRating(5)
      setMessage("Спасибо! Отзыв отправлен на модерацию.")
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка отправки отзыва")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section id="reviews" className="container py-12 md:py-16 scroll-mt-20">
      <div className="text-center mb-8">
        <Badge variant="secondary" className="mb-2">
          <MessageSquare className="mr-1 h-3 w-3" />
          Отзывы
        </Badge>
        <h2 className="text-2xl md:text-3xl font-bold mb-2">Отзывы пользователей</h2>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
          Публикуем отзывы после модерации. Оставить отзыв могут только зарегистрированные пользователи.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {loading ? (
          <div className="col-span-full flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : reviews.length === 0 ? (
          <p className="col-span-full text-center text-muted-foreground py-8">Пока нет опубликованных отзывов</p>
        ) : (
          reviews.map((review) => (
            <Card key={review.id} className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{review.authorName}</CardTitle>
                  <div className="flex items-center gap-0.5 text-amber-500">
                    {Array.from({ length: review.rating }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-current" />
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-foreground/90 leading-relaxed">{review.text}</p>
                <p className="text-xs text-muted-foreground">{formatDate(review.publishedAt)}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card className="max-w-3xl mx-auto">
        <CardHeader>
          <CardTitle className="text-lg">Оставить отзыв</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoggedIn ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Оценка:</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-label={`Оценка ${value}`}
                      onClick={() => setRating(value)}
                      className={value <= rating ? "text-amber-500" : "text-muted-foreground"}
                    >
                      <Star className={`h-5 w-5 ${value <= rating ? "fill-current" : ""}`} />
                    </button>
                  ))}
                </div>
              </div>
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Что вам нравится в HandySeller?"
                maxLength={1000}
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{text.trim().length}/1000</span>
                <Button onClick={submitReview} disabled={!canSubmit || submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Отправить на модерацию
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-sm text-muted-foreground">Чтобы оставить отзыв, войдите в аккаунт.</p>
              <Button variant="outline" asChild>
                <Link href={"/login?from=" + encodeURIComponent("/#reviews")}>
                  Войти
                </Link>
              </Button>
            </div>
          )}
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </CardContent>
      </Card>
    </section>
  )
}
