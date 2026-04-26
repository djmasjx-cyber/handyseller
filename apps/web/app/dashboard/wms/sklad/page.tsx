"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
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
import { ChevronRight, ClipboardList, FileUp, MapPinned, PackageCheck, PackagePlus, UserRound, Warehouse } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS, getStoredUser } from "@/lib/auth-storage"
type WarehouseRecord = {
  id: string
  code: string
  name: string
  kind: "PHYSICAL" | "VIRTUAL"
  status: string
}

type ReceiptLine = {
  id: string
  itemId: string
  expectedQty: number
  reservedQty: number
  receivedQty: number
  unitPrice?: number | null
  sku?: string | null
  lineTitle?: string | null
}

type ReceiptRecord = {
  id: string
  number: string
  status: string
  warehouseId: string
  lines: ReceiptLine[]
  createdAt?: string
  updatedAt?: string
}

type InvRow = { article: string; title: string; quantity: number; price: number }

type MeProfile = { id: string; label: string }

function meFromUnknown(u: Record<string, unknown> | null | undefined): MeProfile | null {
  if (!u) return null
  const id = typeof u.id === "string" ? u.id.trim() : ""
  if (!id) return null
  const name = typeof u.name === "string" ? u.name.trim() : ""
  const email = typeof u.email === "string" ? u.email.trim() : ""
  return { id, label: name || email || id }
}

const FLOW_CHIPS = [
  { label: "Накладная", icon: ClipboardList },
  { label: "Тара", icon: PackagePlus },
  { label: "Ячейка", icon: MapPinned },
  { label: "На полку", icon: PackageCheck },
] as const

function receiptStatusRu(s: string) {
  switch (s) {
    case "DRAFT":
      return "Черновик"
    case "EXPECTED":
      return "Ожидает"
    case "RECEIVING":
      return "Приёмка"
    case "RECEIVED":
      return "Принято"
    case "CLOSED":
      return "Закрыта"
    case "CANCELLED":
      return "Отмена"
    default:
      return s
  }
}

export default function WmsSkladPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([])
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [whId, setWhId] = useState("")
  const [invRows, setInvRows] = useState<InvRow[]>([{ article: "", title: "", quantity: 1, price: 0 }])
  const [invBusy, setInvBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<MeProfile | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [wRes, rRes, meRes] = await Promise.all([
        authFetch("/api/wms/v1/warehouses", { headers }),
        authFetch("/api/wms/v1/receipts", { headers }),
        authFetch("/api/users/me", { headers }),
      ])
      if (!wRes.ok) throw new Error("Не удалось загрузить склады.")
      const wh = (await wRes.json()) as WarehouseRecord[]
      setWarehouses(wh)
      if (rRes.ok) {
        const list = (await rRes.json()) as ReceiptRecord[]
        setReceipts(Array.isArray(list) ? list : [])
      } else {
        setReceipts([])
      }
      if (meRes.ok) {
        const raw = (await meRes.json().catch(() => null)) as Record<string, unknown> | null
        setMe(meFromUnknown(raw) ?? null)
      }
      setWhId((prev) => (prev && wh.some((w) => w.id === prev) ? prev : wh[0]?.id || ""))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    const u = getStoredUser()
    if (u?.id) {
      setMe((prev) => prev ?? { id: u.id, label: (u.name || u.email || u.id).trim() })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
      setError("Добавьте минимум одну строку (артикул и название).")
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
      setSuccessMessage("Накладная создана. Штрихкоды зарезервированы на каждую единицу (по количеству).")
      await load()
    } finally {
      setInvBusy(false)
    }
  }

  useEffect(() => {
    if (!successMessage) return
    const t = window.setTimeout(() => setSuccessMessage(null), 4500)
    return () => window.clearTimeout(t)
  }, [successMessage])

  const filteredReceipts = whId ? receipts.filter((r) => r.warehouseId === whId) : receipts
  const activeWh = warehouses.find((w) => w.id === whId)

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Warehouse className="h-7 w-7 text-primary shrink-0" />
            <h1 className="text-2xl font-semibold tracking-tight">Склад</h1>
            <Badge variant="secondary" className="font-normal">
              накладные и приход
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Выберите склад, создайте накладную вручную или загрузите из файла (подключим). Ниже — реестр, откройте накладную, чтобы
            увидеть строки и уникальные штрихкоды.
          </p>
          {me ? (
            <p className="mt-2 text-xs text-muted-foreground">
              <UserRound className="inline h-3.5 w-3.5 opacity-70 mr-1" aria-hidden />
              <span className="font-medium text-foreground">{me.label}</span>
            </p>
          ) : null}
        </div>
        <Button type="button" variant="outline" className="min-h-10" onClick={() => void load()} disabled={loading}>
          {loading ? "Обновление…" : "Обновить"}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-dashed bg-muted/25 px-3 py-2.5 text-xs sm:text-sm">
        <span className="text-muted-foreground">Цепочка:</span>
        {FLOW_CHIPS.map((chip, i) => {
          const Icon = chip.icon
          return (
            <span key={chip.label} className="inline-flex items-center gap-1">
              {i > 0 ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" /> : null}
              <span className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1">
                <Icon className="h-3.5 w-3.5 opacity-80" />
                {chip.label}
              </span>
            </span>
          )
        })}
      </div>

      {successMessage && !error ? (
        <Card className="border-emerald-200 bg-emerald-50/90">
          <CardContent className="py-3 text-sm font-medium text-emerald-950">{successMessage}</CardContent>
        </Card>
      ) : null}
      {error ? (
        <Card className="border-amber-200 bg-amber-50" role="alert">
          <CardContent className="py-3 text-sm text-amber-950">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-1 max-w-md">
          <Label>Активный склад</Label>
          <select
            className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={whId}
            onChange={(e) => setWhId(e.target.value)}
          >
            <option value="">— выберите —</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
          {activeWh ? <p className="text-xs text-muted-foreground">{activeWh.name}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="lg" className="min-h-11" disabled={!whId} asChild>
            <a href="#sozdat-nakladnuyu">Создать накладную</a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card id="sozdat-nakladnuyu" className="scroll-mt-4">
          <CardHeader>
            <CardTitle>Создать накладную вручную</CardTitle>
            <CardDescription>
              На каждую единицу в количестве автоматически выдаётся внутренний 12-значный штрихкод. Дальше логика загрузки и импорта
              добавится отдельно.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {invRows.map((row, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-3">
                  <Label>Артикул</Label>
                  <Input
                    value={row.article}
                    onChange={(e) => setInvRows((p) => p.map((x, j) => (j === i ? { ...x, article: e.target.value } : x)))}
                    className="min-h-10"
                  />
                </div>
                <div className="sm:col-span-4">
                  <Label>Название</Label>
                  <Input
                    value={row.title}
                    onChange={(e) => setInvRows((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    className="min-h-10"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Кол-во</Label>
                  <Input
                    type="number"
                    min={1}
                    className="min-h-10"
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
                    className="min-h-10"
                    value={row.price}
                    onChange={(e) =>
                      setInvRows((p) => p.map((x, j) => (j === i ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x)))
                    }
                  />
                </div>
                <div className="sm:col-span-1 flex gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    onClick={() => setInvRows((p) => [...p, { article: "", title: "", quantity: 1, price: 0 }])}
                  >
                    +
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0"
                    disabled={invRows.length < 2}
                    onClick={() => setInvRows((p) => p.filter((_, j) => j !== i))}
                  >
                    −
                  </Button>
                </div>
              </div>
            ))}
            <Button type="button" className="min-h-11 w-full sm:w-auto" size="lg" onClick={() => void postInvoice()} disabled={invBusy || !whId}>
              {invBusy ? "Создаём…" : "Создать и зарезервировать штрихкоды"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileUp className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Загрузить накладную</CardTitle>
                <CardDescription>Импорт из файла (CSV / Excel) — на следующем шаге. Пока — макет.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <label
              className="flex min-h-[140px] cursor-not-allowed flex-col items-center justify-center rounded-xl border-2 border-dashed border-muted-foreground/30 bg-muted/20 px-4 text-center text-sm text-muted-foreground"
            >
              <input type="file" className="sr-only" disabled accept=".csv,.xlsx,.xls" />
              <FileUp className="mb-2 h-8 w-8 opacity-50" />
              <span className="font-medium text-foreground/80">Перетащите файл сюда</span>
              <span className="text-xs">или нажмите, когда появится поддержка</span>
            </label>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Реестр накладных</CardTitle>
          <CardDescription>Отфильтровано по выбранному складу. Нажмите накладную, чтобы увидеть строки и штрихкоды.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : !whId ? (
            <p className="text-sm text-muted-foreground">Сначала выберите склад выше.</p>
          ) : !filteredReceipts.length ? (
            <p className="text-sm text-muted-foreground">Пока нет накладных на этом складе.</p>
          ) : (
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-2 pr-3">Номер</th>
                  <th className="py-2 pr-3">Статус</th>
                  <th className="py-2 pr-3">Строк</th>
                  <th className="py-2 pr-3" />
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.map((r) => (
                  <tr key={r.id} className="border-b border-muted/40 last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs sm:text-sm">{r.number}</td>
                    <td className="py-2.5 pr-3">{receiptStatusRu(r.status)}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{r.lines?.length ?? 0}</td>
                    <td className="py-2.5 pr-0 text-right">
                      <Button type="button" size="sm" variant="secondary" asChild>
                        <Link href={`/dashboard/wms/sklad/receipts/${encodeURIComponent(r.id)}`}>Открыть</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
