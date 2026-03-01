"use client"

import { useState, useEffect, useCallback } from "react"
import { Button, Input, Label } from "@handyseller/ui"
import { X, Loader2 } from "lucide-react"

function normalizeSalesSource(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase()
}

interface ProductOption {
  id: string
  article: string | null
  title: string
  displayId: string
}

interface SalesSourceOption {
  id: string
  name: string
}

interface CreateOrderModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  token: string | null
}

export function CreateOrderModal({ open, onClose, onSuccess, token }: CreateOrderModalProps) {
  const [externalId, setExternalId] = useState("")
  const [productQuery, setProductQuery] = useState("")
  const [productResults, setProductResults] = useState<ProductOption[]>([])
  const [productLoading, setProductLoading] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [price, setPrice] = useState("")
  const [salesSourceInput, setSalesSourceInput] = useState("")
  const [salesSources, setSalesSources] = useState<SalesSourceOption[]>([])
  const [salesSourceLoading, setSalesSourceLoading] = useState(false)
  const [showProductDropdown, setShowProductDropdown] = useState(false)
  const [showSalesSourceDropdown, setShowSalesSourceDropdown] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProducts = useCallback(
    (q: string) => {
      if (!token || !q.trim()) {
        setProductResults([])
        return
      }
      setProductLoading(true)
      fetch(`/api/products/search?q=${encodeURIComponent(q.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => setProductResults(Array.isArray(data) ? data : []))
        .catch(() => setProductResults([]))
        .finally(() => setProductLoading(false))
    },
    [token]
  )

  const fetchSalesSources = useCallback(() => {
    if (!token) return
    setSalesSourceLoading(true)
    fetch("/api/sales-sources", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setSalesSources(Array.isArray(data) ? data : []))
      .catch(() => setSalesSources([]))
      .finally(() => setSalesSourceLoading(false))
  }, [token])

  useEffect(() => {
    if (!open) return
    fetchSalesSources()
    setProductQuery("")
    setProductResults([])
    setSelectedProduct(null)
    setQuantity(1)
    setPrice("")
    setSalesSourceInput("")
    setError(null)
    if (token) {
      fetch("/api/orders", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((data) => {
          const manualOrders = Array.isArray(data) ? data.filter((o: { marketplace: string }) => o.marketplace === "MANUAL") : []
          const nums = manualOrders
            .map((o: { externalId: string }) => parseInt(o.externalId.replace(/^0+/, "") || "0", 10))
            .filter((n: number) => !Number.isNaN(n) && n > 0)
          const max = nums.length > 0 ? Math.max(...nums) : 0
          setExternalId(String(max + 1).padStart(6, "0"))
        })
        .catch(() => setExternalId("000001"))
    } else {
      setExternalId("000001")
    }
  }, [open, fetchSalesSources, token])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => fetchProducts(productQuery), 300)
    return () => clearTimeout(t)
  }, [productQuery, open, fetchProducts])

  const total = selectedProduct && quantity >= 1 && !Number.isNaN(parseFloat(price))
    ? (quantity * parseFloat(price)).toFixed(2)
    : "—"

  const handleSalesSourceBlur = () => {
    if (salesSourceInput.trim()) {
      setSalesSourceInput(normalizeSalesSource(salesSourceInput))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !selectedProduct) {
      setError("Выберите товар")
      return
    }
    const salesSource = salesSourceInput.trim()
    if (!salesSource) {
      setError("Укажите источник продажи")
      return
    }
    const extId = externalId.trim()
    if (!extId) {
      setError("Укажите номер заказа")
      return
    }
    const priceNum = parseFloat(price)
    if (Number.isNaN(priceNum) || priceNum < 0) {
      setError("Укажите корректную стоимость")
      return
    }
    if (quantity < 1) {
      setError("Количество должно быть не менее 1")
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          externalId: extId,
          productId: selectedProduct.id,
          quantity,
          price: priceNum,
          salesSource: normalizeSalesSource(salesSource),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message || `Ошибка ${res.status}`
        setError(String(msg))
        return
      }
      onSuccess()
      onClose()
    } catch {
      setError("Ошибка создания заказа")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg border bg-background shadow-lg">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-lg">Создать свой заказ</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-muted"
            aria-label="Закрыть"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div>
            <Label htmlFor="externalId">Номер заказа</Label>
            <Input
              id="externalId"
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="0001"
              className="mt-1"
            />
          </div>

          <div className="relative">
            <Label>Товар</Label>
            <Input
              value={selectedProduct ? `${selectedProduct.displayId} — ${selectedProduct.title}` : productQuery}
              onChange={(e) => {
                setProductQuery(e.target.value)
                setSelectedProduct(null)
                setShowProductDropdown(true)
              }}
              onFocus={() => setShowProductDropdown(true)}
              onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
              placeholder="Поиск по артикулу или названию"
              className="mt-1"
            />
            {productLoading && (
              <Loader2 className="absolute right-3 top-9 h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {showProductDropdown && !selectedProduct && productQuery.trim() && (
              <div className="absolute z-20 mt-1 w-full rounded-md border bg-background shadow-lg max-h-48 overflow-auto">
                {productResults.length === 0 && !productLoading ? (
                  <div className="p-3 text-sm text-muted-foreground">Ничего не найдено</div>
                ) : (
                  productResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSelectedProduct(p)
                        setProductQuery("")
                        setShowProductDropdown(false)
                      }}
                    >
                      {p.displayId} — {p.title}
                      {p.article && ` (${p.article})`}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="quantity">Количество</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="price">Стоимость (₽)</Label>
              <Input
                id="price"
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="total">Сумма</Label>
            <Input id="total" value={total} readOnly className="mt-1 bg-muted" />
          </div>

          <div className="relative">
            <Label>Источник продажи</Label>
            <Input
              value={salesSourceInput}
              onChange={(e) => {
                setSalesSourceInput(e.target.value)
                setShowSalesSourceDropdown(true)
              }}
              onBlur={() => {
                handleSalesSourceBlur()
                setTimeout(() => setShowSalesSourceDropdown(false), 150)
              }}
              onFocus={() => setShowSalesSourceDropdown(true)}
              placeholder="Авито, Инстаграм..."
              className="mt-1"
            />
            {showSalesSourceDropdown && salesSources.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-md border bg-background shadow-lg max-h-40 overflow-auto">
                {salesSources
                  .filter((s) => !salesSourceInput || s.name.toLowerCase().includes(salesSourceInput.toLowerCase()))
                  .map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setSalesSourceInput(s.name)
                        setShowSalesSourceDropdown(false)
                      }}
                    >
                      {s.name}
                    </button>
                  ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Отмена
            </Button>
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Создать заказ"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
