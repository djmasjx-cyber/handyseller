"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@handyseller/ui"
import { Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

type ShipmentRequest = {
  id: string
  status: string
  snapshot: { coreOrderNumber: string; marketplace: string }
  draft: { originLabel: string; destinationLabel: string; serviceFlags: string[] }
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
  const [loading, setLoading] = useState(true)
  const requestIdFromQuery = searchParams.get("requestId")

  useEffect(() => {
    if (!token) return
    authFetch("/api/tms/shipment-requests", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [token])

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
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Расчетов пока нет.</p>
        ) : sortedItems.map((item) => (
          <div key={item.id} className="rounded-lg border p-4">
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
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
