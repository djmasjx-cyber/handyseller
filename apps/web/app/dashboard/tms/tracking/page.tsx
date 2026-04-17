"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@handyseller/ui"
import { Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

type Shipment = {
  id: string
  carrierName: string
  trackingNumber: string
  status: string
}

type TrackingEvent = {
  id: string
  status: string
  description: string
  occurredAt: string
}

type ShipmentWithTimeline = Shipment & { timeline: TrackingEvent[] }

export default function TmsTrackingPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [items, setItems] = useState<ShipmentWithTimeline[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    authFetch("/api/tms/shipments", { headers })
      .then((r) => (r.ok ? r.json() : []))
      .then(async (shipments) => {
        const list = Array.isArray(shipments) ? shipments : []
        const withTimeline = await Promise.all(
          list.map(async (shipment: Shipment) => {
            const res = await authFetch(`/api/tms/shipments/${shipment.id}/tracking`, { headers })
            const timeline = await res.json().catch(() => [])
            return {
              ...shipment,
              timeline: Array.isArray(timeline) ? timeline : [],
            }
          }),
        )
        setItems(withTimeline)
      })
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Трекинг перевозок</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Нет активных перевозок для отслеживания.</p>
        ) : items.map((item) => (
          <div key={item.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{item.carrierName}</p>
                <p className="text-sm text-muted-foreground">Трек: {item.trackingNumber}</p>
              </div>
              <Badge variant="outline">{item.status}</Badge>
            </div>
            <div className="space-y-2">
              {item.timeline.map((event) => (
                <div key={event.id} className="rounded-md bg-muted/40 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-sm">{event.status}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.occurredAt).toLocaleString("ru-RU")}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
