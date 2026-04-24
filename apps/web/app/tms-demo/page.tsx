"use client"

import { useMemo, useState } from "react"

type DeliveryOption = {
  quoteId: string
  carrierId: string
  carrierName: string
  priceRub?: number
  totalPriceRub?: number
  etaDays: number
  notes?: string
}

type EstimateResponse = {
  externalOrderId: string
  shipmentRequestId: string
  options: DeliveryOption[]
  requestPayload?: unknown
}

type ConfirmResponse = {
  shipment?: {
    id: string
    carrierName: string
    carrierOrderNumber?: string
    carrierOrderReference?: string
    trackingNumber: string
    status: string
  }
  documents?: unknown
  events?: unknown
  lookup?: unknown
}

const demoItem = {
  productId: "demo-rc-car",
  title: "Радиоуправляемый мост Reno Hobby RH631",
  quantity: 1,
  priceRub: 6070,
  weightGrams: 1500,
}

function money(value: number | undefined) {
  if (value == null) return "цена не указана"
  return `${Math.round(value).toLocaleString("ru-RU")} руб.`
}

export default function TmsDemoPage() {
  const [name, setName] = useState("Иван Иванов")
  const [phone, setPhone] = useState("+7 948 356-79-00")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("Московская обл, г Химки, деревня Елино")
  const [externalOrderId, setExternalOrderId] = useState(`DEMO-SITE-${Date.now()}`)
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null)
  const [selectedQuoteId, setSelectedQuoteId] = useState("")
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null)
  const [allowRealBooking, setAllowRealBooking] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkoutPayload = useMemo(
    () => ({
      externalOrderId,
      customer: { name, phone, email: email || undefined, address },
      cart: {
        items: [demoItem],
        declaredValueRub: demoItem.priceRub,
        weightGrams: demoItem.weightGrams,
        widthMm: 200,
        lengthMm: 300,
        heightMm: 150,
      },
    }),
    [address, email, externalOrderId, name, phone],
  )

  const selectedOption = estimate?.options.find((option) => option.quoteId === selectedQuoteId)

  async function postJson<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.message || data?.details?.message || `HTTP ${res.status}`)
    return data as T
  }

  async function estimateDelivery() {
    setLoading("estimate")
    setError(null)
    setConfirmResult(null)
    try {
      const data = await postJson<EstimateResponse>("/api/tms-demo/estimate", checkoutPayload)
      setEstimate(data)
      setSelectedQuoteId(data.options[0]?.quoteId ?? "")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось рассчитать доставку")
    } finally {
      setLoading(null)
    }
  }

  async function confirmBooking() {
    if (!estimate || !selectedQuoteId) return
    setLoading("confirm")
    setError(null)
    try {
      await postJson("/api/tms-demo/select", { requestId: estimate.shipmentRequestId, quoteId: selectedQuoteId })
      const data = await postJson<ConfirmResponse>("/api/tms-demo/confirm", {
        requestId: estimate.shipmentRequestId,
        externalOrderId: estimate.externalOrderId,
        allowRealBooking,
      })
      setConfirmResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось оформить заказ у перевозчика")
    } finally {
      setLoading(null)
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 text-slate-950">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="text-sm font-semibold uppercase tracking-wide text-rose-600">HandySeller Partner API demo</p>
          <h1 className="mt-2 text-3xl font-bold">Временный checkout-сайт клиента</h1>
          <p className="mt-3 max-w-3xl text-slate-600">
            Страница имитирует внешний сайт: передает корзину в TMS, показывает варианты доставки и при явном
            подтверждении создает настоящий заказ у перевозчика.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-semibold">1. Корзина</h2>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                <p className="font-medium">{demoItem.title}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {demoItem.quantity} шт. · {demoItem.weightGrams} г · 300 x 200 x 150 мм
                </p>
                <p className="mt-2 text-lg font-semibold">{money(demoItem.priceRub)}</p>
              </div>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-semibold">2. Данные покупателя</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {[
                  ["Номер заказа сайта / 1С", externalOrderId, setExternalOrderId],
                  ["ФИО", name, setName],
                  ["Телефон", phone, setPhone],
                  ["Email", email, setEmail],
                ].map(([label, value, setter]) => (
                  <label key={String(label)} className="space-y-1 text-sm font-medium">
                    {String(label)}
                    <input
                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                      value={String(value)}
                      onChange={(event) => (setter as (value: string) => void)(event.target.value)}
                    />
                  </label>
                ))}
                <label className="space-y-1 text-sm font-medium md:col-span-2">
                  Адрес доставки
                  <input className="w-full rounded-xl border border-slate-300 px-3 py-2" value={address} onChange={(event) => setAddress(event.target.value)} />
                </label>
              </div>
              <button className="mt-5 rounded-xl bg-rose-600 px-5 py-3 font-semibold text-white disabled:opacity-60" disabled={loading === "estimate"} onClick={estimateDelivery}>
                {loading === "estimate" ? "Считаем..." : "Рассчитать доставку"}
              </button>
            </div>

            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-semibold">3. Способы доставки</h2>
              {!estimate ? <p className="mt-3 text-slate-500">Сначала рассчитайте доставку.</p> : null}
              <div className="mt-4 space-y-3">
                {estimate?.options.map((option) => {
                  const selected = option.quoteId === selectedQuoteId
                  const price = option.priceRub ?? option.totalPriceRub
                  return (
                    <label key={option.quoteId} className={`block cursor-pointer rounded-2xl border p-4 ${selected ? "border-rose-500 bg-rose-50" : "border-slate-200"}`}>
                      <input type="radio" className="mr-3" checked={selected} onChange={() => setSelectedQuoteId(option.quoteId)} />
                      <span className="font-semibold">{option.carrierName}</span>
                      <span className="ml-2 text-slate-600">{money(price)} · {option.etaDays} дн.</span>
                      {option.notes ? <p className="mt-2 text-sm text-slate-500">{option.notes}</p> : null}
                    </label>
                  )
                })}
              </div>
              <label className="mt-5 flex gap-3 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
                <input type="checkbox" checked={allowRealBooking} onChange={(event) => setAllowRealBooking(event.target.checked)} />
                <span>Я понимаю, что кнопка ниже попытается создать настоящий заказ у выбранного перевозчика.</span>
              </label>
              <button className="mt-5 rounded-xl bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-60" disabled={!estimate || !selectedQuoteId || loading === "confirm"} onClick={confirmBooking}>
                {loading === "confirm" ? "Оформляем..." : "Оформить доставку у перевозчика"}
              </button>
            </div>
          </section>

          <aside className="space-y-6">
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-xl font-semibold">Результат</h2>
              {error ? <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
              {selectedOption ? (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
                  <p className="font-medium">Выбранный вариант</p>
                  <p>{selectedOption.carrierName}</p>
                  <p className="text-slate-500">{money(selectedOption.priceRub ?? selectedOption.totalPriceRub)} · {selectedOption.etaDays} дн.</p>
                </div>
              ) : null}
              {confirmResult?.shipment ? (
                <div className="mt-4 space-y-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
                  <p className="font-semibold">Заказ у перевозчика создан</p>
                  <p>Shipment ID: {confirmResult.shipment.id}</p>
                  <p>Перевозчик: {confirmResult.shipment.carrierName}</p>
                  <p>Номер перевозчика: {confirmResult.shipment.carrierOrderReference || confirmResult.shipment.carrierOrderNumber || "пока не передан"}</p>
                  <p>Трек-номер: {confirmResult.shipment.trackingNumber}</p>
                  <p>Статус: {confirmResult.shipment.status}</p>
                </div>
              ) : null}
            </div>

            <details className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <summary className="cursor-pointer font-semibold">Технический JSON</summary>
              <pre className="mt-4 max-h-[520px] overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
                {JSON.stringify({ requestPayload: estimate?.requestPayload ?? checkoutPayload, estimate, confirmResult }, null, 2)}
              </pre>
            </details>
          </aside>
        </div>
      </div>
    </main>
  )
}
