"use client"

import { useCallback, useEffect, useId, useState, type DragEventHandler } from "react"
import Link from "next/link"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@handyseller/ui"
import { FileUp, UserRound } from "lucide-react"
import { WmsSubnav } from "@/components/wms/wms-subnav"
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

type InvRow = { article: string; title: string; quantity: number; price: string }

type MeProfile = { id: string; label: string }

function meFromUnknown(u: Record<string, unknown> | null | undefined): MeProfile | null {
  if (!u) return null
  const id = typeof u.id === "string" ? u.id.trim() : ""
  if (!id) return null
  const name = typeof u.name === "string" ? u.name.trim() : ""
  const email = typeof u.email === "string" ? u.email.trim() : ""
  return { id, label: name || email || id }
}

function detectSep(line: string): string {
  const commas = (line.match(/,/g) ?? []).length
  const semis = (line.match(/;/g) ?? []).length
  return semis > commas ? ";" : ","
}

function splitRow(line: string, sep: string): string[] {
  const parts: string[] = []
  let cur = ""
  let q = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]!
    if (c === '"') {
      q = !q
      continue
    }
    if (!q && c === sep) {
      parts.push(cur.trim())
      cur = ""
      continue
    }
    cur += c
  }
  parts.push(cur.trim())
  return parts
}

const normH = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase()

function parseInvoiceCsv(text: string): InvRow[] {
  const raw = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (raw.length === 0) return []
  const sep = detectSep(raw[0]!)
  const first = splitRow(raw[0]!, sep).map(normH)

  const idx = (pred: (h: string) => boolean) => {
    const i = first.findIndex(pred)
    return i >= 0 ? i : -1
  }

  const hasHeader =
    first.some(
      (h) =>
        h.includes("артик") ||
        h === "article" ||
        h === "sku" ||
        h === "код" ||
        h.includes("назван") ||
        h === "title" ||
        h.includes("наимен") ||
        h.includes("кол") ||
        h === "quantity" ||
        h.includes("цен") ||
        h === "price",
    )

  let colA = 0
  let colT = 1
  let colQ = 2
  let colP = 3
  if (hasHeader) {
    const a = idx((h) => h.includes("артик") || h === "article" || h === "sku" || h === "код")
    const t = idx((h) => h.includes("назван") || h.includes("наимен") || h === "title" || h === "name" || h.includes("описан"))
    const q = idx((h) => h.includes("кол") || h === "quantity" || h === "qty" || h.startsWith("кол"))
    const p = idx((h) => h.includes("цен") || h === "price" || h.includes("стоим"))
    if (a >= 0) colA = a
    if (t >= 0) colT = t
    if (q >= 0) colQ = q
    if (p >= 0) colP = p
  }

  const out: InvRow[] = []
  const start = hasHeader ? 1 : 0
  for (let r = start; r < raw.length; r += 1) {
    const row = splitRow(raw[r]!, sep)
    const article = (row[colA] ?? "").replace(/^"|"$/g, "").trim()
    const title = (row[colT] ?? "").replace(/^"|"$/g, "").trim()
    const qtyStr = (row[colQ] ?? "1").replace(/^"|"$/g, "").replace(/\s/g, "").replace(",", ".")
    const priceStr = (row[colP] ?? "0").replace(/^"|"$/g, "").replace(/\s/g, "").replace(",", ".")
    const quantity = Math.max(1, Math.floor(Number(qtyStr) || 1))
    const priceNum = Math.max(0, Number(priceStr) || 0)
    if (!article || !title) continue
    out.push({ article, title, quantity, price: priceNum > 0 ? String(priceNum) : "" })
  }
  return out
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

export default function WmsSkladPage() {
  const fileInputId = useId()
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([])
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([])
  const [whId, setWhId] = useState("")
  const [invRows, setInvRows] = useState<InvRow[]>([{ article: "", title: "", quantity: 1, price: "" }])
  const [invBusy, setInvBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [importHint, setImportHint] = useState<string | null>(null)
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
        price: Math.max(0, parseFloat(String(r.price).replace(",", ".").trim()) || 0),
      }))
      .filter((r) => r.article && r.title)
    if (!lines.length) {
      setError("Добавьте минимум одну строку (артикул и название).")
      return
    }
    setInvBusy(true)
    setError(null)
    setImportHint(null)
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
      setInvRows([{ article: "", title: "", quantity: 1, price: "" }])
      setSuccessMessage("Накладная создана, штрихкоды зарезервированы.")
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

  const onDragOver: DragEventHandler<HTMLLabelElement> = (e) => {
    e.preventDefault()
  }

  const onDrop: DragEventHandler<HTMLLabelElement> = (e) => {
    e.preventDefault()
    if (!whId) return
    const f = e.dataTransfer.files[0]
    onFile(f ?? null)
  }

  const onFile = (file: File | null) => {
    setError(null)
    setImportHint(null)
    if (!file) return
    const name = file.name.toLowerCase()
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      setError("Импорт: пока только CSV/UTF-8. Сохраните лист как CSV в Excel.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : ""
      try {
        const rows = parseInvoiceCsv(text)
        if (!rows.length) {
          setError("В файле не найдено ни одной валидной строки (артикул, название).")
          return
        }
        setInvRows(rows)
        setImportHint(`В таблицу подставлено строк: ${rows.length}. Проверьте и нажмите «Создать накладную».`)
      } catch {
        setError("Не удалось прочитать CSV.")
      }
    }
    reader.onerror = () => setError("Ошибка чтения файла.")
    reader.readAsText(file, "UTF-8")
  }

  const filteredReceipts = whId ? receipts.filter((r) => r.warehouseId === whId) : receipts
  const activeWh = warehouses.find((w) => w.id === whId)
  const canSubmit =
    Boolean(whId) && invRows.some((r) => r.article.trim().length > 0 && r.title.trim().length > 0)

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="mb-2 flex min-w-0 flex-col gap-2 lg:flex-row lg:items-stretch lg:justify-between lg:gap-3">
        <div className="grid min-w-0 w-full flex-1 grid-cols-1 gap-2 min-[560px]:grid-cols-2 min-[960px]:grid-cols-4 items-stretch ps-0.5">
          <WmsSubnav asToolbarGrid />
          <select
            aria-label="Выберите склад"
            className="flex h-10 min-h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm"
            value={whId}
            onChange={(e) => {
              setWhId(e.target.value)
              setImportHint(null)
            }}
          >
            <option value="">— выберите склад —</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0 lg:justify-end">
          <Button type="button" variant="outline" className="min-h-10 h-10" onClick={() => void load()} disabled={loading}>
            {loading ? "…" : "Обновить"}
          </Button>
          {me ? (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 max-w-[12rem] truncate min-h-10" title={me.label}>
              <UserRound className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              <span className="font-medium text-foreground truncate">{me.label}</span>
            </p>
          ) : null}
        </div>
      </div>
      {activeWh ? <p className="text-xs text-muted-foreground truncate -mt-1">{activeWh.name}</p> : null}

      {successMessage && !error ? (
        <p className="text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{successMessage}</p>
      ) : null}
      {importHint && !error ? <p className="text-sm text-muted-foreground">{importHint}</p> : null}
      {error ? (
        <p className="text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-md px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-base">Новая накладная</CardTitle>
            <CardDescription className="text-xs">Строки и кнопка «Создать накладную»</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 px-4 pt-0 pb-3">
            {invRows.map((row, i) => (
              <div
                key={i}
                className="flex flex-col gap-2 rounded-md border border-transparent sm:flex-row sm:flex-wrap sm:items-end sm:gap-x-2 sm:gap-y-1.5 text-sm"
              >
                <div className="min-w-0 sm:flex-[2] sm:min-w-[6rem]">
                  <Label className="text-xs">Артикул</Label>
                  <Input
                    value={row.article}
                    onChange={(e) => setInvRows((p) => p.map((x, j) => (j === i ? { ...x, article: e.target.value } : x)))}
                    className="h-8"
                  />
                </div>
                <div className="min-w-0 sm:flex-[2] sm:min-w-[7rem]">
                  <Label className="text-xs">Название</Label>
                  <Input
                    value={row.title}
                    onChange={(e) => setInvRows((p) => p.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                    className="h-8"
                  />
                </div>
                <div className="w-full sm:w-[5.25rem] shrink-0">
                  <Label className="text-xs">Кол-во</Label>
                  <Input
                    type="number"
                    min={1}
                    className="h-8 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    value={row.quantity}
                    onChange={(e) =>
                      setInvRows((p) => p.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x)))
                    }
                  />
                </div>
                <div className="w-full sm:w-[6.5rem] shrink-0">
                  <Label className="text-xs">Цена</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder=""
                    className="h-8"
                    value={row.price}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v === "" || /^[0-9]*[.,]?[0-9]*$/.test(v)) {
                        setInvRows((p) => p.map((x, j) => (j === i ? { ...x, price: v } : x)))
                      }
                    }}
                  />
                </div>
                <div className="flex shrink-0 gap-1 pb-0.5 sm:ml-auto">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setInvRows((p) => [...p, { article: "", title: "", quantity: 1, price: "" }])}
                  >
                    +
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    disabled={invRows.length < 2}
                    onClick={() => setInvRows((p) => p.filter((_, j) => j !== i))}
                  >
                    −
                  </Button>
                </div>
              </div>
            ))}
            <div className="pt-1">
              <Button type="button" className="h-9 w-full sm:w-auto" onClick={() => void postInvoice()} disabled={invBusy || !canSubmit}>
                {invBusy ? "Создаём…" : "Создать накладную"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="px-4 py-3">
            <div className="flex items-center gap-2">
              <FileUp className="h-4 w-4 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Импорт из CSV</CardTitle>
                <CardDescription className="text-xs">Артикул, название, кол-во, цена (первая строка может быть заголовком).</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-4 pt-0 pb-3">
            <label
              htmlFor={fileInputId}
              onDragOver={onDragOver}
              onDrop={onDrop}
              className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/35 bg-muted/20 px-3 py-2 text-center text-sm text-muted-foreground"
            >
              <input
                id={fileInputId}
                type="file"
                className="sr-only"
                accept=".csv,.txt"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                disabled={!whId}
              />
              <FileUp className="mb-1 h-6 w-6 opacity-60" />
              <span className="font-medium text-foreground/90">CSV (UTF-8)</span>
              <span className="text-xs">{!whId ? "Сначала выберите склад" : "Нажмите или перетащите сюда"}</span>
            </label>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Реестр</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pt-0 pb-3 overflow-x-auto">
          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : !whId ? (
            <p className="text-sm text-muted-foreground">Сначала выберите склад.</p>
          ) : !filteredReceipts.length ? (
            <p className="text-sm text-muted-foreground">Нет накладных на этом складе.</p>
          ) : (
            <table className="w-full min-w-[540px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2">Номер</th>
                  <th className="py-1.5 pr-2">Статус</th>
                  <th className="py-1.5 pr-2">Строк</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.map((r) => (
                  <tr key={r.id} className="border-b border-muted/40 last:border-0">
                    <td className="py-2 pr-2 font-mono text-xs sm:text-sm">{r.number}</td>
                    <td className="py-2 pr-2">{receiptStatusRu(r.status)}</td>
                    <td className="py-2 pr-2 text-muted-foreground">{r.lines?.length ?? 0}</td>
                    <td className="py-2 pr-0 text-right">
                      <Button type="button" size="sm" variant="secondary" className="h-7" asChild>
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
