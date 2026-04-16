"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge, Input, Label, Textarea } from "@handyseller/ui"
import Link from "next/link"
import { Package, Download, Loader2, RefreshCw, Plus, Warehouse, History, Pencil, CreditCard, Search, Archive } from "lucide-react"
import { proxyImageUrl } from "@/lib/image-proxy"

type HistoryEntry =
  | {
      type: "stock"
      id: string
      delta: number
      quantityBefore: number
      quantityAfter: number
      source: string
      note?: string
      createdAt: string
      user?: { name?: string; email?: string }
    }
  | {
      type: "field"
      id: string
      field: string
      oldValue: string | null
      newValue: string | null
      createdAt: string
      user?: { name?: string; email?: string }
    }

const FIELD_LABELS: Record<string, string> = {
  title: "Название",
  cost: "Себестоимость",
  price: "Себестоимость", // legacy
  article: "Артикул",
  description: "Описание",
  seoTitle: "SEO заголовок",
  seoKeywords: "SEO ключевые слова",
  seoDescription: "SEO описание",
  imageUrl: "Фото",
  barcodeWb: "Штрих-код WB",
  barcodeOzon: "Штрих-код Ozon",
  archivedAt: "Архив",
}

const SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Вручную",
  SALE: "Продажа",
  IMPORT: "Импорт",
  SYNC: "Синхронизация",
}

function formatWho(entry: HistoryEntry): string {
  const who = entry.user?.name || entry.user?.email
  if (!who) return "Не указан"
  // Зашифрованные данные выглядят как base64 (буквы, цифры, /, +)
  if (/^[A-Za-z0-9+/]+=*$/.test(who) && who.length > 40) return "Пользователь"
  return who
}

function formatDate(entry: HistoryEntry): string {
  try {
    const d = new Date(entry.createdAt)
    if (isNaN(d.getTime())) return "—"
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return "—"
  }
}

interface Product {
  id: string
  displayId?: number
  title: string
  description?: string
  cost: string | number
  imageUrl?: string
  sku?: string
  article?: string
  stock?: number
  reservedFbs?: number
  reservedFbo?: number
  stockFbo?: number
  seoTitle?: string
  seoKeywords?: string
  seoDescription?: string
  createdAt: string
  marketplaceMappings?: { marketplace: string }[]
}

interface SubscriptionLimits {
  maxProducts: number
  maxMarketplaces: number
  materialsAllowed: boolean
}

interface ImportProgressInfo {
  phase?: string
  processed?: number
  total?: number
  percent?: number
}

interface ImportJobState {
  jobId: string
  marketplace: "WILDBERRIES" | "OZON"
  state: string
  progress?: ImportProgressInfo
  result?: { imported?: number; skipped?: number; errors?: string[]; articlesUpdated?: number }
  failedReason?: string
  message?: string
}

export default function ProductsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [products, setProducts] = useState<Product[]>([])
  const [connections, setConnections] = useState<{ marketplace: string }[]>([])
  const [limits, setLimits] = useState<SubscriptionLimits | null>(null)
  const [loading, setLoading] = useState(true)
  const [importingMarketplace, setImportingMarketplace] = useState<"WILDBERRIES" | "OZON" | null>(null)
  const [importJob, setImportJob] = useState<ImportJobState | null>(null)
  const PAGE_SIZE = 20
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [productsTotal, setProductsTotal] = useState(0)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const offsetRef = useRef(0)
  const [searchQuery, setSearchQuery] = useState("") // Поиск по артикулу или наименованию
  type ProductsSortKey = "stockFbs" | "stockFbo" | "reservedFbs" | "reservedFbo" | "cost"
  type SortDirection = "asc" | "desc"
  const [sortKey, setSortKey] = useState<ProductsSortKey>("stockFbs")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null

  const fetchSubscription = () => {
    if (!token) return
    fetch("/api/subscriptions/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => data?.limits && setLimits(data.limits))
      .catch(() => {})
  }

  // Остатки FBO по маркетплейсам
  const [wbStockFbo, setWbStockFbo] = useState<Record<string, number>>({})
  const [ozonStockFbo, setOzonStockFbo] = useState<Record<string, number>>({})

  const fetchProducts = useCallback(async (reset = true, pageOffset?: number) => {
    if (!token) return
    const nextOffset = reset ? 0 : (pageOffset ?? offsetRef.current)
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(nextOffset),
      sortBy: sortKey === "stockFbo" ? "createdAt" : sortKey,
      sortDirection,
    })
    if (searchQuery.trim()) params.set("search", searchQuery.trim())
    const res = await fetch(`/api/products/paged?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    const list = Array.isArray(data?.items) ? data.items : []
    setProducts((prev) => (reset ? list : [...prev, ...list]))
    setHasMore(Boolean(data?.hasMore))
    const newOffset = nextOffset + list.length
    setOffset(newOffset)
    offsetRef.current = newOffset
    setProductsTotal(typeof data?.total === "number" ? data.total : 0)
  }, [token, sortKey, sortDirection, searchQuery])

  const fetchWbStockFbo = () => {
    if (!token || !isWbConnected) return
    fetch("/api/marketplaces/wb-fbo-stock", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : {})
      .then((data) => {
        const map = (typeof data === "object" && data != null && !Array.isArray(data))
          ? (data as Record<string, number>)
          : {}
        setWbStockFbo(map)
      })
      .catch(() => setWbStockFbo({}))
  }

  const fetchOzonStockFbo = () => {
    if (!token || !isOzonConnected) return
    fetch("/api/marketplaces/ozon-fbo-stock", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : {})
      .then((data) => {
        const map = (typeof data === "object" && data != null && !Array.isArray(data))
          ? (data as Record<string, number>)
          : {}
        setOzonStockFbo(map)
      })
      .catch(() => setOzonStockFbo({}))
  }

  const fetchConnections = () => {
    if (!token) return
    fetch("/api/marketplaces", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setConnections(Array.isArray(data) ? data : []))
      .catch(() => setConnections([]))
  }

  useEffect(() => {
    if (!token) {
      router.push("/login")
      return
    }
    fetchProducts(true).catch(() => setProducts([]))
    fetchConnections()
    fetchSubscription()
    // Загружаем остатки FBO при инициализации (WB и Ozon)
    fetchWbStockFbo()
    fetchOzonStockFbo()
    setLoading(false)
    // Автоматически заполнить CDN-фото для WB товаров без imageUrl (тихо, без UI)
    fetch("/api/marketplaces/backfill-wb-photos", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).then((r) => {
      if (r.ok) {
        return fetchProducts(true)
      }
    }).catch(() => {})
    const t = setInterval(() => { fetchProducts(true).catch(() => {}) }, 60000)
    return () => clearInterval(t)
  }, [router, token])

  // Открыть историю по ?history=productId (при переходе из карточки товара).
  // historyId — UUID или displayId (0006, 6).
  useEffect(() => {
    const historyId = searchParams.get("history")
    if (!historyId || loading) return
    const product =
      products.find((p) => p.id === historyId) ??
      products.find(
        (p) =>
          p.displayId != null &&
          (String(p.displayId) === historyId || String(p.displayId).padStart(4, "0") === historyId)
      )
    if (product) setHistoryProduct(product)
  }, [searchParams, loading, products])

  const isWbConnected = connections.some((c) => c.marketplace === "WILDBERRIES")
  const isOzonConnected = connections.some((c) => c.marketplace === "OZON")

  // Загружаем остатки при изменении подключений
  useEffect(() => {
    if (isWbConnected) {
      fetchWbStockFbo()
    }
    if (isOzonConnected) {
      fetchOzonStockFbo()
    }
  }, [isWbConnected, isOzonConnected])
  const atProductLimit = limits ? productsTotal >= limits.maxProducts : false

  // Селектор склада: local | WILDBERRIES | OZON | YANDEX | AVITO — горизонтальные вкладки
  type WarehouseFilter = "local" | "WILDBERRIES" | "OZON" | "YANDEX" | "AVITO"
  const [warehouseFilter, setWarehouseFilter] = useState<WarehouseFilter>("local")

  // Отмена редактирования при переключении с Мой склад + загрузка остатков FBO
  useEffect(() => {
    if (warehouseFilter !== "local") {
      setEditingStockId(null)
      setEditingFieldId(null)
      setEditingField(null)
    }
    // Загружаем остатки FBO для выбранного маркетплейса (для "Мой склад" — оба, для суммы)
    if (warehouseFilter === "WILDBERRIES") {
      fetchWbStockFbo()
    } else if (warehouseFilter === "OZON") {
      fetchOzonStockFbo()
    } else if (warehouseFilter === "local") {
      fetchWbStockFbo()
      fetchOzonStockFbo()
    }
  }, [warehouseFilter])
  const warehouseTabs: { value: WarehouseFilter; label: string }[] = [
    { value: "local", label: "Мой склад" },
    { value: "WILDBERRIES", label: "WB" },
    { value: "OZON", label: "Ozon" },
    { value: "YANDEX", label: "Яндекс" },
    { value: "AVITO", label: "Avito" },
  ]
  const WAREHOUSE_BRAND_CLASS: Record<WarehouseFilter, string> = {
    local: "",
    WILDBERRIES: "!bg-[#CB11AB] hover:!bg-[#B00E99] !border-[#CB11AB] !text-white",
    OZON: "!bg-[#005BFF] hover:!bg-[#004FDD] !border-[#005BFF] !text-white",
    YANDEX: "!bg-[#FC3F1D] hover:!bg-[#E33819] !border-[#FC3F1D] !text-white",
    AVITO: "!bg-[#7FBA00] hover:!bg-[#6FA300] !border-[#7FBA00] !text-white",
  }

  const MARKETPLACE_BADGE_STYLE: Record<string, { bg: string; text: string }> = {
    WILDBERRIES: { bg: "#CB11AB", text: "#ffffff" },
    OZON: { bg: "#005BFF", text: "#ffffff" },
    YANDEX: { bg: "#FC3F1D", text: "#ffffff" },
    AVITO: { bg: "#7FBA00", text: "#ffffff" },
  }
  const MARKETPLACE_ORDER = ["WILDBERRIES", "OZON", "YANDEX", "AVITO", "MANUAL"]

  const filteredProducts = (() => {
    let list = products
    if (warehouseFilter !== "local") {
      // Фильтр по связкам: показываем товары с маппингом на выбранный маркетплейс
      list = list.filter((p) =>
        (p.marketplaceMappings ?? []).some((m) => m.marketplace === warehouseFilter)
      )
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(
        (p) =>
          (p.article?.toLowerCase().includes(q) ?? false) ||
          (p.title?.toLowerCase().includes(q) ?? false) ||
          (p.sku?.toLowerCase().includes(q) ?? false)
      )
    }
    return list
  })()

  const toggleSort = (key: ProductsSortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === key) {
        setSortDirection((prevDir) => (prevDir === "desc" ? "asc" : "desc"))
        return prevKey
      }
      setSortDirection("desc")
      return key
    })
  }

  const sortedProducts = (() => {
    const dir = sortDirection === "desc" ? -1 : 1
    return [...filteredProducts].sort((a, b) => {
      let va = 0
      let vb = 0

      if (sortKey === "stockFbs") {
        va = a.stock ?? 0
        vb = b.stock ?? 0
      } else if (sortKey === "stockFbo") {
        const awb = wbStockFbo[a.id] ?? 0
        const aoz = ozonStockFbo[a.id] ?? 0
        const bwa = wbStockFbo[b.id] ?? 0
        const boz = ozonStockFbo[b.id] ?? 0
        va = awb + aoz
        vb = bwa + boz
      } else if (sortKey === "reservedFbs") {
        va = a.reservedFbs ?? 0
        vb = b.reservedFbs ?? 0
      } else if (sortKey === "reservedFbo") {
        va = a.reservedFbo ?? 0
        vb = b.reservedFbo ?? 0
      } else if (sortKey === "cost") {
        va = Number(a.cost) || 0
        vb = Number(b.cost) || 0
      }

      if (va === vb) return 0
      return va > vb ? dir : -dir
    })
  })()

  useEffect(() => {
    if (!token) return
    setOffset(0)
    offsetRef.current = 0
    fetchProducts(true).catch(() => setProducts([]))
  }, [token, sortKey, sortDirection, searchQuery, fetchProducts])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasMore || loading || loadingMore) return
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return
      setLoadingMore(true)
      fetchProducts(false, offsetRef.current)
        .catch(() => {})
        .finally(() => setLoadingMore(false))
    }, { rootMargin: "300px" })
    observer.observe(node)
    return () => observer.disconnect()
  }, [fetchProducts, hasMore, loading, loadingMore])

  // Inline-редактирование остатков
  const [editingStockId, setEditingStockId] = useState<string | null>(null)
  const [editingStockValue, setEditingStockValue] = useState("")
  const [stockSaveError, setStockSaveError] = useState<string | null>(null)
  const [stockSavingId, setStockSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const saveStock = async (product: Product, newStock: number) => {
    if (!token || newStock < 0) return
    setStockSavingId(product.id)
    setStockSaveError(null)
    try {
      const res = await fetch(`/api/products/${product.id}/stock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ stock: newStock }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("accessToken")
          router.push("/login")
          return
        }
        const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message || `Ошибка ${res.status}`
        setStockSaveError(msg)
        return
      }
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, stock: newStock } : p))
      )
    } finally {
      setStockSavingId(null)
      setEditingStockId(null)
    }
  }
  const startEditStock = (product: Product) => {
    setEditingStockId(product.id)
    setEditingStockValue(String(product.stock ?? 0))
    setStockSaveError(null)
  }
  const confirmEditStock = (product: Product) => {
    const val = parseInt(editingStockValue, 10)
    if (!isNaN(val) && val >= 0) {
      if (val !== (product.stock ?? 0)) {
        saveStock(product, val)
      } else {
        setEditingStockId(null)
      }
    } else {
      setEditingStockId(null)
    }
  }

  // Inline-редактирование полей: title, cost, article, description, seoTitle, seoKeywords, seoDescription
  type EditableField = "title" | "cost" | "article" | "description" | "seo"
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<EditableField | null>(null)
  const [editingFieldValue, setEditingFieldValue] = useState("")
  const [editingSeoValues, setEditingSeoValues] = useState<{
    seoTitle: string
    seoKeywords: string
    seoDescription: string
  } | null>(null)
  const [fieldSavingId, setFieldSavingId] = useState<string | null>(null)
  const [fieldSaveError, setFieldSaveError] = useState<string | null>(null)
  const saveField = async (product: Product, field: EditableField, value: string) => {
    if (!token) return
    const trimmed = value.trim()
    let payload: Record<string, unknown> = {}
    if (field === "title") {
      if (!trimmed) return
      payload = { title: trimmed }
    } else if (field === "cost") {
      const num = parseFloat(trimmed.replace(",", "."))
      if (isNaN(num) || num < 0) return
      payload = { cost: num }
    } else if (field === "article") {
      payload = { article: trimmed || "" }
    } else if (field === "description") {
      payload = { description: trimmed || "" }
    } else return // seo handled separately
    setFieldSavingId(product.id)
    setFieldSaveError(null)
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("accessToken")
          router.push("/login")
          return
        }
        const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message || `Ошибка ${res.status}`
        setFieldSaveError(msg)
        return
      }
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== product.id) return p
          const updated = { ...p, ...payload }
          if (field === "article") updated.article = trimmed || undefined
          if (field === "description") updated.description = trimmed || undefined
          return updated
        })
      )
    } finally {
      setFieldSavingId(null)
      setEditingFieldId(null)
      setEditingField(null)
    }
  }
  const startEditField = (product: Product, field: EditableField) => {
    setEditingFieldId(product.id)
    setEditingField(field)
    if (field === "title") setEditingFieldValue(product.title ?? "")
    else if (field === "cost") setEditingFieldValue(String(product.cost ?? ""))
    else if (field === "article") setEditingFieldValue(product.article ?? "")
    else if (field === "description") setEditingFieldValue(product.description ?? "")
    else if (field === "seo") {
      setEditingSeoValues({
        seoTitle: product.seoTitle ?? "",
        seoKeywords: product.seoKeywords ?? "",
        seoDescription: product.seoDescription ?? "",
      })
    }
    setFieldSaveError(null)
  }
  const confirmEditField = (product: Product) => {
    if (editingField === "title" && editingFieldValue.trim()) {
      if (editingFieldValue.trim() !== product.title) {
        saveField(product, "title", editingFieldValue)
      } else {
        setEditingFieldId(null)
        setEditingField(null)
      }
    } else if (editingField === "cost") {
      const num = parseFloat(editingFieldValue.replace(",", "."))
      if (!isNaN(num) && num >= 0 && num !== Number(product.cost)) {
        saveField(product, "cost", editingFieldValue)
      } else {
        setEditingFieldId(null)
        setEditingField(null)
      }
    } else if (editingField === "article") {
      const newVal = editingFieldValue.trim()
      if (newVal !== (product.article ?? "")) {
        saveField(product, "article", editingFieldValue)
      } else {
        setEditingFieldId(null)
        setEditingField(null)
      }
    } else if (editingField === "description") {
      const newVal = editingFieldValue.trim()
      const curVal = product.description ?? ""
      if (newVal !== curVal) {
        saveField(product, "description", editingFieldValue)
      } else {
        setEditingFieldId(null)
        setEditingField(null)
      }
    } else if (editingField === "seo" && editingSeoValues) {
      const changed =
        editingSeoValues.seoTitle !== (product.seoTitle ?? "") ||
        editingSeoValues.seoKeywords !== (product.seoKeywords ?? "") ||
        editingSeoValues.seoDescription !== (product.seoDescription ?? "")
      if (changed) saveFieldSeo(product, editingSeoValues)
      else {
        setEditingFieldId(null)
        setEditingField(null)
        setEditingSeoValues(null)
      }
    } else {
      setEditingFieldId(null)
      setEditingField(null)
    }
  }
  const saveFieldSeo = async (
    product: Product,
    v: { seoTitle: string; seoKeywords: string; seoDescription: string }
  ) => {
    if (!token) return
    setFieldSavingId(product.id)
    setFieldSaveError(null)
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          seoTitle: v.seoTitle.trim() || "",
          seoKeywords: v.seoKeywords.trim() || "",
          seoDescription: v.seoDescription.trim() || "",
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("accessToken")
          router.push("/login")
          return
        }
        const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message || `Ошибка ${res.status}`
        setFieldSaveError(msg)
        return
      }
      setProducts((prev) =>
        prev.map((p) =>
          p.id !== product.id
            ? p
            : { ...p, seoTitle: v.seoTitle.trim() || undefined, seoKeywords: v.seoKeywords.trim() || undefined, seoDescription: v.seoDescription.trim() || undefined }
        )
      )
    } finally {
      setFieldSavingId(null)
      setEditingFieldId(null)
      setEditingField(null)
      setEditingSeoValues(null)
    }
  }

  const handleArchive = async (product: Product) => {
    if (!token) return
    if (!confirm(`Архивировать товар «${product.title}»? Товар переместится в Архив, его можно будет восстановить.`)) return
    setDeletingId(product.id)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/products/${product.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message || `Ошибка ${res.status}`
        setDeleteError(msg)
        return
      }
      setProducts((prev) => prev.filter((p) => p.id !== product.id))
    } finally {
      setDeletingId(null)
    }
  }

  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !importJob?.jobId) return
    const terminalStates = new Set(["completed", "failed"])
    if (terminalStates.has(importJob.state)) return

    let stop = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/marketplaces/import/status/${importJob.jobId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return
        const nextState = String(data?.state ?? "")
        const nextProgressRaw = data?.progress
        const nextProgress =
          typeof nextProgressRaw === "object" && nextProgressRaw !== null
            ? (nextProgressRaw as ImportProgressInfo)
            : undefined
        const nextResult =
          typeof data?.result === "object" && data?.result !== null
            ? (data.result as ImportJobState["result"])
            : undefined
        setImportJob((prev) =>
          prev
            ? {
                ...prev,
                state: nextState || prev.state,
                progress: nextProgress ?? prev.progress,
                result: nextResult ?? prev.result,
                failedReason: (data?.failedReason as string | undefined) ?? prev.failedReason,
              }
            : prev
        )
        if (nextState === "completed") {
          setImportingMarketplace(null)
          fetchProducts()
          fetchWbStockFbo()
          fetchOzonStockFbo()
        } else if (nextState === "failed") {
          setImportingMarketplace(null)
          const reason = (data?.failedReason as string | undefined) ?? "Ошибка фонового импорта"
          setImportError(reason)
        }
      } catch {
        // silent background polling
      }
    }

    poll()
    const id = window.setInterval(() => {
      if (!stop) void poll()
    }, 2000)
    return () => {
      stop = true
      window.clearInterval(id)
    }
  }, [token, importJob?.jobId, importJob?.state])

  // История изменений (остатки + поля)
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null)
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const openHistory = (product: Product) => {
    setHistoryProduct(product)
    setHistoryEntries([])
  }

  const closeHistory = () => {
    setHistoryProduct(null)
    if (searchParams.get("history")) router.replace("/dashboard/products")
  }

  useEffect(() => {
    if (!token || !historyProduct) return
    setHistoryLoading(true)
    fetch(`/api/products/${historyProduct.id}/history`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setHistoryEntries(Array.isArray(data) ? data : []))
      .catch(() => setHistoryEntries([]))
      .finally(() => setHistoryLoading(false))
  }, [token, historyProduct?.id])

  const handleImportFromMarketplace = async (marketplace: "WILDBERRIES" | "OZON") => {
    if (!token) return
    if (marketplace === "WILDBERRIES" && !isWbConnected) return
    if (marketplace === "OZON" && !isOzonConnected) return
    setImportingMarketplace(marketplace)
    setImportError(null)
    let asyncStarted = false
    try {
      const res = await fetch("/api/marketplaces/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ marketplace }),
      })
      let data: Record<string, unknown> = {}
      try {
        const text = await res.text()
        data = text ? JSON.parse(text) : {}
      } catch {
        data = {}
      }
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem("accessToken")
          router.push("/login")
          return
        }
        const msg = (Array.isArray(data.message) ? data.message.join(", ") : data.message) || data.error || `Ошибка ${res.status}`
        setImportError(String(msg))
        return
      }
      const jobId = typeof data.jobId === "string" ? data.jobId : null
      if (jobId) {
        asyncStarted = true
        setImportJob({
          jobId,
          marketplace,
          state: "waiting",
          progress: { phase: "start", processed: 0, total: 0, percent: 0 },
          message: typeof data.message === "string" ? data.message : undefined,
        })
        return
      }
      const msg = `Импортировано: ${data.imported}. Пропущено (уже есть): ${data.skipped}.`
      if (Array.isArray(data.errors) && data.errors.length) {
        setImportError(`${msg} Ошибки: ${(data.errors as string[]).slice(0, 3).join("; ")}`)
      } else {
        setImportError(null)
        alert(msg)
      }
      fetchProducts()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Ошибка импорта товаров")
    } finally {
      if (!asyncStarted) {
        setImportingMarketplace(null)
      }
    }
  }

  const handleImportFromWb = () => handleImportFromMarketplace("WILDBERRIES")
  const handleImportFromOzon = () => handleImportFromMarketplace("OZON")


  const handleOzonFboDebug = async () => {
    if (!token || !isOzonConnected) return
    try {
      const res = await fetch("/api/marketplaces/ozon-fbo-stock-debug", { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json().catch(() => ({}))
      const msg = [
        `Маппингов Ozon: ${data.mappings?.length ?? 0}`,
        `product_id: [${(data.productIds ?? []).join(", ")}]`,
        `offer_id: [${(data.offerIds ?? []).join(", ")}]`,
        `warehouseId: ${data.warehouseId ?? "не задан"}`,
        `Распарсено: ${JSON.stringify(data.resultByProductId ?? data.diagnostic?.parsed ?? {})}`,
        data.diagnostic?.response ? `Ответ API: ${JSON.stringify(data.diagnostic.response).slice(0, 500)}...` : "",
      ].filter(Boolean).join("\n")
      console.log("Ozon FBO диагностика:", data)
      alert(msg)
    } catch (e) {
      alert("Ошибка: " + (e instanceof Error ? e.message : String(e)))
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Товары</h1>
          <p className="text-muted-foreground">
            Каталог ваших изделий.
            {limits && (
              <span className="ml-1">
                {productsTotal} / {limits.maxProducts >= 999_999 ? "∞" : limits.maxProducts} товаров
              </span>
            )}
            {!limits && " Остатки и заказы синхронизируются автоматически"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push("/dashboard/products/archive")}
          >
            <Archive className="mr-2 h-4 w-4" />
            Архив
          </Button>
          <Button
            onClick={() => router.push("/dashboard/products/new")}
            disabled={atProductLimit}
            title={atProductLimit ? "Достигнут лимит товаров по тарифу. Перейдите в раздел «Подписка»" : undefined}
          >
            <Plus className="mr-2 h-4 w-4" />
            Добавить товар
          </Button>
          {isWbConnected && (
            <Button variant="outline" className="border-[#CB11AB] text-[#CB11AB] hover:bg-[#CB11AB]/10 hover:text-[#CB11AB]" onClick={handleImportFromWb} disabled={!!importingMarketplace || atProductLimit} title={atProductLimit ? "Достигнут лимит товаров" : undefined}>
              {importingMarketplace === "WILDBERRIES" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Импорт с WB
            </Button>
          )}
          {isOzonConnected && (
            <>
              <Button variant="outline" className="border-[#005BFF] text-[#005BFF] hover:bg-[#005BFF]/10 hover:text-[#005BFF]" onClick={handleImportFromOzon} disabled={!!importingMarketplace || atProductLimit} title={atProductLimit ? "Достигнут лимит товаров" : undefined}>
                {importingMarketplace === "OZON" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Импорт с Ozon
              </Button>
              <Button variant="ghost" size="sm" onClick={handleOzonFboDebug} title="Диагностика остатков FBO Ozon">
                FBO debug
              </Button>
            </>
          )}
        </div>
      </div>

      {atProductLimit && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4 text-sm flex items-center gap-2">
          <CreditCard className="h-5 w-5 shrink-0" />
          <span>Достигнут лимит товаров по вашему тарифу.</span>
          <Link href="/dashboard/subscription" className="text-primary font-medium hover:underline">
            Перейти на другой план
          </Link>
        </div>
      )}

      {importError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {importError}
        </div>
      )}

      {importJob && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">
              Импорт {importJob.marketplace === "OZON" ? "Ozon" : "WB"}: {importJob.state === "completed" ? "завершён" : importJob.state === "failed" ? "ошибка" : "в процессе"}
            </div>
            <div className="text-xs text-muted-foreground">jobId: {importJob.jobId}</div>
          </div>
          {typeof importJob.progress?.percent === "number" && (
            <>
              <div className="h-2 w-full rounded bg-muted">
                <div
                  className="h-2 rounded bg-primary transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, importJob.progress.percent))}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                {importJob.progress.processed ?? 0} / {importJob.progress.total ?? 0} • {importJob.progress.percent}%
              </div>
            </>
          )}
          {importJob.state === "completed" && importJob.result && (
            <div className="text-sm text-green-700 dark:text-green-400">
              Импортировано: {importJob.result.imported ?? 0}. Пропущено: {importJob.result.skipped ?? 0}.
              {Array.isArray(importJob.result.errors) && importJob.result.errors.length > 0 && (
                <span> Ошибки: {importJob.result.errors.slice(0, 2).join("; ")}</span>
              )}
            </div>
          )}
          {importJob.state === "failed" && (
            <div className="text-sm text-destructive">
              {importJob.failedReason || "Импорт завершился с ошибкой"}
            </div>
          )}
          {(importJob.state === "completed" || importJob.state === "failed") && (
            <div>
              <Button variant="outline" size="sm" onClick={() => setImportJob(null)}>
                Скрыть статус
              </Button>
            </div>
          )}
        </div>
      )}


      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Поиск по артикулу или названию</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Ang002, БУС-001..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium">Склады</Label>
              <div className="flex flex-wrap gap-2">
                {warehouseTabs.map((tab) => {
                  const isSelected = warehouseFilter === tab.value
                  const brandClass = isSelected ? WAREHOUSE_BRAND_CLASS[tab.value] : ""
                  return (
                    <Button
                      key={tab.value}
                      variant={brandClass ? "outline" : isSelected ? "default" : "outline"}
                      size="sm"
                      onClick={() => setWarehouseFilter(tab.value)}
                      className={brandClass || undefined}
                    >
                      {tab.label}
                    </Button>
                  )
                })}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {filteredProducts.length} {filteredProducts.length === 1 ? "товар" : "товаров"}
            </p>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {(stockSaveError || deleteError || fieldSaveError) && (
            <div className="mb-3 rounded-lg border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
              {stockSaveError || deleteError || fieldSaveError}
            </div>
          )}
          <div className="overflow-auto max-h-[calc(100vh-280px)] min-h-[200px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3 w-16">Фото</th>
                  <th className="text-left font-medium p-3">ID</th>
                  <th className="text-left font-medium p-3">Артикул</th>
                  <th className="text-left font-medium p-3">Название</th>
                  {/* {warehouseFilter !== "local" && <th className="text-left font-medium p-3">Описание</th>} */}
                  <th className="text-left font-medium p-3" title="Мой склад, клик для редактирования">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      onClick={() => toggleSort("stockFbs")}
                    >
                      Остаток FBS
                      {sortKey === "stockFbs" && (
                        <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                      )}
                    </button>
                  </th>
                  <th
                    className="text-left font-medium p-3"
                    title={
                      warehouseFilter === "OZON"
                        ? "На складах Ozon"
                        : warehouseFilter === "WILDBERRIES"
                        ? "На складах WB"
                        : "На складах маркетплейсов"
                    }
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      onClick={() => toggleSort("stockFbo")}
                    >
                      Остаток FBO
                      {sortKey === "stockFbo" && (
                        <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                      )}
                    </button>
                  </th>
                  <th className="text-left font-medium p-3" title="Резерв с нашего склада">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      onClick={() => toggleSort("reservedFbs")}
                    >
                      Резерв FBS
                      {sortKey === "reservedFbs" && (
                        <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                      )}
                    </button>
                  </th>
                  <th
                    className="text-left font-medium p-3"
                    title={
                      warehouseFilter === "OZON"
                        ? "Резерв на складах Ozon"
                        : warehouseFilter === "WILDBERRIES"
                        ? "Резерв на складах WB"
                        : "Резерв на складах маркетплейсов"
                    }
                  >
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      onClick={() => toggleSort("reservedFbo")}
                    >
                      Резерв FBO
                      {sortKey === "reservedFbo" && (
                        <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                      )}
                    </button>
                  </th>
                  <th className="text-left font-medium p-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-primary"
                      onClick={() => toggleSort("cost")}
                    >
                      Себестоимость
                      {sortKey === "cost" && (
                        <span>{sortDirection === "desc" ? "↓" : "↑"}</span>
                      )}
                    </button>
                  </th>
                  {warehouseFilter !== "local" && <th className="text-left font-medium p-3">SEO</th>}
                  <th className="text-left font-medium p-3">Маркетплейс</th>
                  <th className="text-right font-medium p-3"></th>
                </tr>
              </thead>
              <tbody>
                {sortedProducts.map((product) => {
                  const mappings = product.marketplaceMappings ?? []
                  const linkedMarketplaces = mappings.length > 0
                    ? mappings.map((m) => m.marketplace)
                    : (product.sku?.startsWith("WB-") ? ["WILDBERRIES"] :
                       product.sku?.startsWith("OZ-") ? ["OZON"] :
                       product.sku?.startsWith("YM-") ? ["YANDEX"] :
                       product.sku?.startsWith("AV-") ? ["AVITO"] : [])
                  const canEdit = warehouseFilter === "local"
                  const isEditingStock = editingStockId === product.id
                  const isSavingStock = stockSavingId === product.id
                  const isEditingF = editingFieldId === product.id
                  const isSavingF = fieldSavingId === product.id
                  const defArticle =
                    product.article ||
                    (product.sku?.startsWith("WB-") ? product.sku.split("-").pop() : null) ||
                    (product.sku?.startsWith("OZ-") ? product.sku.split("-").pop() : null) ||
                    (product.sku?.startsWith("YM-") ? product.sku.split("-").pop() : null) ||
                    ""
                  return (
                    <tr
                      key={product.id}
                      className={`border-b last:border-0 hover:bg-muted/30 ${canEdit ? "cursor-pointer" : ""}`}
                      onClick={
                        canEdit
                          ? () => router.push(`/dashboard/products/${product.id}`)
                          : undefined
                      }
                    >
                      <td className="p-3">
                        {product.imageUrl ? (
                          <img
                            src={proxyImageUrl(product.imageUrl)}
                            alt={product.title}
                            className="h-12 w-12 object-cover rounded-md border"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center border">
                            <Package className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </td>
                      <td className="p-3 font-mono font-medium">
                        {product.displayId != null
                          ? String(product.displayId).padStart(4, "0")
                          : "—"}
                      </td>
                      <td className="p-3">
                        {/* Редактирование артикула — в карточке товара */}
                        <span className="truncate block">{defArticle || "—"}</span>
                      </td>
                      <td className="p-3 font-medium max-w-[200px]">
                        {/* Редактирование названия — в карточке товара */}
                        <span className="truncate block" title={product.title}>{product.title}</span>
                      </td>
                      {/* {warehouseFilter !== "local" && (
                        <td className="p-3 max-w-[140px]">
                          <span className="text-xs text-muted-foreground truncate block max-w-[140px]" title={product.description ?? ""}>
                            {product.description ? (product.description.length > 40 ? product.description.slice(0, 40) + "…" : product.description) : "—"}
                          </span>
                        </td>
                      )} */}
                      <td className="p-3">
                        {canEdit && isEditingStock ? (
                          <Input
                            type="number"
                            min={0}
                            className="h-8 w-20 font-mono"
                            value={editingStockValue}
                            onChange={(e) => setEditingStockValue(e.target.value)}
                            onBlur={() => confirmEditStock(product)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmEditStock(product)
                              if (e.key === "Escape") setEditingStockId(null)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        ) : canEdit ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); startEditStock(product) }}
                            disabled={isSavingStock}
                            className="flex items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-2.5 py-1.5 min-w-[3rem] text-left hover:border-primary/50 hover:bg-muted/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSavingStock ? (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                            ) : (
                              <>
                                <span className="font-medium tabular-nums">{product.stock ?? 0}</span>
                                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60" />
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="font-medium tabular-nums">{product.stock ?? 0}</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground tabular-nums">
                        {(() => {
                          // Показываем остаток FBO для выбранного маркетплейса
                          if (warehouseFilter === "WILDBERRIES") {
                            return wbStockFbo[product.id] != null ? wbStockFbo[product.id] : "—"
                          } else if (warehouseFilter === "OZON") {
                            return ozonStockFbo[product.id] != null ? ozonStockFbo[product.id] : "—"
                          } else {
                            // Для "Мой склад" — сумма FBO по всем маркетплейсам (WB + Ozon)
                            const wbStock = wbStockFbo[product.id] ?? 0
                            const ozonStock = ozonStockFbo[product.id] ?? 0
                            const total = wbStock + ozonStock
                            return total > 0 ? total : "—"
                          }
                        })()}
                      </td>
                      <td className="p-3 text-muted-foreground tabular-nums">{product.reservedFbs ?? 0}</td>
                      <td className="p-3 text-muted-foreground tabular-nums">{product.reservedFbo ?? 0}</td>
                      <td className="p-3">
                        {canEdit && isEditingF && editingField === "cost" ? (
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            className="h-8 w-24 font-mono"
                            value={editingFieldValue}
                            onChange={(e) => setEditingFieldValue(e.target.value)}
                            onBlur={() => confirmEditField(product)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmEditField(product)
                              if (e.key === "Escape") setEditingFieldId(null)
                            }}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                          />
                        ) : canEdit ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); startEditField(product, "cost") }}
                            disabled={isSavingF}
                            className="flex items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-2.5 py-1.5 min-w-[4rem] text-left hover:border-primary/50 hover:bg-muted/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSavingF && editingField === "cost" ? (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                            ) : (
                              <>
                                <span className="font-medium tabular-nums">{Number(product.cost).toLocaleString("ru-RU")} ₽</span>
                                <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-60" />
                              </>
                            )}
                          </button>
                        ) : (
                          <span className="font-medium tabular-nums">{Number(product.cost).toLocaleString("ru-RU")} ₽</span>
                        )}
                      </td>
                      {warehouseFilter !== "local" && (
                        <td className="p-3 max-w-[120px]">
                          <span className="text-xs text-muted-foreground">{product.seoTitle || product.seoKeywords ? "✓" : "—"}</span>
                        </td>
                      )}
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {linkedMarketplaces.length > 0 ? (
                            [...linkedMarketplaces]
                              .sort((a, b) => MARKETPLACE_ORDER.indexOf(a) - MARKETPLACE_ORDER.indexOf(b))
                              .map((m) => {
                                const style = MARKETPLACE_BADGE_STYLE[m]
                                return (
                                  <Badge
                                    key={m}
                                    variant="secondary"
                                    className="text-[10px] px-1.5 py-0 font-medium border-0"
                                    style={style ? { backgroundColor: style.bg, color: style.text } : undefined}
                                    title={m === "WILDBERRIES" ? "Wildberries" : m === "OZON" ? "Ozon" : m === "YANDEX" ? "Яндекс Маркет" : m === "AVITO" ? "Avito" : m}
                                  >
                                    {m === "WILDBERRIES" ? "WB" : m === "OZON" ? "OZ" : m === "YANDEX" ? "Я" : m === "AVITO" ? "AV" : m.slice(0, 2)}
                                  </Badge>
                                )
                              })
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); openHistory(product) }}
                          >
                            <History className="mr-1.5 h-3.5 w-3.5" />
                            История
                          </Button>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleArchive(product) }}
                              disabled={deletingId === product.id}
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              title="Архивировать товар"
                            >
                              {deletingId === product.id ? (
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Archive className="mr-1.5 h-3.5 w-3.5" />
                              )}
                              Архив
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div ref={loadMoreRef} className="mt-2 h-8 flex items-center justify-center text-xs text-muted-foreground">
            {loadingMore ? "Загрузка..." : hasMore ? "Прокрутите вниз для загрузки" : "Все записи загружены"}
          </div>
        </CardContent>
      </Card>

      {filteredProducts.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {products.length === 0 ? "Нет товаров" : "Нет товаров на выбранном складе"}
            </h3>
            <p className="text-muted-foreground mb-4 max-w-md mx-auto">
              {products.length === 0
                ? "Подключите Wildberries и нажмите «Импорт с Wildberries», чтобы загрузить товары в каталог."
                : warehouseFilter === "local"
                  ? "Добавьте товары в каталог."
                  : `Нет товаров со связкой на ${warehouseTabs.find((o) => o.value === warehouseFilter)?.label ?? ""}. Выгрузите товары на маркетплейс из карточки.`}
            </p>
            {products.length === 0 && !isWbConnected && (
              <Button variant="outline" onClick={() => router.push("/dashboard/marketplaces")}>
                Подключить маркетплейс
              </Button>
            )}
            {products.length > 0 && warehouseFilter !== "local" && (
              <Button variant="outline" onClick={() => setWarehouseFilter("local")}>
                Показать все товары
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Модалка истории остатков */}
      {historyProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeHistory}
        >
          <div
            className="bg-background rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b">
              <h3 className="font-semibold">История изменений: {historyProduct.title}</h3>
              <p className="text-sm text-muted-foreground">
                {historyProduct.article || historyProduct.sku} · остаток: {historyProduct.stock ?? 0}
              </p>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {historyLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : historyEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Записей пока нет</p>
              ) : (
                <div className="space-y-2">
                  {historyEntries.map((entry) => {
                    const who = formatWho(entry)
                    const date = formatDate(entry)
                    const meta = (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {date} · {who}
                      </span>
                    )
                    if (entry.type === "stock") {
                      const sourceLabel = SOURCE_LABELS[entry.source] || entry.source
                      return (
                        <div
                          key={entry.id}
                          className="rounded border p-3 text-sm space-y-1"
                        >
                          <div className="flex flex-wrap gap-2 items-center">
                            {meta}
                            <Badge variant="secondary" className="shrink-0 text-xs font-normal">
                              {sourceLabel}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-2 items-center">
                            <span
                              className={
                                entry.delta > 0
                                  ? "text-green-600 font-medium"
                                  : "text-destructive font-medium"
                              }
                            >
                              {entry.delta > 0 ? "+" : ""}{entry.delta}
                            </span>
                            <span className="text-muted-foreground">
                              {entry.quantityBefore} → {entry.quantityAfter}
                            </span>
                            {entry.note && (
                              <span className="text-muted-foreground text-xs truncate" title={entry.note}>
                                {entry.note}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    }
                    const fieldLabel = FIELD_LABELS[entry.field] || entry.field
                    return (
                      <div
                        key={entry.id}
                        className="rounded border p-3 text-sm space-y-1"
                      >
                        <div className="flex flex-wrap gap-2 items-center">
                          {meta}
                          <Badge variant="outline" className="shrink-0 text-xs font-normal">
                            {fieldLabel}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center text-muted-foreground">
                          <span className="truncate max-w-[120px]" title={entry.oldValue ?? ""}>
                            {entry.oldValue || "—"}
                          </span>
                          <span>→</span>
                          <span className="truncate max-w-[120px]" title={entry.newValue ?? ""}>
                            {entry.newValue || "—"}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t">
              <Button variant="outline" className="w-full" onClick={closeHistory}>
                Закрыть
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
