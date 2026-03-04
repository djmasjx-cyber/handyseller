"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Textarea } from "@handyseller/ui"
import { ArrowLeft, Loader2, Package, Save, History } from "lucide-react"
import Link from "next/link"
import { OzonCategorySelectModal } from "@/components/ozon-category-select-modal"
import { WbCategorySelectModal } from "@/components/wb-category-select-modal"

interface Product {
  id: string
  displayId?: number
  title: string
  description?: string
  cost: string | number
  price?: string | number
  oldPrice?: string | number
  imageUrl?: string
  article?: string
  stock?: number
  seoTitle?: string
  seoKeywords?: string
  seoDescription?: string
  barcodeWb?: string
  barcodeOzon?: string
  brand?: string
  color?: string
  weight?: number
  width?: number
  length?: number
  height?: number
  productUrl?: string
  itemsPerPack?: number
  material?: string
  craftType?: string
  countryOfOrigin?: string
  packageContents?: string
  richContent?: string
  ozonCategoryId?: number | null
  ozonTypeId?: number | null
  ozonCategoryPath?: string | null
  wbSubjectId?: number | null
  wbCategoryPath?: string | null
  marketplaceMappings?: { marketplace: string; externalSystemId: string }[]
}

const MARKETPLACE_BTN: Record<string, { label: string; short: string; className: string }> = {
  WILDBERRIES: { label: "Выгрузить на WB", short: "WB", className: "border-[#CB11AB] text-[#CB11AB] hover:bg-[#CB11AB]/10" },
  OZON: { label: "Выгрузить на Ozon", short: "Ozon", className: "border-[#005BFF] text-[#005BFF] hover:bg-[#005BFF]/10" },
  YANDEX: { label: "Выгрузить на Яндекс", short: "Яндекс", className: "border-[#FC3F1D] text-[#FC3F1D] hover:bg-[#FC3F1D]/10" },
  AVITO: { label: "Выгрузить на Avito", short: "Avito", className: "border-[#7FBA00] text-[#7FBA00] hover:bg-[#7FBA00]/10" },
}

export default function ProductCardPage() {
  const params = useParams()
  const id = params?.id as string
  const [product, setProduct] = useState<Product | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connections, setConnections] = useState<{ marketplace: string }[]>([])
  const [exportLoadingMarketplace, setExportLoadingMarketplace] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | string[] | null>(null)

  const [form, setForm] = useState({
    title: "",
    description: "",
    cost: "",
    price: "",
    oldPrice: "",
    article: "",
    imageUrl: "",
    stock: "",
    seoTitle: "",
    seoKeywords: "",
    seoDescription: "",
    barcodeWb: "",
    barcodeOzon: "",
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
    ozonCategoryId: "",
    ozonTypeId: "",
    ozonCategoryPath: "",
    wbSubjectId: "",
    wbCategoryPath: "",
  })

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null

  useEffect(() => {
    if (!token) return
    fetch("/api/marketplaces", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setConnections(Array.isArray(data) ? data : []))
      .catch(() => setConnections([]))
  }, [token])

  useEffect(() => {
    if (!token || !id) return
    fetch(`/api/products/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => {
        if (r.status === 404) return null
        return r.json()
      })
      .then((p) => {
        if (!p) {
          setProduct(null)
          return
        }
        setProduct(p)
        setForm({
          title: p.title ?? "",
          description: p.description ?? "",
          cost: String(p.cost ?? ""),
          price: p.price != null ? String(p.price) : "",
          oldPrice: p.oldPrice != null ? String(p.oldPrice) : "",
          article: p.article ?? "",
          imageUrl: p.imageUrl ?? "",
          stock: String(p.stock ?? 0),
          seoTitle: p.seoTitle ?? "",
          seoKeywords: p.seoKeywords ?? "",
          seoDescription: p.seoDescription ?? "",
          barcodeWb: p.barcodeWb ?? "",
          barcodeOzon: p.barcodeOzon ?? "",
          brand: p.brand ?? "",
          color: p.color ?? "",
          weight: p.weight != null ? String(p.weight) : "",
          width: p.width != null ? String(p.width) : "",
          length: p.length != null ? String(p.length) : "",
          height: p.height != null ? String(p.height) : "",
          productUrl: p.productUrl ?? "",
          itemsPerPack: p.itemsPerPack != null ? String(p.itemsPerPack) : "",
          material: p.material ?? "",
          craftType: p.craftType ?? "",
          countryOfOrigin: p.countryOfOrigin ?? "",
          packageContents: p.packageContents ?? "",
          richContent: p.richContent ?? "",
          ozonCategoryId: p.ozonCategoryId != null ? String(p.ozonCategoryId) : "",
          ozonTypeId: p.ozonTypeId != null ? String(p.ozonTypeId) : "",
          ozonCategoryPath: p.ozonCategoryPath ?? "",
          wbSubjectId: p.wbSubjectId != null ? String(p.wbSubjectId) : "",
          wbCategoryPath: p.wbCategoryPath ?? "",
        })
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false))
  }, [token, id])

  const hasWbMapping = product?.marketplaceMappings?.some((m) => m.marketplace === "WILDBERRIES")
  const hasOzonMapping = product?.marketplaceMappings?.some((m) => m.marketplace === "OZON")
  const isOzonConnected = connections.some((c) => c.marketplace === "OZON")
  const isWbConnected = connections.some((c) => c.marketplace === "WILDBERRIES")
  const needsCategory = isOzonConnected || isWbConnected

  const ozonMissingFields: string[] = []
  const wbMissingFields: string[] = []
  if (isOzonConnected) {
    if (!form.title?.trim()) ozonMissingFields.push("Название")
    if (!form.article?.trim()) ozonMissingFields.push("Артикул")
    const hasOzonCategory = form.ozonCategoryId && form.ozonTypeId
    if (!hasOzonCategory) ozonMissingFields.push("Категория")
    if (!form.imageUrl?.trim() || !form.imageUrl.startsWith("http")) ozonMissingFields.push("Фото (URL)")
    const priceVal = form.price ? parseFloat(form.price) : NaN
    if (isNaN(priceVal) || priceVal < 20) ozonMissingFields.push("Ваша цена (₽)")
    const weightVal = form.weight ? parseInt(form.weight, 10) : NaN
    if (isNaN(weightVal) || weightVal <= 0) ozonMissingFields.push("Вес (г)")
    const widthVal = form.width ? parseInt(form.width, 10) : NaN
    if (isNaN(widthVal) || widthVal <= 0) ozonMissingFields.push("Ширина (мм)")
    const lengthVal = form.length ? parseInt(form.length, 10) : NaN
    if (isNaN(lengthVal) || lengthVal <= 0) ozonMissingFields.push("Длина (мм)")
    const heightVal = form.height ? parseInt(form.height, 10) : NaN
    if (isNaN(heightVal) || heightVal <= 0) ozonMissingFields.push("Высота (мм)")
  }
  if (isWbConnected) {
    if (!form.wbSubjectId?.trim()) wbMissingFields.push("Категория WB")
  }
  const [loadingWbBarcode, setLoadingWbBarcode] = useState(false)
  const [loadingOzonBarcode, setLoadingOzonBarcode] = useState(false)
  const [ozonCheck, setOzonCheck] = useState<{ exists?: boolean; hint?: string; link?: string; name?: string; offer_id?: string; barcode?: string; debug?: { rawByProductId?: unknown; rawByOfferId?: unknown; offerIdsTried?: string[] } } | null>(null)
  const [ozonPreview, setOzonPreview] = useState<{
    payload?: Record<string, unknown>;
    mapping?: Record<string, { our: unknown; ozon: unknown }>;
    missingRequiredAttributes?: { id: number; name?: string }[];
    timingNote?: string;
    validation?: { valid: boolean; errors?: string[] };
    error?: string;
  } | null>(null)
  const [loadingOzonPreview, setLoadingOzonPreview] = useState(false)
  const [ozonCategoryModalOpen, setOzonCategoryModalOpen] = useState(false)
  const [wbCategoryModalOpen, setWbCategoryModalOpen] = useState(false)
  const [ozonDiagnostic, setOzonDiagnostic] = useState<{
    success?: boolean;
    error?: string;
    ozonResponse?: unknown;
    productId?: string;
  } | null>(null)
  const [loadingOzonDiagnostic, setLoadingOzonDiagnostic] = useState(false)
  const [ozonDebug, setOzonDebug] = useState<{
    error?: string;
    handyseller?: { productId?: string; displayId?: string; article?: string };
    mapping?: { externalSystemId?: string; externalArticle?: string };
    ozon?: { product_id?: string; offer_id?: string; name?: string; barcode?: string; barcodes?: unknown };
    barcodes?: { barcodeWb?: string; barcodeOzon?: string };
    allMappings?: Array<{ userId?: string; marketplace?: string; externalSystemId?: string; externalArticle?: string; syncStock?: boolean }>;
    effectiveUserIds?: string[];
    match?: boolean;
  } | null>(null)
  const [loadingOzonDebug, setLoadingOzonDebug] = useState(false)
  const [ozonStockSync, setOzonStockSync] = useState<{ ok?: boolean; message?: string } | null>(null)
  const [loadingOzonStockSync, setLoadingOzonStockSync] = useState(false)
  const [ozonRefreshMapping, setOzonRefreshMapping] = useState<{ success?: boolean; product_id?: string; offer_id?: string; error?: string } | null>(null)
  const [loadingOzonRefreshMapping, setLoadingOzonRefreshMapping] = useState(false)
  const [deletingMappingId, setDeletingMappingId] = useState<string | null>(null)

  useEffect(() => {
    if (product && product.barcodeWb != null) setForm((f) => ({ ...f, barcodeWb: product.barcodeWb ?? "" }))
  }, [product?.id, product?.barcodeWb])
  useEffect(() => {
    if (product && product.barcodeOzon != null) setForm((f) => ({ ...f, barcodeOzon: product.barcodeOzon ?? "" }))
  }, [product?.id, product?.barcodeOzon])

  const handleExportToMarketplace = async (marketplace: string) => {
    if (!token || !product?.id || exportLoadingMarketplace) return
    if (marketplace === "WILDBERRIES" && wbMissingFields.length > 0) {
      setExportError(["Перед выгрузкой на WB выберите категорию WB"])
      return
    }
    setExportLoadingMarketplace(marketplace)
    setExportError(null)
    const cfg = MARKETPLACE_BTN[marketplace]
    const label = cfg?.short ?? marketplace
    try {
      const res = await fetch(
        `/api/marketplaces/sync?marketplace=${marketplace}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ productIds: [product.id] }),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errList = (data.errors as string[] | undefined) ?? (Array.isArray(data.message) ? data.message : [data.message || `Ошибка ${res.status}`].filter(Boolean))
        setExportError(errList.length > 0 ? errList : [`Ошибка ${res.status}`])
        return
      }
      const results = Array.isArray(data) ? data : []
      const mpResult = results.find((r: { marketplace?: string }) => r.marketplace === marketplace)
      if (mpResult?.errors?.length) {
        setExportError(mpResult.errors as string[])
      } else if (mpResult?.success && (mpResult?.syncedCount ?? 0) >= 1) {
        setExportError(null)
        setOzonCheck(null)
        const msg = label === "Ozon" ? "Товар выгружен. Нажмите «Проверить на Ozon» для проверки." : `Товар выгружен на ${label}`
        alert(msg)
        const r = await fetch(`/api/products/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok) {
          const p = await r.json()
          setProduct(p)
        }
      } else if ((mpResult?.failedCount ?? 0) > 0) {
        setExportError((mpResult?.errors as string[]) || [`Не удалось выгрузить товар на ${label}`])
      } else if (results.length === 0) {
        setExportError(`${label} не подключен. Подключите в разделе Маркетплейсы.`)
      } else {
        setExportError(`Ошибка выгрузки на ${label}`)
      }
    } catch (err) {
      setExportError(err instanceof Error ? err.message : `Ошибка выгрузки на ${label}`)
    } finally {
      setExportLoadingMarketplace(null)
    }
  }

  const loadAndSaveWbBarcode = async () => {
    if (!token || !product?.id || loadingWbBarcode) return
    setLoadingWbBarcode(true)
    try {
      const r = await fetch(`/api/marketplaces/wb-barcode/${product.id}/load`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await r.json().catch(() => ({}))
      if (data.barcode) {
        setForm((f) => ({ ...f, barcodeWb: data.barcode }))
        setProduct((p) => p ? { ...p, barcodeWb: data.barcode } : null)
      } else if (data.error) {
        setExportError(data.error)
      }
    } finally {
      setLoadingWbBarcode(false)
    }
  }

  const checkOzonCard = async () => {
    if (!token || !product?.id) return
    setOzonCheck(null)
    try {
      const r = await fetch(`/api/marketplaces/ozon-check/${product.id}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await r.json().catch(() => ({}))
      setOzonCheck(data)
    } catch {
      setOzonCheck({ exists: false, hint: "Ошибка запроса" })
    }
  }

  const loadOzonPreview = async () => {
    if (!token || !product?.id || loadingOzonPreview) return
    setLoadingOzonPreview(true)
    setOzonPreview(null)
    try {
      const r = await fetch(`/api/marketplaces/ozon-export-preview/${product.id}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await r.json().catch(() => ({}))
      setOzonPreview(data)
    } catch {
      setOzonPreview({ error: "Ошибка запроса" })
    } finally {
      setLoadingOzonPreview(false)
    }
  }

  const handleOzonDiagnostic = async () => {
    if (!token || !product?.id || loadingOzonDiagnostic) return
    setLoadingOzonDiagnostic(true)
    setOzonDiagnostic(null)
    setExportError(null)
    try {
      const r = await fetch(`/api/marketplaces/ozon-export-diagnostic/${product.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await r.json().catch(() => ({}))
      setOzonDiagnostic(data)
      if (data.success) {
        setOzonCheck(null)
        const r2 = await fetch(`/api/products/${product.id}`, { headers: { Authorization: `Bearer ${token}` } })
        if (r2.ok) setProduct(await r2.json())
      } else if (data.error) {
        setExportError(data.error)
      }
    } catch {
      setOzonDiagnostic({ success: false, error: "Ошибка запроса" })
    } finally {
      setLoadingOzonDiagnostic(false)
    }
  }

  const deleteOzonMapping = async (externalSystemId: string) => {
    if (!token || !product?.id || deletingMappingId) return
    setDeletingMappingId(externalSystemId)
    try {
      const r = await fetch(`/api/marketplaces/ozon-delete-mapping/${product.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ externalSystemId }),
      })
      const data = await r.json().catch(() => ({}))
      if (data.success) {
        setOzonDebug(null)
        loadOzonDebug()
        const r2 = await fetch(`/api/products/${product.id}`, { headers: { Authorization: `Bearer ${token}` } })
        if (r2.ok) setProduct(await r2.json())
      } else {
        setExportError(data.error ?? "Ошибка удаления")
      }
    } finally {
      setDeletingMappingId(null)
    }
  }

  const refreshOzonMapping = async () => {
    if (!token || !product?.id || loadingOzonRefreshMapping) return
    setLoadingOzonRefreshMapping(true)
    setOzonRefreshMapping(null)
    try {
      const r = await fetch(`/api/marketplaces/ozon-refresh-mapping/${product.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await r.json().catch(() => ({}))
      setOzonRefreshMapping(data)
      if (data.success) {
        const r2 = await fetch(`/api/products/${product.id}`, { headers: { Authorization: `Bearer ${token}` } })
        if (r2.ok) setProduct(await r2.json())
      }
    } catch {
      setOzonRefreshMapping({ success: false, error: "Ошибка запроса" })
    } finally {
      setLoadingOzonRefreshMapping(false)
    }
  }

  const forceSyncOzonStock = async () => {
    if (!token || !product?.id || loadingOzonStockSync) return
    setLoadingOzonStockSync(true)
    setOzonStockSync(null)
    try {
      const articleOrId = (product.article ?? product.id).toString().trim()
      const r = await fetch(`/api/marketplaces/ozon-stock/${encodeURIComponent(articleOrId)}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await r.json().catch(() => ({}))
      setOzonStockSync(data)
    } catch {
      setOzonStockSync({ ok: false, message: "Ошибка запроса" })
    } finally {
      setLoadingOzonStockSync(false)
    }
  }

  const loadOzonDebug = async () => {
    if (!token || !product?.id || loadingOzonDebug) return
    setLoadingOzonDebug(true)
    setOzonDebug(null)
    try {
      const r = await fetch(`/api/marketplaces/ozon-debug/${product.id}`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await r.json().catch(() => ({}))
      setOzonDebug(data)
    } catch {
      setOzonDebug({ error: "Ошибка запроса" })
    } finally {
      setLoadingOzonDebug(false)
    }
  }

  const loadAndSaveOzonBarcode = async () => {
    if (!token || !product?.id || loadingOzonBarcode) return
    setLoadingOzonBarcode(true)
    setExportError(null)
    try {
      const r = await fetch(`/api/marketplaces/ozon-barcode/${product.id}/load`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await r.json().catch(() => ({}))
      if (data.barcode) {
        setForm((f) => ({ ...f, barcodeOzon: data.barcode }))
        setProduct((p) => p ? { ...p, barcodeOzon: data.barcode } : null)
      } else if (data.error) {
        setExportError(data.error)
      }
    } finally {
      setLoadingOzonBarcode(false)
    }
  }

  const handleSave = async () => {
    if (!token || !product) return
    const costVal = form.cost ? parseFloat(form.cost) : 0
    const stock = parseInt(form.stock, 10)
    if (!isNaN(costVal) && costVal < 0) {
      setError("Себестоимость не может быть отрицательной")
      return
    }
    if (!form.title.trim()) {
      setError("Укажите название")
      return
    }
    if (isNaN(stock) || stock < 0) {
      setError("Укажите корректный остаток")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || "",
        cost: isNaN(costVal) ? 0 : costVal,
        price: form.price ? parseFloat(form.price) : undefined,
        oldPrice: form.oldPrice ? parseFloat(form.oldPrice) : undefined,
        article: form.article.trim() || "",
        seoTitle: form.seoTitle.trim() || "",
        seoKeywords: form.seoKeywords.trim() || "",
        seoDescription: form.seoDescription.trim() || "",
        imageUrl: form.imageUrl.trim() || "",
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
        ozonCategoryId: form.ozonCategoryId ? parseInt(form.ozonCategoryId, 10) : undefined,
        ozonTypeId: form.ozonTypeId ? parseInt(form.ozonTypeId, 10) : undefined,
        ozonCategoryPath: form.ozonCategoryPath?.trim() || undefined,
        wbSubjectId: form.wbSubjectId ? parseInt(form.wbSubjectId, 10) : undefined,
        wbCategoryPath: form.wbCategoryPath?.trim() || undefined,
      }
      const stockChanged = stock !== (product.stock ?? 0)
      const [patchRes, stockRes] = await Promise.all([
        fetch(`/api/products/${product.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }),
        stockChanged
          ? fetch(`/api/products/${product.id}/stock`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ stock }),
            })
          : Promise.resolve(null as Response | null),
      ])
      const patchData = await patchRes.json().catch(() => ({}))
      if (!patchRes.ok) {
        const msg = Array.isArray(patchData.message) ? patchData.message.join(", ") : patchData.message || `Ошибка ${patchRes.status}`
        setError(String(msg))
        return
      }
      if (stockRes && !stockRes.ok) {
        const stockData = await stockRes.json().catch(() => ({}))
        const msg = Array.isArray(stockData.message) ? stockData.message.join(", ") : stockData.message || `Ошибка сохранения остатка: ${stockRes.status}`
        setError(String(msg))
        return
      }
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              ...payload,
              stock,
              imageUrl: form.imageUrl.trim() || prev.imageUrl,
            }
          : null
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка")
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

  if (!product) {
    return (
      <div className="space-y-6 w-full min-w-0 overflow-x-hidden max-w-2xl md:max-w-none">
        <Button variant="ghost" size="icon" className="shrink-0 touch-manipulation" asChild>
          <Link href="/dashboard/products">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Товар не найден</p>
            <Button asChild className="mt-4">
              <Link href="/dashboard/products">К списку товаров</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4 md:space-y-6 w-full min-w-0 overflow-x-hidden max-w-3xl md:max-w-none">
      {/* Шапка: на десктопе — заголовок и кнопки в одной строке; на мобильном — кнопки ниже */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="icon" className="shrink-0 h-10 w-10 touch-manipulation" asChild>
            <Link href="/dashboard/products">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg sm:text-2xl font-bold flex flex-wrap items-center gap-2">
              <Package className="h-5 w-5 sm:h-6 sm:w-6 shrink-0" />
              <span className="break-words">Карточка товара</span>
              {product.displayId != null && (
                <span className="text-muted-foreground font-mono text-sm sm:text-lg">
                  #{String(product.displayId).padStart(4, "0")}
                </span>
              )}
            </h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 hidden sm:block max-w-md">
              Редактируйте поля — изменения пишутся в историю. WB/Ozon: название, описание, цена, SEO.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0 pl-[52px] md:pl-0 md:mt-0">
          {connections.map((c) => {
            const cfg = MARKETPLACE_BTN[c.marketplace]
            if (!cfg) return null
            const isLoading = exportLoadingMarketplace === c.marketplace
            return (
              <Button
                key={c.marketplace}
                variant="outline"
                size="sm"
                className={`min-h-[44px] touch-manipulation ${cfg.className}`}
                onClick={() => handleExportToMarketplace(c.marketplace)}
                disabled={!!exportLoadingMarketplace}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : cfg.label}
              </Button>
            )
          })}
          <Button variant="outline" size="sm" className="flex-1 sm:flex-initial min-h-[44px] touch-manipulation" asChild>
            <Link href={`/dashboard/products?history=${product.id}`}>
              <History className="h-4 w-4 mr-1 shrink-0" />
              История
            </Link>
          </Button>
          <Button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-initial min-h-[44px] touch-manipulation">
            {saving ? <Loader2 className="h-4 w-4 animate-spin shrink-0" /> : <Save className="h-4 w-4 mr-1 shrink-0" />}
            Сохранить
          </Button>
        </div>
      </div>

      {exportError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {Array.isArray(exportError) ? (
            <>
              <p className="font-medium mb-1">Не удалось выгрузить. Исправьте:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {exportError.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </>
          ) : (
            exportError
          )}
        </div>
      )}

      {isOzonConnected && ozonMissingFields.length > 0 && !exportLoadingMarketplace && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <p className="font-medium mb-1">Для выгрузки на Ozon заполните:</p>
          <ul className="list-disc list-inside">{ozonMissingFields.map((f) => (
            <li key={f}>{f}</li>
          ))}</ul>
        </div>
      )}

      {product.marketplaceMappings && product.marketplaceMappings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Связки:</span>
          {product.marketplaceMappings.map((m) => (
            <Badge
              key={`${m.marketplace}-${m.externalSystemId}`}
              variant="outline"
              className={
                m.marketplace === "OZON" ? "border-[#005BFF] text-[#005BFF]" :
                m.marketplace === "WILDBERRIES" ? "border-[#CB11AB] text-[#CB11AB]" :
                m.marketplace === "YANDEX" ? "border-[#FC3F1D] text-[#FC3F1D]" :
                m.marketplace === "AVITO" ? "border-[#7FBA00] text-[#7FBA00]" : ""
              }
              title={`${m.marketplace} ID: ${m.externalSystemId}`}
            >
              {m.marketplace === "WILDBERRIES" ? "WB" : m.marketplace === "OZON" ? "OZ" : m.marketplace.slice(0, 2)}: {m.externalSystemId}
            </Badge>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Основное</CardTitle>
            <CardDescription>Название, артикул, штрих-коды. WB: Наименование. Ozon: name.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Название *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Наименование товара"
                className={ozonMissingFields.includes("Название") ? "border-destructive ring-destructive" : undefined}
              />
              <p className="text-xs text-muted-foreground">WB: до 60 символов. Ozon: name.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="article">Артикул (vendor code) {isOzonConnected && "*"}</Label>
              <Input
                id="article"
                value={form.article}
                onChange={(e) => setForm((f) => ({ ...f, article: e.target.value }))}
                placeholder="БУС-001"
                className={ozonMissingFields.includes("Артикул") ? "border-destructive ring-destructive" : undefined}
              />
              <p className="text-xs text-muted-foreground">Используется для поиска и при синхронизации с маркетплейсами.</p>
            </div>
            {needsCategory && (
              <>
                {isOzonConnected && (
                  <div className="space-y-2">
                    <Label>Категория Ozon {ozonMissingFields.includes("Категория") && "*"}</Label>
                    <div className="flex gap-2">
                      <div
                        className={`flex-1 min-h-[40px] px-3 py-2 rounded-md border bg-background text-sm flex items-center ${
                          ozonMissingFields.includes("Категория") ? "border-destructive" : "border-input"
                        }`}
                      >
                        {form.ozonCategoryPath || (
                          <span className="text-muted-foreground">Не выбрана</span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setOzonCategoryModalOpen(true)}
                        className="shrink-0 border-[#005BFF] text-[#005BFF] hover:bg-[#005BFF]/10"
                      >
                        Выбрать категорию
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Ozon требует категорию третьего уровня.</p>
                  </div>
                )}
                {isWbConnected && (
                  <div className="space-y-2">
                    <Label>Категория WB {wbMissingFields.includes("Категория WB") && "*"}</Label>
                    <div className="flex gap-2">
                      <div
                        className={`flex-1 min-h-[40px] px-3 py-2 rounded-md border bg-background text-sm flex items-center ${
                          wbMissingFields.includes("Категория WB") ? "border-destructive" : "border-input"
                        }`}
                      >
                        {form.wbCategoryPath || (
                          <span className="text-muted-foreground">Не выбрана</span>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setWbCategoryModalOpen(true)}
                        className="shrink-0 border-[#CB11AB] text-[#CB11AB] hover:bg-[#CB11AB]/10"
                      >
                        Выбрать категорию
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">WB требует предмет (subject) для выгрузки.</p>
                  </div>
                )}
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="barcodeWb">Штрих-код WB</Label>
              <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                <Input
                  id="barcodeWb"
                  value={form.barcodeWb}
                  readOnly
                  disabled
                  placeholder="Только с маркета"
                  className="min-w-0 bg-muted"
                />
                {hasWbMapping && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={loadAndSaveWbBarcode}
                    disabled={loadingWbBarcode}
                    className="shrink-0 min-h-[44px] touch-manipulation"
                  >
                    {loadingWbBarcode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Загрузить с WB"}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Штрих-код уникален на каждом маркете. Ввести вручную нельзя — только загрузить.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="barcodeOzon">Штрих-код Ozon</Label>
              <p className="text-xs text-muted-foreground">Исправили артикул или создали товар на Ozon с другим offer_id? Нажмите «Обновить связку».</p>
              <div className="flex flex-col gap-2 min-w-0">
                <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                  <Input
                    id="barcodeOzon"
                    value={form.barcodeOzon}
                    readOnly
                    disabled
                    placeholder="Только с маркета"
                    className="min-w-0 bg-muted"
                  />
                  {(hasOzonMapping || (isOzonConnected && form.article?.trim())) && (hasOzonMapping || form.article?.trim()) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={loadAndSaveOzonBarcode}
                      disabled={loadingOzonBarcode}
                      className="shrink-0 min-h-[44px] touch-manipulation"
                    >
                      {loadingOzonBarcode ? <Loader2 className="h-4 w-4 animate-spin" /> : "Загрузить с Ozon"}
                    </Button>
                  )}
                </div>
                {(hasOzonMapping || (isOzonConnected && form.article?.trim())) && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={checkOzonCard}
                      className="shrink-0 h-8 px-2 text-xs touch-manipulation text-muted-foreground"
                      title="Проверить, создана ли карточка на Ozon"
                    >
                      Проверить на Ozon
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={refreshOzonMapping}
                      disabled={loadingOzonRefreshMapping || !form.article?.trim()}
                      className="shrink-0 h-8 px-2 text-xs touch-manipulation border-amber-500 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                      title="Исправили артикул? Ищет товар на Ozon по текущему артикулу и обновляет связку"
                    >
                      {loadingOzonRefreshMapping ? <Loader2 className="h-4 w-4 animate-spin" /> : "Обновить связку"}
                    </Button>
                    <details className="group">
                      <summary className="cursor-pointer list-none inline-flex items-center h-8 px-2 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50">
                        <span className="select-none">Ещё</span>
                      </summary>
                      <div className="flex flex-wrap gap-1.5 mt-1.5 pl-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={loadOzonPreview}
                          disabled={loadingOzonPreview}
                          className="shrink-0 h-8 px-2 text-xs touch-manipulation text-[#005BFF]"
                          title="Что уйдёт на Ozon, какие поля обязательны"
                        >
                          {loadingOzonPreview ? <Loader2 className="h-4 w-4 animate-spin" /> : "Предпросмотр выгрузки"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleOzonDiagnostic}
                          disabled={loadingOzonDiagnostic || !!exportLoadingMarketplace}
                          className="shrink-0 h-8 px-2 text-xs touch-manipulation text-muted-foreground"
                          title="Попытка выгрузки с полным ответом Ozon при ошибке"
                        >
                          {loadingOzonDiagnostic ? <Loader2 className="h-4 w-4 animate-spin" /> : "Диагностика выгрузки"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={loadOzonDebug}
                          disabled={loadingOzonDebug}
                          className="shrink-0 h-8 px-2 text-xs touch-manipulation text-muted-foreground"
                          title="Связки, маппинги, штрих-коды — для отладки"
                        >
                          {loadingOzonDebug ? <Loader2 className="h-4 w-4 animate-spin" /> : "Связки Ozon"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={forceSyncOzonStock}
                          disabled={loadingOzonStockSync}
                          className="shrink-0 h-8 px-2 text-xs touch-manipulation text-muted-foreground"
                          title="Принудительно отправить цену и остаток на Ozon"
                        >
                          {loadingOzonStockSync ? <Loader2 className="h-4 w-4 animate-spin" /> : "Синхр. остаток Ozon"}
                        </Button>
                      </div>
                    </details>
                  </div>
                )}
              </div>
              {ozonStockSync && (
                <div className={`rounded-lg p-2 text-xs ${ozonStockSync.ok ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
                  {ozonStockSync.ok ? "✓ " : ""}{ozonStockSync.message}
                </div>
              )}
              {ozonRefreshMapping && (
                <div className={`rounded-lg p-2 text-xs ${ozonRefreshMapping.success ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
                  {ozonRefreshMapping.success
                    ? `✓ Связка обновлена: product_id=${ozonRefreshMapping.product_id}, offer_id=${ozonRefreshMapping.offer_id}`
                    : ozonRefreshMapping.error}
                </div>
              )}
              {ozonDebug && (
                <div className="rounded-lg border border-muted p-2 text-xs bg-muted/30 space-y-1">
                  {ozonDebug.error ? (
                    <p className="text-destructive">{ozonDebug.error}</p>
                  ) : (
                    <>
                      {(ozonDebug.allMappings?.filter((m) => m.marketplace === "OZON") ?? []).length > 1 && (
                        <div className="mb-2 space-y-1">
                          <p className="font-medium text-amber-600 dark:text-amber-400">Лишние связки Ozon — удалите неверную:</p>
                          {(ozonDebug.allMappings ?? [])
                            .filter((m) => m.marketplace === "OZON")
                            .map((m) => (
                              <div key={m.externalSystemId} className="flex items-center gap-2">
                                <span>
                                  product_id={m.externalSystemId}, offer_id={m.externalArticle ?? "—"}
                                  {form.article && m.externalArticle !== form.article && (
                                    <span className="ml-1 text-amber-600">(не совпадает с артикулом)</span>
                                  )}
                                </span>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  className="h-6 px-2 text-xs"
                                  onClick={() => deleteOzonMapping(m.externalSystemId || "")}
                                  disabled={deletingMappingId === m.externalSystemId}
                                >
                                  {deletingMappingId === m.externalSystemId ? <Loader2 className="h-3 w-3 animate-spin" /> : "Удалить"}
                                </Button>
                              </div>
                            ))}
                        </div>
                      )}
                      <details className="cursor-pointer">
                        <summary className="font-medium">Связки Ozon (диагностика)</summary>
                        <pre className="mt-2 p-2 bg-black/5 rounded text-[10px] overflow-auto max-h-60 whitespace-pre-wrap">
                          {JSON.stringify({
                            handyseller: ozonDebug.handyseller,
                            mapping: ozonDebug.mapping,
                            ozon: ozonDebug.ozon,
                            barcodes: ozonDebug.barcodes,
                            match: ozonDebug.match,
                            allMappings: ozonDebug.allMappings,
                            effectiveUserIds: ozonDebug.effectiveUserIds,
                          }, null, 2)}
                        </pre>
                      </details>
                    </>
                  )}
                </div>
              )}
              {ozonCheck && (
                <div className={`rounded-lg p-2 text-xs ${ozonCheck.exists ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400"}`}>
                  {ozonCheck.exists ? (
                    <>
                      <strong>Карточка создана на Ozon.</strong>
                      {ozonCheck.name && <><br />Название: {ozonCheck.name}</>}
                      {ozonCheck.offer_id && <><br />Артикул (offer_id): {ozonCheck.offer_id}</>}
                      {ozonCheck.link && (
                        <><br /><a href={ozonCheck.link} target="_blank" rel="noreferrer" className="underline">Открыть в ЛК Ozon →</a></>
                      )}
                    </>
                  ) : (
                    <>
                      {ozonCheck.hint}
                      {ozonCheck.debug && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-muted-foreground">Ответ Ozon API (для отладки)</summary>
                          <pre className="mt-1 p-1 bg-black/5 rounded text-[10px] overflow-auto max-h-40">
                            {JSON.stringify(ozonCheck.debug, null, 2)}
                          </pre>
                        </details>
                      )}
                    </>
                  )}
                </div>
              )}
              {ozonPreview && (
                <div className="rounded-lg border border-[#005BFF]/30 bg-[#005BFF]/5 p-3 text-xs space-y-2">
                  {ozonPreview.error ? (
                    <p className="text-destructive">{ozonPreview.error}</p>
                  ) : (
                    <>
                      {ozonPreview.timingNote && <p className="text-muted-foreground">{ozonPreview.timingNote}</p>}
                      {ozonPreview.validation && !ozonPreview.validation.valid && (
                        <p className="text-amber-600 dark:text-amber-400">
                          Валидация: {ozonPreview.validation.errors?.join("; ")}
                        </p>
                      )}
                      {ozonPreview.missingRequiredAttributes && ozonPreview.missingRequiredAttributes.length > 0 && (
                        <p className="text-amber-600 dark:text-amber-400">
                          Ozon требует атрибуты: {ozonPreview.missingRequiredAttributes.map((a) => a.name || a.id).join(", ")}
                        </p>
                      )}
                      {ozonPreview.mapping && (
                        <details className="mt-1">
                          <summary className="cursor-pointer font-medium">Маппинг полей (наше → Ozon)</summary>
                          <table className="mt-1 w-full text-muted-foreground">
                            {Object.entries(ozonPreview.mapping).map(([key, v]) => (
                              <tr key={key}>
                                <td className="pr-2 py-0.5">{key}</td>
                                <td className="py-0.5">→</td>
                                <td className="py-0.5">{String((v as { our?: unknown }).our ?? "")}</td>
                                <td className="py-0.5">→</td>
                                <td className="py-0.5">{String((v as { ozon?: unknown }).ozon ?? "")}</td>
                              </tr>
                            ))}
                          </table>
                        </details>
                      )}
                    </>
                  )}
                </div>
              )}
              {ozonDiagnostic && (
                <div className={`rounded-lg border p-3 text-xs space-y-2 ${ozonDiagnostic.success ? "border-green-500/50 bg-green-500/10" : "border-destructive/50 bg-destructive/10"}`}>
                  {ozonDiagnostic.success ? (
                    <p className="text-green-700 dark:text-green-400">
                      ✓ Товар выгружен на Ozon. product_id: {ozonDiagnostic.productId}
                    </p>
                  ) : (
                    <>
                      <p className="text-destructive font-medium">{ozonDiagnostic.error}</p>
                      {ozonDiagnostic.ozonResponse && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-muted-foreground">Полный ответ Ozon</summary>
                          <pre className="mt-1 p-2 bg-muted rounded text-[10px] overflow-x-auto max-h-40 overflow-y-auto">
                            {JSON.stringify(ozonDiagnostic.ozonResponse, null, 2)}
                          </pre>
                        </details>
                      )}
                    </>
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Ozon: артикул, название, фото (URL), цена, вес (г), габариты (мм). Штрих-код — с маркета.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Бренд</Label>
              <Input
                id="brand"
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                placeholder="Ручная работа"
              />
              <p className="text-xs text-muted-foreground">Обязателен для WB. Используется как vendor на Яндексе.</p>
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-2">
                <Label htmlFor="weight">Вес (г) {isOzonConnected && "*"}</Label>
                <Input
                  id="weight"
                  type="number"
                  min="1"
                  value={form.weight}
                  onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                  placeholder="100"
                  className={ozonMissingFields.includes("Вес (г)") ? "border-destructive ring-destructive" : undefined}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="width">Ширина (мм) {isOzonConnected && "*"}</Label>
                <Input
                  id="width"
                  type="number"
                  min="1"
                  value={form.width}
                  onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))}
                  placeholder="100"
                  className={ozonMissingFields.includes("Ширина (мм)") ? "border-destructive ring-destructive" : undefined}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="length">Длина (мм) {isOzonConnected && "*"}</Label>
                <Input
                  id="length"
                  type="number"
                  min="1"
                  value={form.length}
                  onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
                  placeholder="100"
                  className={ozonMissingFields.includes("Длина (мм)") ? "border-destructive ring-destructive" : undefined}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Высота (мм) {isOzonConnected && "*"}</Label>
                <Input
                  id="height"
                  type="number"
                  min="1"
                  value={form.height}
                  onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
                  placeholder="100"
                  className={ozonMissingFields.includes("Высота (мм)") ? "border-destructive ring-destructive" : undefined}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Габариты и вес обязательны для WB и Ozon.</p>
            <div className="space-y-2">
              <Label htmlFor="productUrl">URL страницы товара</Label>
              <Input
                id="productUrl"
                type="url"
                value={form.productUrl}
                onChange={(e) => setForm((f) => ({ ...f, productUrl: e.target.value }))}
                placeholder="https://your-site.ru/product/..."
              />
              <p className="text-xs text-muted-foreground">Обязателен для Яндекс.Маркета. Оставьте пустым для автогенерации.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                placeholder="HTML-описание для WB, Ozon, Яндекс (блоки, форматирование)"
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Расширенное описание с HTML. Выгружается на все маркетплейсы.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Себестоимость, остаток, фото</CardTitle>
            <CardDescription>Себестоимость для аналитики. Остаток синхронизируется с WB, Ozon.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Фото</Label>
              <div className="flex flex-col sm:flex-row gap-4 items-start min-w-0">
                <div className="shrink-0 w-24 h-24 sm:w-32 sm:h-32 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/30 flex items-center justify-center overflow-hidden">
                  {form.imageUrl ? (
                    <>
                      <img src={form.imageUrl} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement)?.classList.remove("hidden") }} />
                      <span className="hidden text-xs text-muted-foreground text-center px-2">Ошибка</span>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground text-center px-2">Нет фото</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 w-full">
                  <Label htmlFor="imageUrl" className="sr-only">URL фото {isOzonConnected && "*"}</Label>
                  <Input
                    id="imageUrl"
                    type="url"
                    value={form.imageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="https://..."
                    className={`min-w-0 ${ozonMissingFields.includes("Фото (URL)") ? "border-destructive ring-destructive" : ""}`}
                  />
                  <p className="text-xs text-muted-foreground mt-1">WB: /content/v3/media/save. Ozon: images[].</p>
                </div>
              </div>
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
                  className={ozonMissingFields.includes("Ваша цена (₽)") ? "border-destructive ring-destructive" : undefined}
                />
                <p className="text-xs text-muted-foreground">Ozon: мин. 20 ₽. При цене ≤400 скидка &gt;20%</p>
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
              <Label htmlFor="stock">Остаток (Мой склад) *</Label>
              <Input
                id="stock"
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Источник правды. Синхронизируется с WB, Ozon.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Описание</CardTitle>
          <CardDescription>Подробное описание товара. WB: 1000–5000 символов. Ozon: technicalDetails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2 w-full">
            <Label htmlFor="description">Описание</Label>
            <Textarea
              id="description"
              rows={12}
              className="w-full min-h-[200px] resize-y max-h-[50vh]"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Подробное описание. WB: 1000–5000 символов. Ozon: technicalDetails."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SEO</CardTitle>
          <CardDescription>Заголовок, ключевые слова, мета-описание. WB: seoText. Ozon: seo-поля.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="seoTitle">SEO заголовок</Label>
            <Input
              id="seoTitle"
              value={form.seoTitle}
              onChange={(e) => setForm((f) => ({ ...f, seoTitle: e.target.value }))}
              placeholder="До 255 символов"
              maxLength={255}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seoKeywords">Ключевые слова</Label>
            <Input
              id="seoKeywords"
              value={form.seoKeywords}
              onChange={(e) => setForm((f) => ({ ...f, seoKeywords: e.target.value }))}
              placeholder="через запятую"
              maxLength={500}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seoDescription">SEO описание</Label>
            <Input
              id="seoDescription"
              value={form.seoDescription}
              onChange={(e) => setForm((f) => ({ ...f, seoDescription: e.target.value }))}
              placeholder="Мета description"
              maxLength={500}
            />
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <OzonCategorySelectModal
        open={ozonCategoryModalOpen}
        onOpenChange={setOzonCategoryModalOpen}
        token={token}
        onSelect={async ({ ozonCategoryId, ozonTypeId, ozonCategoryPath }) => {
          setForm((f) => ({
            ...f,
            ozonCategoryId: String(ozonCategoryId),
            ozonTypeId: String(ozonTypeId),
            ozonCategoryPath,
          }))
          if (token && product?.id) {
            try {
              const r = await fetch(`/api/products/${product.id}`, {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  ozonCategoryId,
                  ozonTypeId,
                  ozonCategoryPath,
                }),
              })
              if (r.ok) {
                const p = await r.json()
                setProduct((prev) => (prev ? { ...prev, ...p } : prev))
              }
            } catch {
              // Сохранение при выборе — бонус; форма обновлена
            }
          }
        }}
      />
      <WbCategorySelectModal
        open={wbCategoryModalOpen}
        onOpenChange={setWbCategoryModalOpen}
        token={token}
        onSelect={async ({ wbSubjectId, wbCategoryPath }) => {
          setForm((f) => ({
            ...f,
            wbSubjectId: String(wbSubjectId),
            wbCategoryPath,
          }))
          if (token && product?.id) {
            try {
              const r = await fetch(`/api/products/${product.id}`, {
                method: "PATCH",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  wbSubjectId,
                  wbCategoryPath,
                }),
              })
              if (r.ok) {
                const p = await r.json()
                setProduct((prev) => (prev ? { ...prev, ...p } : prev))
              }
            } catch {
              // Сохранение при выборе — бонус; форма обновлена
            }
          }
        }}
      />
    </div>
  )
}
