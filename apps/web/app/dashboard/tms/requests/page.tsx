"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@handyseller/ui"
import { Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

type ShipmentRequest = {
  id: string
  status: string
  selectedQuoteId?: string
  snapshot: { coreOrderNumber: string; marketplace: string }
  draft: { originLabel: string; destinationLabel: string; serviceFlags: string[] }
}

type Quote = {
  id: string
  carrierId: string
  carrierName: string
  priceRub: number
  etaDays: number
  score: number
}

function requestStatusLabel(value: string) {
  switch (value) {
    case "DRAFT":
      return "Черновик"
    case "QUOTED":
      return "Варианты получены"
    case "BOOKED":
      return "Вариант выбран"
    default:
      return value
  }
}

export default function TmsRequestsPage() {
  const searchParams = useSearchParams()
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [items, setItems] = useState<ShipmentRequest[]>([])
  const [quotesByRequest, setQuotesByRequest] = useState<Record<string, Quote[]>>({})
  const [loading, setLoading] = useState(true)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestIdFromQuery = searchParams.get("requestId")

  useEffect(() => {
    if (!token) return
    setError(null)
    authFetch("/api/tms/shipment-requests", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then(async (data) => {
        const requests = Array.isArray(data) ? data : []
        setItems(requests)
        const headers = { Authorization: `Bearer ${token}` }
        const quoteEntries = await Promise.all(
          requests.map(async (request: ShipmentRequest) => {
            const res = await authFetch(`/api/tms/shipment-requests/${request.id}/quotes`, { headers })
            const quotes = await res.json().catch(() => [])
            return [request.id, Array.isArray(quotes) ? quotes : []] as const
          }),
        )
        setQuotesByRequest(Object.fromEntries(quoteEntries))
      })
      .catch(() => setError("Не удалось загрузить расчеты и тарифы"))
      .finally(() => setLoading(false))
  }, [token])

  const refreshQuotes = async (requestId: string) => {
    if (!token) return
    setRefreshingId(requestId)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const res = await authFetch(`/api/tms/shipment-requests/${requestId}/quotes/refresh`, {
        method: "POST",
        headers,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data?.message === "string" ? data.message : "Не удалось обновить тарифы")
      }
      const nextQuotes = await res.json().catch(() => [])
      setQuotesByRequest((prev) => ({ ...prev, [requestId]: Array.isArray(nextQuotes) ? nextQuotes : [] }))
      setItems((prev) => prev.map((item) => (item.id === requestId ? { ...item, status: "QUOTED" } : item)))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить тарифы")
    } finally {
      setRefreshingId(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>

  const sortedItems = requestIdFromQuery
    ? [...items].sort((a, b) => {
        if (a.id === requestIdFromQuery) return -1
        if (b.id === requestIdFromQuery) return 1
        return 0
      })
    : items

  return (
    <Card>
      <CardHeader>
        <CardTitle>Расчеты по перевозке</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Расчетов пока нет.</p>
        ) : sortedItems.map((item) => (
          <div key={item.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{item.snapshot.marketplace} · {item.snapshot.coreOrderNumber}</p>
                <p className="text-sm text-muted-foreground">{item.draft.originLabel} → {item.draft.destinationLabel}</p>
              </div>
              <div className="flex items-center gap-2">
                {item.id === requestIdFromQuery ? <Badge variant="secondary">Текущий расчет</Badge> : null}
                <Badge>{requestStatusLabel(item.status)}</Badge>
              </div>
            </div>
            <div className="space-y-2">
              {(quotesByRequest[item.id] ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Варианты пока не получены. Запросите тарифы у перевозчиков.</p>
              ) : (
                (quotesByRequest[item.id] ?? []).map((quote) => (
                  <div key={quote.id} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                    <div>
                      <p className="font-medium text-sm">{quote.carrierName}</p>
                      <p className="text-xs text-muted-foreground">{quote.etaDays} дн. · score {quote.score}</p>
                    </div>
                    <div className="text-sm font-medium">{quote.priceRub.toLocaleString("ru-RU")} ₽</div>
                  </div>
                ))
              )}
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                disabled={refreshingId === item.id}
                onClick={() => refreshQuotes(item.id)}
              >
                {refreshingId === item.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Обновить варианты
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
