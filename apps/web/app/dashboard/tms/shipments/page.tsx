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
  priceRub: number
  etaDays: number
}

type ShipmentDocument = {
  id: string
  title: string
  type: string
}

export default function TmsShipmentsPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [items, setItems] = useState<Shipment[]>([])
  const [documentsByShipment, setDocumentsByShipment] = useState<Record<string, ShipmentDocument[]>>({})
  const [loading, setLoading] = useState(true)

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
        <CardTitle>Следующий этап после выбора</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Пока достаточно сравнить тарифы и выбрать вариант. Оформление перевозки подключим следующим этапом.</p>
        ) : items.map((item) => (
          <div key={item.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">{item.carrierName}</p>
                <p className="text-sm text-muted-foreground">Трек: {item.trackingNumber}</p>
              </div>
              <Badge variant="outline">{item.status}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{item.priceRub.toLocaleString("ru-RU")} ₽ · {item.etaDays} дн.</p>
            {(documentsByShipment[item.id] ?? []).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {documentsByShipment[item.id].map((doc) => (
                  <Badge key={doc.id} variant="secondary">{doc.title}</Badge>
                ))}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
