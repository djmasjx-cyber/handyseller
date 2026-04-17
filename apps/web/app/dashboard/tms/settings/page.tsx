"use client"

import { useEffect, useState } from "react"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@handyseller/ui"
import { Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

type CarrierConnection = {
  id: string
  carrierCode: "MAJOR_EXPRESS"
  serviceType: "EXPRESS" | "LTL"
  accountLabel: string | null
  contractLabel: string | null
  loginPreview: string | null
  isDefault: boolean
  lastValidatedAt: string | null
  lastError: string | null
}

export default function TmsSettingsPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<CarrierConnection[]>([])
  const [accountLabel, setAccountLabel] = useState("")
  const [contractLabel, setContractLabel] = useState("")
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")

  const load = async () => {
    if (!token) return
    setLoading(true)
    const res = await authFetch("/api/tms/core/carrier-connections", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => [])
    setItems(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [token])

  const save = async () => {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const res = await authFetch("/api/tms/core/carrier-connections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          carrierCode: "MAJOR_EXPRESS",
          serviceType: "EXPRESS",
          accountLabel,
          contractLabel,
          login,
          password,
          isDefault: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.message ?? "Не удалось сохранить подключение")
      }
      setLogin("")
      setPassword("")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить подключение")
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const res = await authFetch(`/api/tms/core/carrier-connections/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        throw new Error("Не удалось удалить подключение")
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось удалить подключение")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Подключение Major Express</CardTitle>
          <CardDescription>
            Подключите свою учётку ТК один раз, и дальше пользователь будет получать тарифы и сроки по своему договору в пару кликов.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="accountLabel">Название учётки</Label>
            <Input id="accountLabel" value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} placeholder="Например, Основной договор" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contractLabel">Договор / комментарий</Label>
            <Input id="contractLabel" value={contractLabel} onChange={(e) => setContractLabel(e.target.value)} placeholder="Договор 2026/01" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login">Логин</Label>
            <Input id="login" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="Логин Major Express" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Пароль Major Express" />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <Button onClick={save} disabled={saving || !login || !password}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Сохранить и проверить
            </Button>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Подключенные учётки</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет подключенных учёток перевозчиков.</p>
          ) : items.map((item) => (
            <div key={item.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{item.accountLabel || "Major Express"}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.contractLabel || "Без названия договора"} · {item.loginPreview || "логин скрыт"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.isDefault ? <Badge>По умолчанию</Badge> : null}
                  <Badge variant="outline">{item.serviceType}</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {item.lastValidatedAt ? `Проверено: ${new Date(item.lastValidatedAt).toLocaleString("ru-RU")}` : "Ещё не проверялось"}
              </p>
              {item.lastError ? <p className="text-sm text-destructive">{item.lastError}</p> : null}
              <Button variant="outline" size="sm" onClick={() => remove(item.id)} disabled={saving}>
                Удалить
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
