"use client"

import { useCallback, useEffect, useState } from "react"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { Boxes, ClipboardList, MapPinned, PackageCheck, Warehouse } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

type WarehouseRecord = {
  id: string
  code: string
  name: string
  kind: "PHYSICAL" | "VIRTUAL"
  status: string
}

type LocationRecord = {
  id: string
  code: string
  name: string
  type: string
  path: string
  status: string
}

type EventRecord = {
  id: string
  type: string
  occurredAt: string
  payload: Record<string, unknown>
}

const MVP_STEPS = [
  { title: "Топология", text: "Склады, зоны, ряды, полки, ячейки и буферные зоны как дерево адресного хранения.", icon: MapPinned },
  { title: "Приемка", text: "Приходная накладная, резерв внутренних штрихкодов и временная тара LPN.", icon: ClipboardList },
  { title: "Размещение", text: "Перемещение единиц или тары в ячейку с immutable-историей каждого сканирования.", icon: PackageCheck },
  { title: "Поиск barcode", text: "Один barcode должен показывать товар, тару, ячейку и всю историю движения.", icon: Boxes },
]

export default function WmsDashboardPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([])
  const [locations, setLocations] = useState<LocationRecord[]>([])
  const [events, setEvents] = useState<EventRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [warehouseRes, locationRes, eventRes] = await Promise.all([
        authFetch("/api/wms/v1/warehouses", { headers }),
        authFetch("/api/wms/v1/locations", { headers }),
        authFetch("/api/wms/v1/events?limit=10", { headers }),
      ])
      if (!warehouseRes.ok || !locationRes.ok || !eventRes.ok) {
        throw new Error("WMS API пока недоступен или пользователь не авторизован.")
      }
      setWarehouses(await warehouseRes.json())
      setLocations(await locationRes.json())
      setEvents(await eventRes.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить WMS.")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadData()
  }, [loadData])

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Warehouse className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold">WMS</h1>
            <Badge variant="secondary">MVP каркас</Badge>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Самостоятельный складской контур: адресное хранение, уникальные barcodes, LPN/тара,
            приемка, размещение и полная история движения.
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          Обновить
        </Button>
      </div>

      {error ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-sm text-amber-900">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        {MVP_STEPS.map((step) => {
          const Icon = step.icon
          return (
            <Card key={step.title}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="h-4 w-4" />
                  {step.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{step.text}</CardContent>
            </Card>
          )
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Склады</CardTitle>
            <CardDescription>Физические и виртуальные склады WMS.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {warehouses.length ? (
              warehouses.map((warehouse) => (
                <div key={warehouse.id} className="rounded-lg border p-3">
                  <div className="font-medium">{warehouse.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {warehouse.code} · {warehouse.kind} · {warehouse.status}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Склады еще не заведены.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Топология</CardTitle>
            <CardDescription>Дерево адресного хранения без жестко зашитых уровней.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {locations.slice(0, 8).map((location) => (
              <div key={location.id} className="rounded-lg border p-3">
                <div className="font-medium">{location.path}</div>
                <div className="text-xs text-muted-foreground">
                  {location.name} · {location.type} · {location.status}
                </div>
              </div>
            ))}
            {!locations.length ? <p className="text-sm text-muted-foreground">Ячейки еще не заведены.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>История</CardTitle>
            <CardDescription>Свежие события движения и сканирования.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border p-3">
                <div className="font-medium">{event.type}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(event.occurredAt).toLocaleString("ru-RU")} · {String(event.payload.title ?? "")}
                </div>
              </div>
            ))}
            {!events.length ? <p className="text-sm text-muted-foreground">История пока пустая.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
