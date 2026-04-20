"use client"

import { useEffect, useState } from "react"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@handyseller/ui"
import { Loader2 } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

function formatApiError(data: unknown): string {
  if (!data || typeof data !== "object") return "Не удалось сохранить подключение"
  const o = data as Record<string, unknown>
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim()
  if (Array.isArray(o.message) && o.message.length)
    return o.message.map((x) => String(x)).join("; ")
  if (typeof o.error === "string" && o.error.trim()) return o.error.trim()
  return "Не удалось сохранить подключение"
}

type CarrierConnection = {
  id: string
  carrierCode: "MAJOR_EXPRESS" | "DELLIN" | "CDEK"
  serviceType: "EXPRESS" | "LTL"
  accountLabel: string | null
  contractLabel: string | null
  loginPreview: string | null
  isDefault: boolean
  lastValidatedAt: string | null
  lastError: string | null
}

type TmsIntegrationClient = {
  id: string
  publicId: string
  label: string | null
  scopes: string[]
  revokedAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

export default function TmsSettingsPage() {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<CarrierConnection[]>([])
  const [accountLabel, setAccountLabel] = useState("")
  const [contractLabel, setContractLabel] = useState("")
  const [carrierCode, setCarrierCode] = useState<"MAJOR_EXPRESS" | "DELLIN" | "CDEK">("MAJOR_EXPRESS")
  const [login, setLogin] = useState("")
  const [password, setPassword] = useState("")
  const [appKey, setAppKey] = useState("")
  const [m2mItems, setM2mItems] = useState<TmsIntegrationClient[]>([])
  const [m2mLabel, setM2mLabel] = useState("")
  const [m2mSecretOnce, setM2mSecretOnce] = useState<string | null>(null)
  const [credentialsFormVersion, setCredentialsFormVersion] = useState(0)
  const [checkingAll, setCheckingAll] = useState(false)
  const [checkingById, setCheckingById] = useState<Record<string, boolean>>({})
  const activeConnections = items.filter((item) => !item.lastError).length
  const problematicConnections = items.filter((item) => Boolean(item.lastError)).length

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

  const loadM2m = async () => {
    if (!token) return
    const res = await authFetch("/api/tms/integration-clients", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => [])
    setM2mItems(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    load()
    loadM2m()
  }, [token])

  const createM2m = async () => {
    if (!token) return
    setSaving(true)
    setError(null)
    setM2mSecretOnce(null)
    try {
      const res = await authFetch("/api/tms/integration-clients", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ label: m2mLabel.trim() || undefined }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(formatApiError(data))
      if (typeof data.client_secret === "string") setM2mSecretOnce(data.client_secret)
      setM2mLabel("")
      await loadM2m()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать клиента API")
    } finally {
      setSaving(false)
    }
  }

  const revokeM2m = async (id: string) => {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const res = await authFetch(`/api/tms/integration-clients/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(formatApiError(data))
      }
      await loadM2m()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось отозвать доступ")
    } finally {
      setSaving(false)
    }
  }

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
          carrierCode,
          serviceType: "EXPRESS",
          accountLabel,
          contractLabel,
          ...(carrierCode === "DELLIN" && appKey.trim() ? { appKey: appKey.trim() } : {}),
          login,
          password,
          isDefault: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(formatApiError(data))
      }
      setAccountLabel("")
      setContractLabel("")
      setLogin("")
      setPassword("")
      setAppKey("")
      setCredentialsFormVersion((v) => v + 1)
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

  const checkConnection = async (id: string) => {
    if (!token) return
    setError(null)
    setCheckingById((prev) => ({ ...prev, [id]: true }))
    try {
      const res = await authFetch(`/api/tms/core/carrier-connections/${id}/check`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(formatApiError(data))
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось проверить подключение")
    } finally {
      setCheckingById((prev) => ({ ...prev, [id]: false }))
    }
  }

  const checkAllConnections = async () => {
    if (!token) return
    setError(null)
    setCheckingAll(true)
    try {
      const res = await authFetch("/api/tms/core/carrier-connections/check-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(formatApiError(data))
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось проверить подключения")
    } finally {
      setCheckingAll(false)
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
          <CardTitle>Подключение перевозчика</CardTitle>
          <CardDescription>
            Подключите учётку ТК один раз, и дальше пользователь будет получать тарифы и сроки по своему договору в пару кликов.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="carrierCode">Перевозчик</Label>
            <select
              id="carrierCode"
              value={carrierCode}
              onChange={(e) => {
                setCarrierCode(e.target.value as "MAJOR_EXPRESS" | "DELLIN" | "CDEK")
                setAppKey("")
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="MAJOR_EXPRESS">Major Express</option>
              <option value="DELLIN">Деловые Линии</option>
              <option value="CDEK">CDEK</option>
            </select>
          </div>
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
            <Input
              key={`login-${credentialsFormVersion}`}
              id="login"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="off"
              placeholder={
                carrierCode === "DELLIN"
                  ? "Телефон или логин из ЛК Деловых Линий"
                  : carrierCode === "CDEK"
                    ? "client_id CDEK API"
                    : "Логин Major Express"
              }
            />
            {carrierCode === "CDEK" ? (
              <p className="text-xs text-muted-foreground">Для CDEK укажите `client_id` API.</p>
            ) : null}
          </div>
          {carrierCode === "DELLIN" ? (
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="appKey">Ключ приложения (appKey)</Label>
              <Input
              key={`appkey-${credentialsFormVersion}`}
                id="appKey"
                value={appKey}
                onChange={(e) => setAppKey(e.target.value)}
                placeholder="Из раздела «Интеграция» в личном кабинете Деловых Линий"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Ключ привязан к вашему договору с Деловыми Линиями и хранится в HandySeller в зашифрованном виде.
              </p>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              key={`password-${credentialsFormVersion}`}
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder={
                carrierCode === "DELLIN"
                  ? "Пароль от ЛК Деловых Линий"
                  : carrierCode === "CDEK"
                    ? "client_secret CDEK API"
                    : "Пароль Major Express"
              }
            />
            {carrierCode === "CDEK" ? (
              <p className="text-xs text-muted-foreground">Для CDEK укажите `client_secret` API.</p>
            ) : null}
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
          <CardTitle>Внешние системы (API TMS)</CardTitle>
          <CardDescription>
            Для ERP, WMS и собственных сервисов: OAuth2 client credentials, короткоживущие токены, секрет хранится
            только в виде хэша. Подробности — в{" "}
            <a className="underline" href="/api/tms/openapi.yaml" target="_blank" rel="noreferrer">
              OpenAPI (YAML)
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {m2mSecretOnce ? (
            <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-100">Сохраните client_secret сейчас</p>
              <p className="mt-1 break-all font-mono text-xs">{m2mSecretOnce}</p>
              <p className="mt-2 text-muted-foreground">Он больше не будет показан.</p>
            </div>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2 min-w-[200px] flex-1">
              <Label htmlFor="m2mLabel">Название интеграции</Label>
              <Input
                id="m2mLabel"
                value={m2mLabel}
                onChange={(e) => setM2mLabel(e.target.value)}
                placeholder="Например, ERP МойСклад"
              />
            </div>
            <Button type="button" onClick={createM2m} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Создать клиента"}
            </Button>
          </div>
          <div className="space-y-2">
            {m2mItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Пока нет зарегистрированных API-клиентов.</p>
            ) : (
              m2mItems.map((c) => (
                <div key={c.id} className="rounded-lg border p-3 flex flex-wrap justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium">{c.label || "Без названия"}</p>
                    <p className="text-muted-foreground font-mono text-xs">client_id: {c.publicId}</p>
                    <p className="text-xs text-muted-foreground">scopes: {c.scopes.join(", ")}</p>
                    {c.revokedAt ? (
                      <p className="text-xs text-destructive">Отозван: {new Date(c.revokedAt).toLocaleString("ru-RU")}</p>
                    ) : c.lastUsedAt ? (
                      <p className="text-xs text-muted-foreground">
                        Последний обмен токена: {new Date(c.lastUsedAt).toLocaleString("ru-RU")}
                      </p>
                    ) : null}
                  </div>
                  {!c.revokedAt ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => revokeM2m(c.id)} disabled={saving}>
                      Отозвать
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Подключенные учётки</CardTitle>
          <CardDescription>
            Статус активности рассчитывается по последней проверке: если есть ошибка, подключение требует внимания.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Button variant="outline" onClick={checkAllConnections} disabled={checkingAll || saving || loading}>
              {checkingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Проверить все подключения
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Всего: {items.length}</Badge>
            <Badge className="bg-emerald-600 hover:bg-emerald-600">Активно: {activeConnections}</Badge>
            {problematicConnections > 0 ? (
              <Badge variant="destructive">Проблем: {problematicConnections}</Badge>
            ) : (
              <Badge variant="secondary">Проблем нет</Badge>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Пока нет подключенных учёток перевозчиков.</p>
          ) : items.map((item) => (
            <div key={item.id} className="rounded-lg border p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{item.accountLabel || (item.carrierCode === "DELLIN" ? "Деловые Линии" : item.carrierCode === "CDEK" ? "CDEK" : "Major Express")}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.contractLabel || "Без названия договора"} · {item.loginPreview || "логин скрыт"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.isDefault ? <Badge>По умолчанию</Badge> : null}
                  <Badge variant="outline">{item.serviceType}</Badge>
                  {item.lastError ? (
                    <Badge variant="destructive">Требует внимания</Badge>
                  ) : (
                    <Badge className="bg-emerald-600 hover:bg-emerald-600">Активно</Badge>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {item.lastValidatedAt ? `Проверено: ${new Date(item.lastValidatedAt).toLocaleString("ru-RU")}` : "Ещё не проверялось"}
              </p>
              {item.lastError ? <p className="text-sm text-destructive">{item.lastError}</p> : null}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkConnection(item.id)}
                  disabled={saving || checkingById[item.id]}
                >
                  {checkingById[item.id] ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Проверить
                </Button>
                <Button variant="outline" size="sm" onClick={() => remove(item.id)} disabled={saving}>
                  Удалить
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
