"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@handyseller/ui"
import { ArrowLeft, Ruler } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { WmsSubnav } from "@/components/wms/wms-subnav"
import { formatWmsAcceptError } from "@/lib/wms-ui"

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

type UnitRow = {
  id: string
  itemId: string
  barcode: string
  status: string
  receiptLineId: string | null
  declaredUnitPrice?: number | null
}

type ItemSnapshot = {
  id: string
  dimensions: {
    weightGrams?: number | null
    lengthMm?: number | null
    widthMm?: number | null
    heightMm?: number | null
  }
}

function lineForUnit(lines: ReceiptLine[], u: UnitRow) {
  return lines.find((l) => l.id === u.receiptLineId) ?? null
}

function dimensionsComplete(dim: ItemSnapshot["dimensions"] | undefined | null): boolean {
  if (!dim || typeof dim !== "object") return false
  const ok = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 1
  return ok(dim.weightGrams) && ok(dim.lengthMm) && ok(dim.widthMm) && ok(dim.heightMm)
}

function formatDisplayItemNo(index: number): string {
  return String(index + 1).padStart(6, "0")
}

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

export default function WmsReceiptDetailPage() {
  const params = useParams()
  const receiptId = typeof params?.receiptId === "string" ? params.receiptId : ""
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null

  const [receipt, setReceipt] = useState<ReceiptRecord | null>(null)
  const [units, setUnits] = useState<UnitRow[]>([])
  const [items, setItems] = useState<ItemSnapshot[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [vgh, setVgh] = useState<{ itemId: string; sku: string; title: string } | null>(null)
  const [vghW, setVghW] = useState("")
  const [vghL, setVghL] = useState("")
  const [vghWi, setVghWi] = useState("")
  const [vghH, setVghH] = useState("")
  const [vghBusy, setVghBusy] = useState(false)
  const [unitSheet, setUnitSheet] = useState<{
    open: boolean
    units: UnitRow[]
  } | null>(null)

  const load = useCallback(async () => {
    if (!token || !receiptId) return
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`/api/wms/v1/receipts/${encodeURIComponent(receiptId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.message === "string" ? data.message : "Накладная не найдена")
        setReceipt(null)
        setUnits([])
        return
      }
      const r = data?.receipt as ReceiptRecord | undefined
      const u = (Array.isArray(data?.units) ? data?.units : []) as UnitRow[]
      const rawItems = data?.items
      if (Array.isArray(rawItems)) {
        setItems(
          rawItems.map((x) => {
            const o = x as Record<string, unknown>
            const id = typeof o.id === "string" ? o.id : ""
            const dim = (o.dimensions && typeof o.dimensions === "object" ? o.dimensions : {}) as ItemSnapshot["dimensions"]
            return { id, dimensions: dim }
          }),
        )
      } else {
        setItems([])
      }
      if (r) setReceipt(r)
      setUnits(
        u.map((x) => ({
          id: String(x.id ?? ""),
          itemId: String(x.itemId ?? ""),
          barcode: String(x.barcode ?? ""),
          status: String(x.status ?? ""),
          receiptLineId: (x.receiptLineId as string | null) ?? null,
          declaredUnitPrice: (x as { declaredUnitPrice?: number | null }).declaredUnitPrice,
        })),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }, [token, receiptId])

  useEffect(() => {
    void load()
  }, [load])

  const saveVgh = async () => {
    if (!token || !vgh) return
    const wg = Number(vghW)
    const lCm = Number(vghL)
    const wiCm = Number(vghWi)
    const hCm = Number(vghH)
    if (![wg, lCm, wiCm, hCm].every((n) => Number.isFinite(n) && n > 0)) {
      setError("Заполните вес (г) и габариты (см) — все поля обязательны.")
      return
    }
    setVghBusy(true)
    setError(null)
    try {
      const res = await authFetch(`/api/wms/v1/items/${encodeURIComponent(vgh.itemId)}`, {
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
        setError(typeof data?.message === "string" ? data.message : "Не удалось сохранить ВГХ")
        return
      }
      setVgh(null)
      await load()
    } finally {
      setVghBusy(false)
    }
  }

  const acceptRcpt = async () => {
    if (!token || !receipt) return
    setError(null)
    if (items.length > 0) {
      const uniqueItemIds = [...new Set(receipt.lines.map((ln) => ln.itemId))]
      const missingVgh = uniqueItemIds.filter((itemId) => {
        const snap = items.find((it) => it.id === itemId)
        return !dimensionsComplete(snap?.dimensions)
      })
      if (missingVgh.length > 0) {
        setError(
          "Не у всех товаров заполнены ВГХ (вес и габариты). Откройте «ВГХ» по каждой позиции, сохраните данные, затем примите накладную.",
        )
        return
      }
    }
    const res = await authFetch(`/api/wms/v1/receipts/${encodeURIComponent(receiptId)}/accept`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(formatWmsAcceptError(data))
      return
    }
    await load()
  }

  if (!receiptId) {
    return <p className="p-4 text-sm text-muted-foreground">Некорректная ссылка.</p>
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4 ps-0.5">
      <WmsSubnav />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" className="min-h-10 gap-1 px-0" asChild>
          <Link href="/dashboard/wms/sklad">
            <ArrowLeft className="h-4 w-4" />
            К реестру
          </Link>
        </Button>
      </div>

      {error ? (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 text-sm text-amber-950">{error}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-xl">Накладная {receipt ? receipt.number : "…"}</CardTitle>
              <CardDescription className="mt-1">
                {receipt ? (
                  <>
                    <span className="font-medium text-foreground">{receiptStatusRu(receipt.status)}</span>
                    {receipt.warehouseId ? <span className="text-muted-foreground"> · склад: {receipt.warehouseId.slice(0, 8)}…</span> : null}
                  </>
                ) : null}
              </CardDescription>
            </div>
            {receipt && receipt.status !== "RECEIVED" && receipt.status !== "CLOSED" ? (
              <Button type="button" className="min-h-10" onClick={() => void acceptRcpt()}>
                Принять
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : !receipt ? null : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="min-h-9" onClick={() => setUnitSheet({ open: true, units })}>
                  Список штрихкодов
                </Button>
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Позиции (каждая единица — свой штрихкод)</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                        <th className="p-2 pr-3">ID товара</th>
                        <th className="p-2 pr-3">Артикул</th>
                        <th className="p-2 pr-3">Название</th>
                        <th className="p-2 pr-3">Штрихкод</th>
                        <th className="p-2 w-24"> </th>
                      </tr>
                    </thead>
                    <tbody>
                      {units
                        .slice()
                        .sort((a, b) => a.barcode.localeCompare(b.barcode))
                        .map((u, rowIdx) => {
                          const ln = lineForUnit(receipt.lines, u)
                          const title = ln?.lineTitle || "—"
                          const art = ln?.sku || "—"
                          const snap = items.find((it) => it.id === u.itemId)
                          const hasVgh = dimensionsComplete(snap?.dimensions)
                          return (
                            <tr key={u.id} className="border-b border-muted/40 last:border-0">
                              <td className="p-2 pr-3 font-mono text-sm tabular-nums text-foreground">{formatDisplayItemNo(rowIdx)}</td>
                              <td className="p-2 pr-3">{art}</td>
                              <td className="p-2 pr-3 max-w-xs">{title}</td>
                              <td className="p-2 pr-3 font-mono tabular-nums text-xs">
                                {u.barcode ? (
                                  <span className={/\D/.test(u.barcode) ? "text-amber-900" : undefined}>{u.barcode}</span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td className="p-2 text-right">
                                <Button
                                  type="button"
                                  variant={hasVgh ? "ghost" : "outline"}
                                  size="sm"
                                  className={
                                    hasVgh
                                      ? "h-8 text-muted-foreground/75 hover:text-muted-foreground"
                                      : "h-8"
                                  }
                                  title={
                                    hasVgh
                                      ? "ВГХ уже указаны — можно открыть и исправить при необходимости"
                                      : "Указать вес и габариты"
                                  }
                                  onClick={() => {
                                    const d = snap?.dimensions
                                    if (d && dimensionsComplete(d)) {
                                      setVghW(String(d.weightGrams))
                                      setVghL(String((d.lengthMm ?? 0) / 10))
                                      setVghWi(String((d.widthMm ?? 0) / 10))
                                      setVghH(String((d.heightMm ?? 0) / 10))
                                    } else {
                                      setVghW("")
                                      setVghL("")
                                      setVghWi("")
                                      setVghH("")
                                    }
                                    setVgh({
                                      itemId: u.itemId,
                                      sku: typeof art === "string" ? art : u.itemId.slice(0, 12),
                                      title: typeof title === "string" ? title : "",
                                    })
                                  }}
                                >
                                  <Ruler className="h-3.5 w-3.5 mr-1 shrink-0 opacity-80" />
                                  ВГХ
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                  {units.length === 0 ? (
                    <p className="p-3 text-sm text-muted-foreground">По этой накладной ещё нет зарезервированных единиц.</p>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Строки накладной: {receipt.lines.length}. Если товаров меньше, сначала создайте/зарезервируйте штрихкоды. В колонке «ID товара» —
                  порядковый номер строки (000001…). Штрихкоды — только цифры; устаревшие при открытии накладной пересохраняются автоматически.
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {vgh ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !vghBusy && setVgh(null)}>
          <div className="w-full max-w-md rounded-lg border bg-background p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">
              ВГХ (весогабаритные): {vgh.sku}
              {vgh.title ? <span className="font-normal text-muted-foreground"> — {vgh.title}</span> : null}
            </h3>
            <p className="text-xs text-muted-foreground mb-3">Вес в граммах, габариты в сантиметрах (в API — миллиметры).</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Вес, г</Label>
                <Input type="number" min={1} value={vghW} onChange={(e) => setVghW(e.target.value)} />
              </div>
              <div>
                <Label>Длина, см</Label>
                <Input type="number" min={1} value={vghL} onChange={(e) => setVghL(e.target.value)} />
              </div>
              <div>
                <Label>Ширина, см</Label>
                <Input type="number" min={1} value={vghWi} onChange={(e) => setVghWi(e.target.value)} />
              </div>
              <div>
                <Label>Высота, см</Label>
                <Input type="number" min={1} value={vghH} onChange={(e) => setVghH(e.target.value)} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setVgh(null)} disabled={vghBusy}>
                Отмена
              </Button>
              <Button type="button" onClick={() => void saveVgh()} disabled={vghBusy}>
                {vghBusy ? "…" : "Сохранить"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {unitSheet?.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setUnitSheet(null)}>
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border bg-background p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">Штрихкоды по накладной {receipt?.number ?? ""}</h3>
                <p className="text-xs text-muted-foreground">Каждая физическая единица — уникальный код.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setUnitSheet(null)}>
                Закрыть
              </Button>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-2 pr-2">Штрихкод</th>
                  <th className="py-2 pr-2">Статус</th>
                  <th className="py-2 pr-2">Цена ед.</th>
                </tr>
              </thead>
              <tbody>
                {unitSheet.units.map((u) => (
                  <tr key={u.id} className="border-b border-muted/40">
                    <td className="py-2 pr-2 font-mono">{u.barcode}</td>
                    <td className="py-2 pr-2">{u.status}</td>
                    <td className="py-2 pr-2">{u.declaredUnitPrice != null ? `${u.declaredUnitPrice} ₽` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {unitSheet.units.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Нет единиц.</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
