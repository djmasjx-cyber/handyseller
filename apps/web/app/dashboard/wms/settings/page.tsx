"use client"

import { useCallback, useEffect, useState } from "react"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@handyseller/ui"
import { WmsSubnav } from "@/components/wms/wms-subnav"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

type WarehouseRecord = {
  id: string
  code: string
  name: string
  kind: "PHYSICAL" | "VIRTUAL"
  status: string
}

export default function WmsSettingsPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [name, setName] = useState("")
  const [kind, setKind] = useState<"PHYSICAL" | "VIRTUAL">("PHYSICAL")

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch("/api/wms/v1/warehouses", { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error("Не удалось загрузить склады.")
      const list = (await res.json()) as WarehouseRecord[]
      setWarehouses(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!success) return
    const t = window.setTimeout(() => setSuccess(null), 4000)
    return () => window.clearTimeout(t)
  }, [success])

  const createWarehouse = async () => {
    if (!token) return
    const c = code.trim()
    const n = name.trim()
    if (!c || !n) {
      setError("Укажите код и название склада.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await authFetch("/api/wms/v1/warehouses", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: c, name: n, kind }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data?.message === "string" ? data.message : "Не удалось создать склад")
        return
      }
      setSuccess("Склад создан.")
      setCode("")
      setName("")
      setKind("PHYSICAL")
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <WmsSubnav />

      <div>
        <h1 className="text-xl font-semibold tracking-tight">Настройки WMS</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Склады создаются здесь и становятся доступны в разделах «Склад» и «Операции». Общие настройки аккаунта — в пункте «Настройки» бокового меню
          дашборда.
        </p>
      </div>

      {success ? (
        <p className="text-sm font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{success}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-amber-950 bg-amber-50 border border-amber-200 rounded-md px-3 py-2" role="alert">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Новый склад</CardTitle>
          <CardDescription className="text-xs">Код — краткий идентификатор (латиница/цифры), название — как в интерфейсе.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 px-4 pt-0 pb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="wh-code">Код</Label>
              <Input id="wh-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="MSK-01" className="h-9" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wh-name">Название</Label>
              <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Основной склад" className="h-9" />
            </div>
          </div>
          <div className="space-y-1.5 max-w-xs">
            <Label>Тип</Label>
            <select
              id="wh-kind"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value === "VIRTUAL" ? "VIRTUAL" : "PHYSICAL")}
            >
              <option value="PHYSICAL">Физический</option>
              <option value="VIRTUAL">Виртуальный</option>
            </select>
          </div>
          <Button type="button" className="h-9" disabled={busy} onClick={() => void createWarehouse()}>
            {busy ? "Создаём…" : "Создать склад"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-base">Склады</CardTitle>
          <CardDescription className="text-xs">Список ваших складов WMS.</CardDescription>
        </CardHeader>
        <CardContent className="px-4 pt-0 pb-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Загрузка…</p>
          ) : warehouses.length ? (
            <ul className="space-y-2">
              {warehouses.map((w) => (
                <li key={w.id} className="rounded-lg border px-3 py-2 text-sm">
                  <span className="font-medium">{w.name}</span>
                  <span className="text-muted-foreground"> · {w.code}</span>
                  <span className="text-xs text-muted-foreground"> · {w.kind === "PHYSICAL" ? "физический" : "виртуальный"} · {w.status}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Пока нет ни одного склада — создайте первый выше.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
