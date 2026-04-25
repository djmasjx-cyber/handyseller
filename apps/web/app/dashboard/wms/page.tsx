"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@handyseller/ui"
import { Boxes, ClipboardList, MapPinned, PackageCheck, Ruler, Warehouse } from "lucide-react"
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

type ReceiptLine = {
  id: string
  itemId: string
  expectedQty: number
  reservedQty: number
  receivedQty: number
  unitPrice?: number | null
}

type ReceiptRecord = {
  id: string
  number: string
  status: string
  warehouseId: string
  lines: ReceiptLine[]
}

type InvRow = { article: string; title: string; quantity: number; price: number }

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
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [whId, setWhId] = useState("")
  const [invRows, setInvRows] = useState<InvRow[]>([{ article: "", title: "", quantity: 1, price: 0 }])
  const [invBusy, setInvBusy] = useState(false)
  const [agx, setAgx] = useState<{ itemId: string; sku: string; title: string } | null>(null)
  const [agxW, setAgxW] = useState("")
  const [agxL, setAgxL] = useState("")
  const [agxWi, setAgxWi] = useState("")
  const [agxH, setAgxH] = useState("")
  const [agxBusy, setAgxBusy] = useState(false)

  const loadData = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [wRes, lRes, eRes, rRes] = await Promise.all([
        authFetch("/api/wms/v1/warehouses", { headers }),
        authFetch("/api/wms/v1/locations", { headers }),
        authFetch("/api/wms/v1/events?limit=10", { headers }),
        authFetch("/api/wms/v1/receipts", { headers }),
      ])
      if (!wRes.ok || !lRes.ok || !eRes.ok) {
        throw new Error("WMS API пока недоступен или пользователь не авторизован.")
      }
      const wh = (await wRes.json()) as WarehouseRecord[]
      setWarehouses(wh)
      setLocations(await lRes.json())
      setEvents(await eRes.json())
      if (rRes.ok) {
        const list = (await rRes.json()) as ReceiptRecord[]
        setReceipts(Array.isArray(list) ? list : [])
      } else {
        setReceipts([])
      }
      setWhId((prev) => prev || wh[0]?.id || "")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить WMS.")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const postInvoice = async () => {
    if (!token || !whId) {
      setError("Выберите склад.")
      return
    }
    const lines = invRows
      .map((r) => ({
        article: r.article.trim(),
        title: r.title.trim(),
        quantity: Math.max(1, Math.floor(r.quantity)),
        price: Math.max(0, r.price),
      }))
      .filter((r) => r.article && r.title)
    if (!lines.length) {
      setError("Добавьте строки накладной (артикул, название).")
      return
    }
    setInvBusy(true)
    setError(null)
    try {
      const res = await authFetch("/api/wms/v1/receipts/invoice", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ warehouseId: whId, lines }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.message === "string" ? data.message : "Ошибка создания накладной")
        return
      }
      setInvRows([{ article: "", title: "", quantity: 1, price: 0 }])
      await loadData()
    } finally {
      setInvBusy(false)
    }
  }

  const saveAgx = async () => {
    if (!token || !agx) return
    const wg = Number(agxW)
    const lCm = Number(agxL)
    const wiCm = Number(agxWi)
    const hCm = Number(agxH)
    if (![wg, lCm, wiCm, hCm].every((n) => Number.isFinite(n) && n > 0)) {
      setError("Заполните вес (г) и габариты (см) — все поля обязательны.")
      return
    }
    setAgxBusy(true)
    setError(null)
    try {
      const res = await authFetch(`/api/wms/v1/items/${encodeURIComponent(agx.itemId)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          weightGrams: Math.round(wg),
          lengthMm: Math.round(lCm * 10),
          widthMm: Math.round(wiCm * 10),
          heightMm: Math.round(hCm * 10),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.message === "string" ? data.message : "Не удалось сохранить АГХ")
        return
      }
      setAgx(null)
      await loadData()
    } finally {
      setAgxBusy(false)
    }
  }

  const acceptRcpt = async (id: string) => {
    if (!token) return
    setError(null)
    const res = await authFetch(`/api/wms/v1/receipts/${encodeURIComponent(id)}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(typeof data?.message === "string" ? data.message : "Приемка отклонена (проверьте АГХ).")
      return
    }
    await loadData()
  }

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
        <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
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

      <Card>
        <CardHeader>
          <CardTitle>Накладная / инвойс</CardTitle>
          <CardDescription>
            Строки: артикул, название, кол-во, цена. Нет в каталоге WMS — товар создаётся. Штрихкод единицы: 12 цифр
            (000000123456). Приемка без полного АГХ заблокирована.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-xs space-y-2">
            <Label>Склад</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={whId}
              onChange={(e) => setWhId(e.target.value)}
            >
              <option value="">—</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </option>
              ))}
            </select>
          </div>
          {invRows.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-12 sm:items-end">
              <div className="sm:col-span-2">
                <Label>Артикул</Label>
                <Input value={row.article} onChange={(e) => setInvRows((p) => p.map((x, j) => (j === i ? { ...x, article: e.target.value } : x)))} />
              </div>
              <div className="sm:col-span-4">
                <Label>Название</Label>
                <Input value={row.title} onChange={(e) => setInvRows((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
              </div>
              <div className="sm:col-span-2">
                <Label>Кол-во</Label>
                <Input
                  type="number"
                  min={1}
                  value={row.quantity}
                  onChange={(e) =>
                    setInvRows((p) => p.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Цена</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={row.price}
                  onChange={(e) =>
                    setInvRows((p) => p.map((x, j) => (j === i ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x)))
                  }
                />
              </div>
              <div className="sm:col-span-2 flex gap-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setInvRows((p) => [...p, { article: "", title: "", quantity: 1, price: 0 }])}>
                  +
                </Button>
                <Button type="button" variant="ghost" size="sm" disabled={invRows.length < 2} onClick={() => setInvRows((p) => p.filter((_, j) => j !== i))}>
                  −
                </Button>
              </div>
            </div>
          ))}
          <Button type="button" onClick={() => void postInvoice()} disabled={invBusy || !whId}>
            {invBusy ? "…" : "Создать и зарезервировать штрихкоды"}
          </Button>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle>Накладные</CardTitle>
          <CardDescription>Приёмка: кнопка «Принять» сработает только если у всех позиций заполнены вес и габариты.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!receipts.length ? <p className="text-sm text-muted-foreground">Пока нет накладных.</p> : null}
          {receipts.map((r) => (
            <div key={r.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{r.number}</div>
                  <div className="text-xs text-muted-foreground">{r.status}</div>
                </div>
                {r.status !== "RECEIVED" && r.status !== "CLOSED" ? (
                  <Button type="button" size="sm" onClick={() => void acceptRcpt(r.id)}>
                    Принять
                  </Button>
                ) : null}
              </div>
              <div className="text-sm space-y-1">
                {r.lines.map((ln) => (
                  <div key={ln.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 first:border-0 first:pt-0">
                    <span>
                      {ln.itemId.slice(0, 8)}… ×{ln.expectedQty}
                      {ln.unitPrice != null ? ` · ${ln.unitPrice} ₽` : ""}
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={() => setAgx({ itemId: ln.itemId, sku: ln.itemId, title: "" })}>
                      <Ruler className="h-3.5 w-3.5 mr-1" />
                      АГХ
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {agx ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !agxBusy && setAgx(null)}>
          <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">АГХ (товар {agx.itemId.slice(0, 8)}…)</h3>
            <p className="text-xs text-muted-foreground mb-3">Вес в граммах, габариты в сантиметрах (в API уходят как мм).</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Вес, г</Label>
                <Input type="number" min={1} value={agxW} onChange={(e) => setAgxW(e.target.value)} />
              </div>
              <div>
                <Label>Длина, см</Label>
                <Input type="number" min={1} value={agxL} onChange={(e) => setAgxL(e.target.value)} />
              </div>
              <div>
                <Label>Ширина, см</Label>
                <Input type="number" min={1} value={agxWi} onChange={(e) => setAgxWi(e.target.value)} />
              </div>
              <div>
                <Label>Высота, см</Label>
                <Input type="number" min={1} value={agxH} onChange={(e) => setAgxH(e.target.value)} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setAgx(null)} disabled={agxBusy}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void saveAgx()} disabled={agxBusy}>
                {agxBusy ? "…" : "Сохранить"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
