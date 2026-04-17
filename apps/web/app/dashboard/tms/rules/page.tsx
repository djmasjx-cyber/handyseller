"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, Badge } from "@handyseller/ui"
import { Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

export default function TmsRulesPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [items, setItems] = useState<Array<{ id: string; name: string; mode: string; active: boolean; description: string }>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    authFetch("/api/tms/routing-policies", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>

  return (
    <Card>
      <CardHeader>
        <CardTitle>Правила выбора</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">{item.name}</p>
              <Badge variant={item.active ? "default" : "outline"}>{item.mode}</Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-2">{item.description}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
