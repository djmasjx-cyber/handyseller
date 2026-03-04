"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@handyseller/ui"
import {
  Bot,
  RefreshCw,
  CheckCircle,
  XCircle,
  Link as LinkIcon,
  Loader2,
  Zap,
  TrendingUp,
  CreditCard,
} from "lucide-react"
import Link from "next/link"
import { ConnectMarketplaceModal } from "@/components/connect-marketplace-modal"

type MarketplaceSlug = "wildberries" | "ozon" | "yandex" | "avito"

interface MarketplaceMeta {
  id: string
  name: string
  slug: MarketplaceSlug
  logo: string
  description: string
  supported: boolean
  instructions: string[]
  settingsUrl: string
  requiresSellerId?: boolean
  sellerIdLabel?: string
  requiresWarehouseId?: boolean
  warehouseIdLabel?: string
  /** Показать поле склада, но не требовать (для Ozon) */
  optionalWarehouseId?: boolean
  requiresStatsToken?: boolean
  statsTokenLabel?: string
  apiKeyLabel?: string
  apiKeyPlaceholder?: string
}

interface Connection {
  id: string
  marketplace: string
  createdAt: string
  updatedAt: string
  warehouseId?: string | null
}

const MARKETPLACES: MarketplaceMeta[] = [
  {
    id: "1",
    name: "Wildberries",
    slug: "wildberries",
    logo: "🟣",
    description: "Крупнейший маркетплейс России. Миллионы покупателей ежедневно.",
    supported: true,
    instructions: [
      "Перейдите в личный кабинет продавца Wildberries",
      "Откройте «Настройки» → «Доступ к API» — создайте основной токен",
      "Откройте «API» → «Статистика и Аналитика» — создайте доп. токен для заказов ФБО",
      "ID склада: ЛК WB → Маркетплейс → Мои склады. Остатки синхронизируются только с указанного склада.",
    ],
    settingsUrl: "https://seller.wildberries.ru/settings/access-token",
    requiresStatsToken: true,
    statsTokenLabel: "Токен «Статистика и Аналитика»",
    apiKeyLabel: "Основной токен",
    apiKeyPlaceholder: "Токен из раздела «Доступ к API»",
    optionalWarehouseId: true,
    warehouseIdLabel: "ID склада WB (остатки только с этого склада)",
  },
  {
    id: "2",
    name: "Ozon",
    slug: "ozon",
    logo: "🔷",
    description: "Второй по величине маркетплейс. Активно растущая аудитория.",
    supported: true,
    instructions: [
      "Войдите в личный кабинет продавца Ozon (seller.ozon.ru)",
      "Настройки → API-ключи → Seller API",
      "Client ID — числовой идентификатор (например 1234567). API Key — длинная строка, появляется после «Сгенерировать ключ»",
    ],
    settingsUrl: "https://seller.ozon.ru/app/settings/api-keys",
    requiresSellerId: true,
    sellerIdLabel: "Client ID (числовой)",
    apiKeyLabel: "API Key",
  },
  {
    id: "3",
    name: "Яндекс Маркет",
    slug: "yandex",
    logo: "🔴",
    description: "Маркетплейс от Яндекса. Интеграция с поиском и картами.",
    supported: true,
    instructions: [
      "Войдите в кабинет продавца Яндекс Маркета",
      "Нажмите на иконку аккаунта → «Настройки» → «API и модули»",
      "В блоке «Токены авторизации» нажмите «Создать новый токен» и скопируйте токен",
    ],
    settingsUrl: "https://partner.market.yandex.ru/",
    apiKeyLabel: "Токен авторизации",
    apiKeyPlaceholder: "Введите токен из кабинета Маркета",
  },
  {
    id: "4",
    name: "Avito",
    slug: "avito",
    logo: "🟢",
    description: "Крупнейшая доска объявлений. Идеально для хендмейда.",
    supported: true,
    instructions: [
      "Зарегистрируйте приложение в Avito для бизнеса",
      "Получите Client ID и Client Secret",
      "Client Secret введите в поле API ключ, Client ID — в поле выше",
    ],
    settingsUrl: "https://www.avito.ru/professionals/api",
    requiresSellerId: true,
    sellerIdLabel: "Client ID",
  },
]

const SLUG_TO_API: Record<string, string> = {
  wildberries: "WILDBERRIES",
  ozon: "OZON",
  yandex: "YANDEX",
  avito: "AVITO",
}

function formatDate(s: string) {
  try {
    const d = new Date(s)
    return d.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return ""
  }
}

export default function MarketplacesPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<"available" | "connected">("available")
  const [connections, setConnections] = useState<Connection[]>([])
  const [limits, setLimits] = useState<{ maxMarketplaces: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [modalMarketplace, setModalMarketplace] = useState<MarketplaceMeta | null>(null)
  const [ozonTest, setOzonTest] = useState<{ ok: boolean; message?: string; hasSellerId?: boolean } | null>(null)
  const [ozonWarehouseId, setOzonWarehouseId] = useState("")
  const [ozonWarehouseSaving, setOzonWarehouseSaving] = useState(false)
  const [ozonWarehouses, setOzonWarehouses] = useState<Array<{ warehouse_id: number; name?: string }> | null>(null)
  const [ozonWarehousesLoading, setOzonWarehousesLoading] = useState(false)
  const [wbWarehouseId, setWbWarehouseId] = useState("")
  const [wbWarehouseSaving, setWbWarehouseSaving] = useState(false)
  const [wbWarehouses, setWbWarehouses] = useState<Array<{ id: string; name?: string }> | null>(null)
  const [wbWarehousesLoading, setWbWarehousesLoading] = useState(false)
  const [wbColorsSyncing, setWbColorsSyncing] = useState(false)

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null

  useEffect(() => {
    if (!token) {
      router.push("/login")
      return
    }
    Promise.all([
      fetch("/api/marketplaces", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch("/api/subscriptions/me", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([marketplacesData, subData]) => {
        if (Array.isArray(marketplacesData)) setConnections(marketplacesData)
        if (subData?.limits) setLimits(subData.limits)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [router, token])

  const atMarketplaceLimit = limits ? connections.length >= limits.maxMarketplaces : false

  const isConnected = (slug: MarketplaceSlug) => {
    const apiSlug = SLUG_TO_API[slug]
    return apiSlug ? connections.some((c) => c.marketplace === apiSlug) : false
  }

  const getConnection = (slug: MarketplaceSlug) => {
    const apiSlug = SLUG_TO_API[slug]
    return connections.find((c) => c.marketplace === apiSlug)
  }

  useEffect(() => {
    const ozonConn = connections.find((c) => c.marketplace === "OZON") as { warehouseId?: string } | undefined
    if (ozonConn?.warehouseId) setOzonWarehouseId(ozonConn.warehouseId)
  }, [connections])

  useEffect(() => {
    const wbConn = connections.find((c) => c.marketplace === "WILDBERRIES") as { warehouseId?: string } | undefined
    if (wbConn?.warehouseId) setWbWarehouseId(wbConn.warehouseId)
  }, [connections])

  const handleOzonLoadWarehouses = async () => {
    if (!token) return
    setOzonWarehousesLoading(true)
    setOzonWarehouses(null)
    try {
      const res = await fetch("/api/marketplaces/ozon/warehouses", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Ошибка загрузки")
      setOzonWarehouses(Array.isArray(data) ? data : [])
    } catch (err) {
      setOzonWarehouses([])
      alert(err instanceof Error ? err.message : "Ошибка загрузки складов")
    } finally {
      setOzonWarehousesLoading(false)
    }
  }

  const handleOzonWarehouseSave = async () => {
    if (!token) return
    setOzonWarehouseSaving(true)
    try {
      const res = await fetch("/api/marketplaces/OZON/warehouse", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ warehouseId: ozonWarehouseId.trim() || undefined }),
      })
      if (!res.ok) throw new Error("Не удалось сохранить")
      setConnections((prev) =>
        prev.map((c) =>
          c.marketplace === "OZON" ? { ...c, warehouseId: ozonWarehouseId.trim() || null } : c
        )
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка")
    } finally {
      setOzonWarehouseSaving(false)
    }
  }

  const handleWbColorsSync = async () => {
    if (!token) return
    setWbColorsSyncing(true)
    try {
      const res = await fetch("/api/marketplaces/wb-colors/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Ошибка синхронизации")
      alert(`Синхронизировано цветов: ${data.synced ?? 0}`)
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка синхронизации цветов")
    } finally {
      setWbColorsSyncing(false)
    }
  }

  const handleWbLoadWarehouses = async () => {
    if (!token) return
    setWbWarehousesLoading(true)
    setWbWarehouses(null)
    try {
      const res = await fetch("/api/marketplaces/wb/warehouses", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message ?? data.error ?? "Ошибка загрузки")
      setWbWarehouses(Array.isArray(data) ? data : [])
    } catch (err) {
      setWbWarehouses([])
      alert(err instanceof Error ? err.message : "Ошибка загрузки складов")
    } finally {
      setWbWarehousesLoading(false)
    }
  }

  const handleWbWarehouseSave = async () => {
    if (!token) return
    setWbWarehouseSaving(true)
    try {
      const res = await fetch("/api/marketplaces/WILDBERRIES/warehouse", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ warehouseId: wbWarehouseId.trim() || undefined }),
      })
      if (!res.ok) throw new Error("Не удалось сохранить")
      setConnections((prev) =>
        prev.map((c) =>
          c.marketplace === "WILDBERRIES" ? { ...c, warehouseId: wbWarehouseId.trim() || null } : c
        )
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка")
    } finally {
      setWbWarehouseSaving(false)
    }
  }

  const handleConnect = async (
    apiKey: string,
    refreshToken?: string,
    sellerId?: string,
    warehouseId?: string,
    statsToken?: string
  ) => {
    if (!modalMarketplace || !token) return
    const apiSlug = SLUG_TO_API[modalMarketplace.slug]
    if (!apiSlug) return

    const res = await fetch("/api/marketplaces/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        marketplace: apiSlug,
        apiKey: apiKey,
        token: apiKey,
        refreshToken: refreshToken || undefined,
        sellerId: sellerId || undefined,
        warehouseId: warehouseId || undefined,
        statsToken: statsToken || undefined,
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      if (res.status === 401) {
        localStorage.removeItem("accessToken")
        router.push("/login")
        throw new Error("Сессия истекла. Войдите снова.")
      }
      throw new Error(data.message || data.error || "Ошибка подключения")
    }
    setConnections((prev) => {
      const filtered = prev.filter((c) => c.marketplace !== apiSlug)
      return [...filtered, { id: data.id, marketplace: apiSlug, createdAt: data.createdAt, updatedAt: data.updatedAt }]
    })
  }

  const handleOzonTest = async () => {
    if (!token) return
    setOzonTest(null)
    try {
      const res = await fetch("/api/marketplaces/ozon-test", { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json().catch(() => ({}))
      setOzonTest({
        ok: data.ok ?? false,
        message: data.message,
        hasSellerId: data.hasSellerId,
      })
    } catch {
      setOzonTest({ ok: false, message: "Ошибка запроса" })
    }
  }

  const handleDisconnect = async (slug: MarketplaceSlug) => {
    const meta = MARKETPLACES.find((m) => m.slug === slug)
    if (!meta || !confirm(`Отключить ${meta.name}? Все товары перестанут выгружаться на эту площадку.`)) return

    const apiSlug = SLUG_TO_API[slug]
    if (!apiSlug || !token) return

    try {
      const res = await fetch(`/api/marketplaces/${apiSlug}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || data.error || "Ошибка отключения")
      }
      setConnections((prev) => prev.filter((c) => c.marketplace !== apiSlug))
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка отключения")
    }
  }

  const connectedList = MARKETPLACES.filter((m) => isConnected(m.slug))

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Маркетплейсы</h1>
          <p className="text-muted-foreground">
            Подключите площадки для продажи ваших изделий
            {limits && (
              <span className="ml-1">
                • {connections.length} / {limits.maxMarketplaces >= 99 ? "∞" : limits.maxMarketplaces} подключено
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" disabled>
          <RefreshCw className="mr-2 h-4 w-4" />
          Синхронизировать все
        </Button>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3">
        <Bot className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-sm text-muted-foreground">
          После подключения товары будут автоматически выгружаться на выбранные площадки.
          Синхронизация происходит каждые 15 минут.
        </p>
      </div>

      {atMarketplaceLimit && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm flex items-center gap-2">
          <CreditCard className="h-5 w-5 shrink-0" />
          <span>Достигнут лимит маркетплейсов по вашему тарифу.</span>
          <Link href="/dashboard/subscription" className="text-primary font-medium hover:underline">
            Перейти на другой план
          </Link>
        </div>
      )}

      {/* Вкладки — кнопки */}
      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={activeTab === "available" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("available")}
        >
          Доступные
        </Button>
        <Button
          variant={activeTab === "connected" ? "default" : "ghost"}
          size="sm"
          onClick={() => setActiveTab("connected")}
        >
          Подключенные ({connectedList.length})
        </Button>
      </div>

      {activeTab === "available" && (
        <div className="grid gap-6 md:grid-cols-2">
          {MARKETPLACES.map((marketplace) => {
            const connected = isConnected(marketplace.slug)
            const conn = getConnection(marketplace.slug)

            return (
              <Card key={marketplace.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-2xl">
                        {marketplace.logo}
                      </div>
                      <div>
                        <CardTitle className="text-xl">{marketplace.name}</CardTitle>
                        <CardDescription>{marketplace.description}</CardDescription>
                      </div>
                    </div>
                    {connected && (
                      <Badge variant="secondary">
                        <CheckCircle className="mr-1 h-3 w-3 text-green-500" />
                        Подключено
                      </Badge>
                    )}
                    {!marketplace.supported && (
                      <Badge variant="outline">Скоро</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="pt-4 border-t">
                    {connected ? (
                      <div className="space-y-3">
                        {conn?.updatedAt && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Обновлено:</span>
                            <span className="font-medium">{formatDate(conn.updatedAt)}</span>
                          </div>
                        )}
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => handleDisconnect(marketplace.slug)}
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Отключить
                        </Button>
                      </div>
                    ) : marketplace.supported ? (
                      <Button
                        className="w-full"
                        disabled={atMarketplaceLimit}
                        onClick={() => {
                          if (atMarketplaceLimit) {
                            alert("Достигнут лимит маркетплейсов по вашему тарифу. Перейдите в раздел «Подписка» для смены плана.")
                            return
                          }
                          setModalMarketplace(marketplace)
                        }}
                        title={atMarketplaceLimit ? "Достигнут лимит. Перейдите в «Подписка»" : undefined}
                      >
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Подключить
                      </Button>
                    ) : (
                      <Button className="w-full" disabled>
                        Скоро
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {activeTab === "connected" && (
        <div className="grid gap-6 md:grid-cols-2">
          {connectedList.map((marketplace) => {
            const conn = getConnection(marketplace.slug)
            return (
              <Card key={marketplace.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-2xl">
                        {marketplace.logo}
                      </div>
                      <div>
                        <CardTitle className="text-xl">{marketplace.name}</CardTitle>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary">
                            <CheckCircle className="mr-1 h-3 w-3 text-green-500" />
                            Активен
                          </Badge>
                          {conn?.updatedAt && (
                            <span className="text-xs text-muted-foreground">
                              Обновлено: {formatDate(conn.updatedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {marketplace.slug === "wildberries" && (
                    <div className="space-y-3">
                      {!wbWarehouseId && (
                        <div className="rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3 text-sm">
                          ⚠️ Укажите ID склада — остатки будут синхронизироваться только с этого склада WB. ЛК WB → Маркетплейс → Мои склады.
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex-1 min-w-[140px]">
                          <label className="text-xs text-muted-foreground block mb-1">ID склада WB (остатки только с этого склада)</label>
                          <input
                            type="text"
                            placeholder="1526287"
                            value={wbWarehouseId}
                            onChange={(e) => setWbWarehouseId(e.target.value)}
                            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleWbWarehouseSave}
                          disabled={wbWarehouseSaving}
                          className="border-[#CB11AB] text-[#CB11AB] hover:bg-[#CB11AB]/10"
                        >
                          {wbWarehouseSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleWbLoadWarehouses}
                          disabled={wbWarehousesLoading}
                          className="border-[#CB11AB] text-[#CB11AB] hover:bg-[#CB11AB]/10"
                        >
                          {wbWarehousesLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Загрузить склады
                        </Button>
                        {wbWarehouses !== null && (
                          <div className="rounded-lg border border-input p-2 text-sm max-h-32 overflow-y-auto">
                            {wbWarehouses.length === 0 ? (
                              <p className="text-muted-foreground">Склады не найдены</p>
                            ) : (
                              <ul className="space-y-1">
                                {wbWarehouses.map((w) => (
                                  <li key={w.id} className="flex justify-between gap-2">
                                    <span>{w.name || `Склад ${w.id}`}</span>
                                    <button
                                      type="button"
                                      onClick={() => setWbWarehouseId(w.id)}
                                      className="text-[#CB11AB] hover:underline font-mono text-xs"
                                    >
                                      ID {w.id}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleWbColorsSync}
                          disabled={wbColorsSyncing}
                          className="border-[#CB11AB] text-[#CB11AB] hover:bg-[#CB11AB]/10"
                        >
                          {wbColorsSyncing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Синхронизировать цвета WB
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Справочник цветов для выпадающего списка при создании/редактировании товара.
                        </p>
                      </div>
                    </div>
                  )}
                  {marketplace.slug === "ozon" && (
                    <div className="space-y-3">
                      {!ozonWarehouseId && (
                        <div className="rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 p-3 text-sm">
                          ⚠️ Укажите ID склада — без него остатки на Ozon не обновляются. Нажмите «Загрузить склады» и выберите склад.
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex-1 min-w-[140px]">
                          <label className="text-xs text-muted-foreground block mb-1">ID склада (для остатков)</label>
                          <input
                            type="text"
                            placeholder="1234567"
                            value={ozonWarehouseId}
                            onChange={(e) => setOzonWarehouseId(e.target.value)}
                            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleOzonWarehouseSave}
                          disabled={ozonWarehouseSaving}
                          className="border-[#005BFF] text-[#005BFF] hover:bg-[#005BFF]/10"
                        >
                          {ozonWarehouseSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleOzonLoadWarehouses}
                          disabled={ozonWarehousesLoading}
                          className="border-[#005BFF] text-[#005BFF] hover:bg-[#005BFF]/10"
                        >
                          {ozonWarehousesLoading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-4 w-4" />
                          )}
                          Загрузить склады
                        </Button>
                        {ozonWarehouses !== null && (
                          <div className="rounded-lg border border-input p-2 text-sm max-h-32 overflow-y-auto">
                            {ozonWarehouses.length === 0 ? (
                              <p className="text-muted-foreground">Склады не найдены</p>
                            ) : (
                              <ul className="space-y-1">
                                {ozonWarehouses.map((w) => (
                                  <li key={w.warehouse_id} className="flex justify-between gap-2">
                                    <span>{w.name || `Склад ${w.warehouse_id}`}</span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOzonWarehouseId(String(w.warehouse_id))
                                      }}
                                      className="text-[#005BFF] hover:underline font-mono text-xs"
                                    >
                                      ID {w.warehouse_id}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleOzonTest}
                        className="border-[#005BFF] text-[#005BFF] hover:bg-[#005BFF]/10"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Проверить подключение
                      </Button>
                      {ozonTest && (
                        <div
                          className={`rounded-lg p-2 text-sm ${ozonTest.ok ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}
                        >
                          {ozonTest.ok ? "✓ " : "✗ "}
                          {ozonTest.message}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-primary">—</div>
                      <div className="text-xs text-muted-foreground">товара</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-green-500">—</div>
                      <div className="text-xs text-muted-foreground">₽ продаж</div>
                    </div>
                    <div className="text-center p-3 bg-muted rounded-lg">
                      <div className="text-2xl font-bold text-blue-500">—</div>
                      <div className="text-xs text-muted-foreground">заказов</div>
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t">
                    <Button variant="outline" className="w-full justify-between" disabled>
                      <span>Настроить синхронизацию</span>
                      <Zap className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" className="w-full justify-between" disabled>
                      <span>Статистика продаж</span>
                      <TrendingUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => handleDisconnect(marketplace.slug)}
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Отключить площадку
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {connectedList.length === 0 && (
            <div className="md:col-span-2 text-center py-12">
              <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <LinkIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-xl font-medium mb-2">Нет подключенных площадок</h3>
              <p className="text-muted-foreground mb-4 max-w-md mx-auto">
                Подключите хотя бы один маркетплейс, чтобы начать продавать свои изделия.
              </p>
              <Button onClick={() => setActiveTab("available")}>
                <LinkIcon className="mr-2 h-4 w-4" />
                Подключить маркетплейс
              </Button>
            </div>
          )}
        </div>
      )}

      {modalMarketplace && (
        <ConnectMarketplaceModal
          open={!!modalMarketplace}
          onOpenChange={(open) => !open && setModalMarketplace(null)}
          marketplace={{
            name: modalMarketplace.name,
            slug: modalMarketplace.slug,
            logo: modalMarketplace.logo,
            instructions: modalMarketplace.instructions,
            settingsUrl: modalMarketplace.settingsUrl,
            requiresSellerId: modalMarketplace.requiresSellerId,
            sellerIdLabel: modalMarketplace.sellerIdLabel,
            requiresWarehouseId: modalMarketplace.requiresWarehouseId,
            optionalWarehouseId: modalMarketplace.optionalWarehouseId,
            warehouseIdLabel: modalMarketplace.warehouseIdLabel,
            requiresStatsToken: modalMarketplace.requiresStatsToken,
            statsTokenLabel: modalMarketplace.statsTokenLabel,
            apiKeyLabel: modalMarketplace.apiKeyLabel,
            apiKeyPlaceholder: modalMarketplace.apiKeyPlaceholder,
          }}
          onConnect={handleConnect}
        />
      )}
    </div>
  )
}
