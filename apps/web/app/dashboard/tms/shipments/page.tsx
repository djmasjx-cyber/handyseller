"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, Badge, Button } from "@handyseller/ui"
import { Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

type Shipment = {
  id: string
  carrierName: string
  trackingNumber: string
  status: string
  priceRub: number
  etaDays: number
}

type ShipmentDocument = {
  id: string
  title: string
  type: string
  content?: string
}

type TrackingEvent = {
  id: string
  status: string
  description: string
  occurredAt: string
  location?: string
}

export default function TmsShipmentsPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [items, setItems] = useState<Shipment[]>([])
  const [documentsByShipment, setDocumentsByShipment] = useState<Record<string, ShipmentDocument[]>>({})
  const [trackingByShipment, setTrackingByShipment] = useState<Record<string, TrackingEvent[]>>({})
  const [expandedTrackingId, setExpandedTrackingId] = useState<string | null>(null)
  const [loadingTrackingId, setLoadingTrackingId] = useState<string | null>(null)
  const [trackingError, setTrackingError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const openDocument = (doc: ShipmentDocument, print: boolean) => {
    const maybeUrl = (doc.content ?? "").trim()
    if (/^https?:\/\/\S+/i.test(maybeUrl)) {
      window.open(maybeUrl, "_blank", "noopener,noreferrer")
      return
    }
    const w = window.open("", "_blank", "noopener,noreferrer")
    if (!w) return
    const title = doc.title || "Документ"
    const body = doc.content ?? "Содержимое документа недоступно."
    const escapedTitle = title.replace(/</g, "&lt;").replace(/>/g, "&gt;")
    const escapedBody = body.replace(/</g, "&lt;").replace(/>/g, "&gt;")
    w.document.write(`
      <!doctype html>
      <html lang="ru">
        <head>
          <meta charset="utf-8" />
          <title>${escapedTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; }
            pre { white-space: pre-wrap; font-family: inherit; line-height: 1.5; }
          </style>
        </head>
        <body>
          <h1>${escapedTitle}</h1>
          <pre>${escapedBody}</pre>
        </body>
      </html>
    `)
    w.document.close()
    if (print) w.print()
  }

  const formatDateTime = (s: string) => {
    try {
      return new Date(s).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return s
    }
  }

  const toggleTracking = async (shipmentId: string) => {
    if (!token) return
    if (expandedTrackingId === shipmentId) {
      setExpandedTrackingId(null)
      return
    }
    setExpandedTrackingId(shipmentId)
    if (trackingByShipment[shipmentId]) return

    setLoadingTrackingId(shipmentId)
    setTrackingError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const res = await authFetch(`/api/tms/shipments/${shipmentId}/tracking`, { headers })
      const data = await res.json().catch(() => [])
      if (!res.ok) {
        throw new Error("Не удалось загрузить трекинг")
      }
      setTrackingByShipment((prev) => ({ ...prev, [shipmentId]: Array.isArray(data) ? data : [] }))
    } catch (e) {
      setTrackingError(e instanceof Error ? e.message : "Не удалось загрузить трекинг")
    } finally {
      setLoadingTrackingId(null)
    }
  }

  useEffect(() => {
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    authFetch("/api/tms/shipments", { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then(async (data) => {
        const shipments = Array.isArray(data) ? data : []
        setItems(shipments)
        const entries = await Promise.all(
          shipments.map(async (shipment: Shipment) => {
            const res = await authFetch(`/api/tms/shipments/${shipment.id}/documents`, { headers })
            const docs = await res.json().catch(() => [])
            return [shipment.id, Array.isArray(docs) ? docs : []] as const
          }),
        )
        setDocumentsByShipment(Object.fromEntries(entries))
      })
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Отгрузки</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Отгрузок пока нет. Подтвердите выбранный тариф на странице сравнения, чтобы оформить перевозку и получить
            документы.
          </p>
        ) : items.map((item) => (
          <div key={item.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{item.carrierName}</p>
                <button
                  type="button"
                  className="text-sm text-primary underline-offset-2 hover:underline"
                  onClick={() => void toggleTracking(item.id)}
                >
                  Трек: {item.trackingNumber}
                </button>
              </div>
              <Badge variant="outline">{item.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{item.priceRub.toLocaleString("ru-RU")} ₽ · {item.etaDays} дн.</p>
            {expandedTrackingId === item.id && (
              <div className="mt-3 rounded-md border bg-muted/20 p-3">
                {loadingTrackingId === item.id ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Загружаем статусы перевозчика...
                  </div>
                ) : trackingError ? (
                  <p className="text-sm text-destructive">{trackingError}</p>
                ) : (trackingByShipment[item.id] ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">События трекинга пока не поступили.</p>
                ) : (
                  <div className="space-y-2">
                    {(trackingByShipment[item.id] ?? []).map((event) => (
                      <div key={event.id} className="rounded-md border bg-background px-3 py-2">
                        <p className="text-sm font-medium">{event.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(event.occurredAt)}
                          {event.location ? ` · ${event.location}` : ""}
                          {event.status ? ` · ${event.status}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {(documentsByShipment[item.id] ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {documentsByShipment[item.id].map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 rounded-md border px-2 py-1">
                    <Badge variant="secondary">{doc.title}</Badge>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs relative z-10 pointer-events-auto"
                      onClick={() => openDocument(doc, false)}
                    >
                      Открыть
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs relative z-10 pointer-events-auto"
                      onClick={() => openDocument(doc, true)}
                    >
                      Печать
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
