"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@handyseller/ui"
import { ArrowLeft } from "lucide-react"
import { WmsSubnav } from "@/components/wms/wms-subnav"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

type OrderDetail = {
  orderNumber: string
  senderOp: string
  receiverOp: string
  orderDate: string
  lines: {
    itemCode: string
    itemName: string
    quantity: number
    unitPrice: number
    sum: number
  }[]
}

const numberRu = new Intl.NumberFormat("ru-RU")
const moneyRu = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 })
const qtyRu = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 })

function money(value: number): string {
  return `${moneyRu.format(value)} ₽`
}

function dateRu(value: string | null): string {
  if (!value) return "—"
  const ymd = value.slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!m) return ymd.replace(/-/g, ".")
  return `${m[3]}.${m[2]}.${m[1]}`
}

function formatQty(n: number): string {
  if (Number.isInteger(n)) return numberRu.format(n)
  return qtyRu.format(n)
}

function listHref(sp: URLSearchParams): string {
  const q = new URLSearchParams(sp)
  q.delete("orderNumber")
  q.delete("orderGroupKind")
  const s = q.toString()
  return s ? `/dashboard/wms/analytics/transfers?${s}` : "/dashboard/wms/analytics/transfers"
}

export default function WmsTouristOrderDetailPage() {
  const router = useRouter()
  const token = typeof window !== "undefined" ? localStorage.getItem(AUTH_STORAGE_KEYS.accessToken) : null
  const sp = useSearchParams()
  const orderNumber = sp.get("orderNumber")?.trim() ?? ""
  const orderGroupKind =
    sp.get("orderGroupKind")?.trim().toUpperCase() === "REPLENISHMENT" ? "REPLENISHMENT" : "TOURIST"
  const queryString = useMemo(() => sp.toString(), [sp])
  const isReplenishment = orderGroupKind === "REPLENISHMENT"

  const [detail, setDetail] = useState<OrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!orderNumber) {
      setLoading(false)
      setDetail(null)
      setError("Не указан номер заказа (параметр orderNumber).")
      return
    }
    if (!token) {
      setLoading(false)
      setDetail(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`/api/wms/v1/analytics/transfers/tourists/order-detail?${queryString}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const text = await res.text()
      if (!res.ok) {
        let detailMsg = text.slice(0, 400)
        try {
          const j = JSON.parse(text) as { message?: unknown }
          if (typeof j.message === "string") detailMsg = j.message
        } catch {
          /* keep */
        }
        throw new Error(detailMsg || `HTTP ${res.status}`)
      }
      setDetail(JSON.parse(text) as OrderDetail)
    } catch (e) {
      setDetail(null)
      setError(e instanceof Error ? e.message : "Не удалось загрузить заказ.")
    } finally {
      setLoading(false)
    }
  }, [token, orderNumber, queryString])

  useEffect(() => {
    void load()
  }, [load])

  const orderLineTotals = useMemo(() => {
    if (!detail || detail.lines.length <= 1) return null
    let qty = 0
    let sum = 0
    for (const l of detail.lines) {
      qty += l.quantity
      sum += l.sum
    }
    return { qty, sum }
  }, [detail])

  const backHref = listHref(sp)

  /** Возврат на сводку тем же URL, что был до входа в заказ (без повторной канонизации query). */
  const goBackToSummary = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back()
      return
    }
    router.push(backHref)
  }

  return (
    <main className="space-y-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">WMS / BI</p>
          <h1 className="text-2xl font-semibold">{isReplenishment ? "Пополнение (LM)" : "Туристский заказ"}</h1>
          <p className="text-sm text-muted-foreground">
            {isReplenishment
              ? "Состав по строкам с тем же номером в «ДокументОснование»; те же фильтры, что на странице аналитики."
              : "Состав заказа по номенклатуре; те же фильтры, что на странице аналитики."}
          </p>
        </div>
        <WmsSubnav />
      </div>

      <div>
        <button
          type="button"
          onClick={goBackToSummary}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          К сводке заказов
        </button>
      </div>

      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}

      {orderNumber && token ? (
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle className="text-lg">№ {detail?.orderNumber ?? orderNumber}</CardTitle>
            {detail && !error ? (
              <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Отправитель</dt>
                  <dd className="font-medium text-foreground">{detail.senderOp || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Получатель</dt>
                  <dd className="font-medium text-foreground">{detail.receiverOp || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Дата</dt>
                  <dd className="font-medium text-foreground">{dateRu(detail.orderDate)}</dd>
                </div>
              </dl>
            ) : loading ? (
              <p className="text-sm text-muted-foreground">Загрузка реквизитов заказа…</p>
            ) : null}
          </CardHeader>
          <CardContent className="pt-0">
            {error ? (
              <p className="text-sm text-muted-foreground">Состав заказа не загружен.</p>
            ) : loading && !detail ? (
              <p className="text-sm text-muted-foreground">Загрузка позиций…</p>
            ) : detail && detail.lines.length > 0 ? (
              <div className="max-h-[min(28rem,60vh)] overflow-auto rounded-md border border-border/60 bg-muted/15">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="sticky top-0 z-[1] border-b bg-background/95 text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-background/80">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">НоменклатураКод</th>
                      <th className="whitespace-nowrap px-3 py-2 font-medium">Номенклатура</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Кол-во</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Стоимость</th>
                      <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Сумма</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((line) => (
                      <tr key={line.itemCode} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{line.itemCode}</td>
                        <td className="max-w-[min(28rem,50vw)] px-3 py-2 break-words">{line.itemName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatQty(line.quantity)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(line.unitPrice)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{money(line.sum)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {orderLineTotals ? (
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/25 font-medium">
                        <td colSpan={2} className="px-3 py-2 text-foreground">
                          Итого по заказу
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">
                          {formatQty(orderLineTotals.qty)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">{money(orderLineTotals.sum)}</td>
                      </tr>
                    </tfoot>
                  ) : null}
                </table>
              </div>
            ) : detail ? (
              <p className="text-sm text-muted-foreground">В заказе нет позиций с выбранными фильтрами.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : !orderNumber ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Откройте страницу по ссылке с номером заказа из блока «Заказы по маршрутам и товарам» на аналитике перемещений.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Войдите в аккаунт и снова перейдите по ссылке из сводки заказов.
          </CardContent>
        </Card>
      )}
    </main>
  )
}
