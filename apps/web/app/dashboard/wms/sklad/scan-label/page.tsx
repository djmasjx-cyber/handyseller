"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@handyseller/ui"
import { ArrowLeft, ScanLine } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { WmsSubnav } from "@/components/wms/wms-subnav"
import { printWmsLabelFromPdfResponse } from "@/lib/wms-shelf-label-print"

type ReceiptRow = { id: string; number: string; status: string }

function formatApiError(data: unknown, fallback: string): string {
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message?: unknown }).message
    if (typeof m === "string" && m.length) return m
  }
  if (data && typeof data === "object" && "code" in data) {
    const c = (data as { code?: unknown }).code
    if (typeof c === "string") {
      return `${c}: ${fallback}`
    }
  }
  return fallback
}

export default function WmsScanLabelPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [receipts, setReceipts] = useState<ReceiptRow[]>([])
  const [receiptId, setReceiptId] = useState<string>("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  const loadReceipts = useCallback(async () => {
    if (!token) return
    const res = await authFetch("/api/wms/v1/receipts", { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return
    const data = (await res.json().catch(() => ({}))) as unknown
    const list: unknown[] = Array.isArray(data) ? data : (data as { data?: unknown[] })?.data && Array.isArray((data as { data: unknown[] }).data) ? (data as { data: unknown[] }).data : []
    const rows: ReceiptRow[] = list.map((r) => {
      const o = r as Record<string, unknown>
      return {
        id: typeof o.id === "string" ? o.id : "",
        number: typeof o.number === "string" ? o.number : "—",
        status: typeof o.status === "string" ? o.status : "",
      }
    })
    setReceipts(rows.filter((r) => r.id))
  }, [token])

  useEffect(() => {
    void loadReceipts()
  }, [loadReceipts])

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 100)
    return () => window.clearTimeout(t)
  }, [busy, hint, err])

  const onSubmit = async () => {
    const raw = code.trim()
    if (!raw || !token) return
    setBusy(true)
    setErr(null)
    setHint(null)
    try {
      const res = await authFetch("/api/wms/v1/labeling/print", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ scan: raw, receiptId: receiptId.trim() || null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErr(formatApiError(data, "Не удалось сформировать этикетку. Проверьте GTIN, резерв, накладную."))
        return
      }
      await printWmsLabelFromPdfResponse(res)
      setHint("Печать PDF 40×27 мм отправлена (см. принтер/диалог ОС/локальный агент).")
      setCode("")
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Сбой печати")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto space-y-4 ps-0.5">
      <WmsSubnav />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" className="min-h-10 gap-1 px-0" asChild>
          <Link href="/dashboard/wms/sklad">
            <ArrowLeft className="h-4 w-4" />
            Склад
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-2">
            <ScanLine className="h-6 w-6 shrink-0 text-primary mt-0.5" aria-hidden />
            <div>
              <CardTitle className="text-lg">Скан → этикетка</CardTitle>
              <CardDescription className="mt-1">
                Один запрос <code className="text-xs bg-muted px-1 rounded">POST /labeling/print</code> на бэке: сопоставление
                (GTIN, внешние коды, арт., внутренняя 12-зн.) → очередь <strong>RESERVED</strong> → PDF. Заводской EAN: укажите
                <strong> GTIN</strong> в карточке или добавьте код через <code className="text-xs">…/items/…/external-barcodes</code>.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="scan">Скан (Enter после чтения)</Label>
            <Input
              id="scan"
              ref={inputRef}
              className="font-mono"
              value={code}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void onSubmit()
                }
              }}
              disabled={busy || !token}
              placeholder="EAN, арт., внутренний 12-зн."
            />
          </div>
          <div className="space-y-1">
            <Label>Опционально: накладная (очередь только в ней)</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={receiptId}
              onChange={(e) => setReceiptId(e.target.value)}
              disabled={!token}
            >
              <option value="">— все —</option>
              {receipts
                .filter((r) => r.status !== "CANCELLED" && r.status !== "CLOSED")
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.number} · {r.status}
                  </option>
                ))}
            </select>
          </div>
          {err ? <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2 whitespace-pre-wrap">{err}</p> : null}
          {hint && !err ? <p className="text-sm text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-md p-2">{hint}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onSubmit()} disabled={busy || !token || !code.trim()}>
              {busy ? "…" : "Печать"}
            </Button>
            {token ? null : <p className="text-sm text-muted-foreground w-full">Войдите в учётную запись.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
