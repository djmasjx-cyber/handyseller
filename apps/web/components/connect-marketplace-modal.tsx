"use client"

import { useState } from "react"
import { Button, Input, Label } from "@handyseller/ui"
import { Info, ShieldCheck, Loader2 } from "lucide-react"

interface ConnectMarketplaceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  marketplace: {
    name: string
    slug: string
    logo: string
    instructions: string[]
    settingsUrl: string
    requiresSellerId?: boolean
    sellerIdLabel?: string
    requiresWarehouseId?: boolean
    optionalWarehouseId?: boolean
    warehouseIdLabel?: string
    requiresStatsToken?: boolean
    statsTokenLabel?: string
    apiKeyLabel?: string
    apiKeyPlaceholder?: string
  }
  onConnect: (
    apiKey: string,
    refreshToken?: string,
    sellerId?: string,
    warehouseId?: string,
    statsToken?: string
  ) => Promise<void>
}

export function ConnectMarketplaceModal({
  open,
  onOpenChange,
  marketplace,
  onConnect,
}: ConnectMarketplaceModalProps) {
  const [step, setStep] = useState(1)
  const [apiKey, setApiKey] = useState("")
  const [sellerId, setSellerId] = useState("")
  const [warehouseId, setWarehouseId] = useState("")
  const [statsToken, setStatsToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = async () => {
    setLoading(true)
    setError(null)

    if (!apiKey.trim()) {
      setError(`Пожалуйста, введите ${marketplace.apiKeyLabel?.toLowerCase() ?? "API ключ"}`)
      setLoading(false)
      return
    }
    if (marketplace.requiresSellerId && !sellerId.trim()) {
      setError(`Пожалуйста, введите ${marketplace.sellerIdLabel ?? "ID"}`)
      setLoading(false)
      return
    }
    if (marketplace.requiresWarehouseId && !marketplace.optionalWarehouseId && !warehouseId.trim()) {
      setError(`Пожалуйста, введите ${marketplace.warehouseIdLabel ?? "ID склада"}`)
      setLoading(false)
      return
    }
    if (marketplace.requiresStatsToken && !statsToken.trim()) {
      setError(`Пожалуйста, введите ${marketplace.statsTokenLabel ?? "токен статистики"}`)
      setLoading(false)
      return
    }

    try {
      await onConnect(
        apiKey.trim(),
        undefined,
        sellerId.trim() || undefined,
        warehouseId.trim() || undefined,
        marketplace.requiresStatsToken ? statsToken.trim() : undefined
      )
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось подключиться. Проверьте API ключ.")
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setStep(1)
    setApiKey("")
    setSellerId("")
    setWarehouseId("")
    setStatsToken("")
    setError(null)
    onOpenChange(false)
  }

  if (!open) return null

  if (step === 2) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="fixed inset-0 bg-black/50" onClick={handleClose} />
        <div className="relative z-10 w-full max-w-md rounded-lg border bg-background p-6 shadow-lg">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <ShieldCheck className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-center text-lg font-semibold">Успешно подключено!</h2>
          <p className="text-center text-sm text-muted-foreground">
            {marketplace.name} теперь активен. Ваши товары будут автоматически выгружаться на эту
            площадку.
          </p>
          <div className="mt-4 space-y-4 rounded-lg bg-muted p-4">
            <p className="text-sm font-medium">Что дальше?</p>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Добавьте товары в каталог</li>
              <li>• Настройте цены и остатки</li>
              <li>• Отслеживайте заказы в разделе «Заказы»</li>
            </ul>
          </div>
          <Button className="mt-4 w-full" onClick={handleClose}>
            Готово
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border bg-background p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-2xl">
            {marketplace.logo}
          </div>
          <div>
            <h2 className="font-semibold">Подключение {marketplace.name}</h2>
            <p className="text-sm text-muted-foreground">
              Следуйте инструкциям для получения API ключа
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-500" />
              Инструкция по подключению
            </Label>
            <div className="space-y-2">
              {marketplace.instructions.map((instruction, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {index + 1}
                  </div>
                  <p className="text-sm">{instruction}</p>
                </div>
              ))}
            </div>
          </div>

          {marketplace.requiresSellerId && (
            <div className="space-y-2">
              <Label htmlFor="sellerId">{marketplace.sellerIdLabel ?? "Client ID / Seller ID"}</Label>
              <Input
                id="sellerId"
                placeholder={marketplace.sellerIdLabel ?? "Client ID"}
                value={sellerId}
                onChange={(e) => setSellerId(e.target.value)}
              />
            </div>
          )}

          {(marketplace.requiresWarehouseId || marketplace.optionalWarehouseId) && (
            <div className="space-y-2">
              <Label htmlFor="warehouseId">{marketplace.warehouseIdLabel ?? "ID склада"}</Label>
              <Input
                id="warehouseId"
                placeholder={marketplace.slug === "ozon" ? "Например: 1234567 (ЛК Ozon → Склад)" : "Например: 1526287 (ЛК WB → Маркетплейс → Мои склады)"}
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="apiKey">
              {marketplace.apiKeyLabel ?? (marketplace.slug === "avito" ? "Client Secret" : "Основной токен")}
            </Label>
            <Input
              id="apiKey"
              type="password"
              placeholder={marketplace.apiKeyPlaceholder ?? "Введите API ключ"}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setError(null)
              }}
              className="font-mono"
            />
          </div>

          {marketplace.requiresStatsToken && (
            <div className="space-y-2">
              <Label htmlFor="statsToken">{marketplace.statsTokenLabel ?? "Токен «Статистика и Аналитика»"}</Label>
              <Input
                id="statsToken"
                type="password"
                placeholder="ЛК WB → API → Статистика и Аналитика (для заказов ФБО)"
                value={statsToken}
                onChange={(e) => {
                  setStatsToken(e.target.value)
                  setError(null)
                }}
                className="font-mono"
              />
            </div>
          )}

          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="text-xs">
                <p className="font-medium">Безопасность</p>
                <p className="text-muted-foreground">
                  Ваш API ключ шифруется перед сохранением в базе данных. Мы никогда не передаём
                  его третьим лицам.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleConnect}
            disabled={
              loading ||
              !apiKey.trim() ||
              (marketplace.requiresStatsToken && !statsToken.trim()) ||
              (marketplace.requiresWarehouseId && !marketplace.optionalWarehouseId && !warehouseId.trim()) ||
              (marketplace.requiresSellerId && !sellerId.trim())
            }
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Подключение...
              </>
            ) : (
              <>
                <ShieldCheck className="mr-2 h-4 w-4" />
                Подключить {marketplace.name}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
