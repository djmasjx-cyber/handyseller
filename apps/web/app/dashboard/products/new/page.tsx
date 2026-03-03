"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Textarea } from "@handyseller/ui"
import { ArrowLeft, Loader2, Package, CreditCard } from "lucide-react"
import Link from "next/link"

export default function NewProductPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [atLimit, setAtLimit] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: "",
    description: "",
    cost: "",
    price: "",
    oldPrice: "",
    article: "",
    imageUrl: "",
    brand: "",
    color: "",
    weight: "",
    width: "",
    length: "",
    height: "",
    productUrl: "",
    itemsPerPack: "",
    material: "",
    craftType: "",
    countryOfOrigin: "",
    packageContents: "",
    richContent: "",
  })

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null

  useEffect(() => {
    if (!token) {
      router.push("/login")
      return
    }
    Promise.all([
      fetch("/api/subscriptions/me", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
      fetch("/api/products", { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()),
    ])
      .then(([subData, productsData]) => {
        const limits = subData?.limits
        const products = Array.isArray(productsData) ? productsData : []
        if (limits && products.length >= limits.maxProducts) setAtLimit(true)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [router, token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return
    const costVal = form.cost ? parseFloat(form.cost) : 0
    if (!isNaN(costVal) && costVal < 0) {
      setError("Себестоимость не может быть отрицательной")
      return
    }
    if (!form.title.trim()) {
      setError("Укажите название")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || undefined,
          cost: isNaN(costVal) ? undefined : costVal,
          price: form.price ? parseFloat(form.price) : undefined,
          oldPrice: form.oldPrice ? parseFloat(form.oldPrice) : undefined,
          article: form.article.trim() || undefined,
          imageUrl: form.imageUrl.trim() || undefined,
          brand: form.brand.trim() || undefined,
          color: form.color.trim() || undefined,
          weight: form.weight ? parseInt(form.weight, 10) : undefined,
          width: form.width ? parseInt(form.width, 10) : undefined,
          length: form.length ? parseInt(form.length, 10) : undefined,
          height: form.height ? parseInt(form.height, 10) : undefined,
          productUrl: form.productUrl.trim() || undefined,
          itemsPerPack: form.itemsPerPack ? parseInt(form.itemsPerPack, 10) : undefined,
          material: form.material.trim() || undefined,
          craftType: form.craftType.trim() || undefined,
          countryOfOrigin: form.countryOfOrigin.trim() || undefined,
          packageContents: form.packageContents.trim() || undefined,
          richContent: form.richContent.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message || `Ошибка ${res.status}`
        setError(String(msg))
        return
      }
      router.push("/dashboard/products")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (atLimit) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/products">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Package className="h-8 w-8" />
              Добавить товар
            </h1>
            <p className="text-muted-foreground">Создание карточки товара</p>
          </div>
        </div>
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-6 flex items-start gap-3">
          <CreditCard className="h-6 w-6 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Достигнут лимит товаров по вашему тарифу</p>
            <p className="text-sm text-muted-foreground mt-1">
              Чтобы добавить новые товары, перейдите на план с большим лимитом.
            </p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/subscription">Перейти в Подписка</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/products">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Package className="h-8 w-8" />
            Добавить товар
          </h1>
          <p className="text-muted-foreground">Создание карточки товара</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Карточка товара</CardTitle>
          <CardDescription>
            Основная информация: название, описание, фото. Артикул — для быстрого поиска при пополнении остатков.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Название *</Label>
              <Input
                id="title"
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Бусинки стеклянные"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="article">Артикул</Label>
              <Input
                id="article"
                value={form.article}
                onChange={(e) => setForm((f) => ({ ...f, article: e.target.value }))}
                placeholder="БУС-001"
              />
              <p className="text-xs text-muted-foreground">
                Используется для быстрого поиска при пополнении остатков
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea
                id="description"
                rows={4}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Подробное описание товара..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cost">Себестоимость (₽)</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                min="0"
                value={form.cost}
                onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                placeholder="Для аналитики"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Ваша цена, ₽ *</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="20"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="Минимум 20"
                />
                <p className="text-xs text-muted-foreground">Ozon: мин. 20 ₽. При цене ≤400 скидка должна быть &gt;20%</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="oldPrice">Цена до скидки, ₽</Label>
                <Input
                  id="oldPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.oldPrice}
                  onChange={(e) => setForm((f) => ({ ...f, oldPrice: e.target.value }))}
                  placeholder="Авто при выгрузке"
                />
                <p className="text-xs text-muted-foreground">Если пусто — рассчитается при выгрузке на Ozon</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="imageUrl">URL фото</Label>
              <Input
                id="imageUrl"
                type="url"
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://..."
              />
              <p className="text-xs text-muted-foreground">
                Ссылка на изображение. Обязательно для Ozon и WB.
              </p>
            </div>

            <div className="border-t pt-4 space-y-4">
              <p className="text-sm font-medium text-muted-foreground">Для выгрузки на маркетплейсы</p>
              <div className="space-y-2">
                <Label htmlFor="brand">Бренд</Label>
                <Input
                  id="brand"
                  value={form.brand}
                  onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                  placeholder="Ручная работа"
                />
                <p className="text-xs text-muted-foreground">Обязателен для Wildberries</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="color">Цвет</Label>
                <Input
                  id="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  placeholder="Красный, синий, мультиколор..."
                />
                <p className="text-xs text-muted-foreground">Отображается на WB, Ozon, Яндекс.Маркет</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weight">Вес (г)</Label>
                  <Input
                    id="weight"
                    type="number"
                    min="1"
                    value={form.weight}
                    onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                    placeholder="100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="width">Ширина (мм)</Label>
                  <Input
                    id="width"
                    type="number"
                    min="1"
                    value={form.width}
                    onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))}
                    placeholder="100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="length">Длина (мм)</Label>
                  <Input
                    id="length"
                    type="number"
                    min="1"
                    value={form.length}
                    onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
                    placeholder="100"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="height">Высота (мм)</Label>
                  <Input
                    id="height"
                    type="number"
                    min="1"
                    value={form.height}
                    onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
                    placeholder="100"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Габариты и вес обязательны для WB и Ozon</p>
              <div className="space-y-2">
                <Label htmlFor="productUrl">URL страницы товара</Label>
                <Input
                  id="productUrl"
                  type="url"
                  value={form.productUrl}
                  onChange={(e) => setForm((f) => ({ ...f, productUrl: e.target.value }))}
                  placeholder="https://your-site.ru/product/..."
                />
                <p className="text-xs text-muted-foreground">Обязателен для Яндекс.Маркета. Можно оставить пустым — сгенерируется автоматически.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="itemsPerPack">Кол-во в упаковке</Label>
                  <Input
                    id="itemsPerPack"
                    type="number"
                    min="1"
                    value={form.itemsPerPack}
                    onChange={(e) => setForm((f) => ({ ...f, itemsPerPack: e.target.value }))}
                    placeholder="1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="countryOfOrigin">Страна производства</Label>
                  <Input
                    id="countryOfOrigin"
                    value={form.countryOfOrigin}
                    onChange={(e) => setForm((f) => ({ ...f, countryOfOrigin: e.target.value }))}
                    placeholder="Россия"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="material">Материал изделия</Label>
                <Input
                  id="material"
                  value={form.material}
                  onChange={(e) => setForm((f) => ({ ...f, material: e.target.value }))}
                  placeholder="Текст, бисер, кожа..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="craftType">Вид творчества</Label>
                <Input
                  id="craftType"
                  value={form.craftType}
                  onChange={(e) => setForm((f) => ({ ...f, craftType: e.target.value }))}
                  placeholder="Рукоделие, handmade..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="packageContents">Комплектация</Label>
                <Textarea
                  id="packageContents"
                  value={form.packageContents}
                  onChange={(e) => setForm((f) => ({ ...f, packageContents: e.target.value }))}
                  placeholder="Что входит в комплект"
                  rows={2}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="richContent">Рич-контент (HTML)</Label>
                <Textarea
                  id="richContent"
                  value={form.richContent}
                  onChange={(e) => setForm((f) => ({ ...f, richContent: e.target.value }))}
                  placeholder="HTML-описание для WB, Ozon, Яндекс"
                  rows={6}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">Расширенное описание с HTML. Выгружается на все маркетплейсы.</p>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Создать товар"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/dashboard/products">Отмена</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
