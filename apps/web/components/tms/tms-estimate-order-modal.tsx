"use client"

import { useState } from "react"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from "@handyseller/ui"
import { Loader2, X } from "lucide-react"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { AddressSuggestInput } from "./address-suggest-input"

type Props = {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

export function TmsEstimateOrderModal({ open, onClose, onCreated }: Props) {
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [origin, setOrigin] = useState("")
  const [destination, setDestination] = useState("")
  const [weightKg, setWeightKg] = useState("1")
  const [lengthCm, setLengthCm] = useState("10")
  const [widthCm, setWidthCm] = useState("10")
  const [heightCm, setHeightCm] = useState("10")
  const [places, setPlaces] = useState("1")
  const [declaredValue, setDeclaredValue] = useState("1000")

  const reset = () => {
    setError(null)
    setOrigin("")
    setDestination("")
    setWeightKg("1")
    setLengthCm("10")
    setWidthCm("10")
    setHeightCm("10")
    setPlaces("1")
    setDeclaredValue("1000")
  }

  const submit = async () => {
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      const w = Number(weightKg.replace(",", "."))
      const l = Number(lengthCm.replace(",", "."))
      const wi = Number(widthCm.replace(",", "."))
      const h = Number(heightCm.replace(",", "."))
      const p = Math.max(1, Math.floor(Number(places) || 1))
      const dv = Number(declaredValue.replace(",", "."))

      const res = await authFetch("/api/tms/core/orders/tms-estimate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          originAddress: origin.trim(),
          destinationAddress: destination.trim(),
          weightKg: w,
          lengthCm: l,
          widthCm: wi,
          heightCm: h,
          places: p,
          declaredValueRub: dv,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof data?.message === "string"
            ? data.message
            : Array.isArray(data?.message)
              ? data.message.join("; ")
              : "Не удалось создать заказ"
        throw new Error(msg)
      }
      reset()
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения")
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tms-estimate-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        aria-label="Закрыть"
        onClick={() => {
          onClose()
          setError(null)
        }}
      />
      <Card className="relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl border-border/80">
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
          <div>
            <CardTitle id="tms-estimate-title">Заказ для оценки доставки</CardTitle>
            <CardDescription className="mt-1">
              Ручной заказ для расчёта тарифов в ТК (Major, Деловые Линии и др.). Адреса — как в калькуляторах перевозчиков.
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => {
              onClose()
              setError(null)
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <AddressSuggestInput
            label="Откуда (отправление) *"
            value={origin}
            onChange={setOrigin}
            placeholder="Например: Москва, ул. …"
            required
            hint="Начните вводить адрес — при наличии DADATA появятся подсказки."
          />
          <AddressSuggestInput
            label="Куда (доставка) *"
            value={destination}
            onChange={setDestination}
            placeholder="Например: Санкт-Петербург, пр. …"
            required
          />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="wkg">Вес, кг *</Label>
              <Input
                id="wkg"
                inputMode="decimal"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lcm">Длина, см *</Label>
              <Input id="lcm" inputMode="decimal" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wicm">Ширина, см *</Label>
              <Input id="wicm" inputMode="decimal" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hcm">Высота, см *</Label>
              <Input id="hcm" inputMode="decimal" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="places">Мест, шт</Label>
              <Input id="places" inputMode="numeric" value={places} onChange={(e) => setPlaces(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="declared">Объявл. ценность, ₽ *</Label>
              <Input
                id="declared"
                inputMode="decimal"
                value={declaredValue}
                onChange={(e) => setDeclaredValue(e.target.value)}
                required
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Обязательные поля: оба адреса, вес, три габарита, объявленная ценность. После создания откройте{" "}
            <span className="font-medium">TMS</span> и нажмите «Получить варианты» по этому заказу.
          </p>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onClose()
                setError(null)
              }}
            >
              Отмена
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={
                saving ||
                !origin.trim() ||
                !destination.trim() ||
                !weightKg.trim() ||
                !lengthCm.trim() ||
                !widthCm.trim() ||
                !heightCm.trim() ||
                !declaredValue.trim()
              }
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Создать и перейти к расчёту
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
