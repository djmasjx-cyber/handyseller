"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button, Card, CardContent, Badge } from "@handyseller/ui"
import Link from "next/link"
import { Archive, Loader2, ArchiveRestore, ArrowLeft, Package } from "lucide-react"

interface Product {
  id: string
  displayId?: number
  title: string
  article?: string
  sku?: string
  price: string | number
  stock?: number
  archivedAt?: string | null
  marketplaceMappings?: { marketplace: string }[]
}

const MARKETPLACE_BADGE_STYLE: Record<string, { bg: string; text: string }> = {
  WILDBERRIES: { bg: "#CB11AB", text: "#ffffff" },
  OZON: { bg: "#005BFF", text: "#ffffff" },
  YANDEX: { bg: "#FC3F1D", text: "#ffffff" },
  AVITO: { bg: "#7FBA00", text: "#ffffff" },
}

function formatArchivedAt(iso?: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function ProductsArchivePage() {
  const router = useRouter()
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null

  const fetchArchived = () => {
    if (!token) return
    fetch("/api/products/archive", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]))
  }

  useEffect(() => {
    if (!token) {
      router.push("/login")
      return
    }
    fetchArchived()
    setLoading(false)
  }, [router, token])

  const handleRestore = async (product: Product) => {
    if (!token) return
    if (!confirm(`Восстановить товар «${product.title}» в каталог?`)) return
    setRestoringId(product.id)
    setRestoreError(null)
    try {
      const res = await fetch(`/api/products/${product.id}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message.join(", ") : data.message || `Ошибка ${res.status}`
        setRestoreError(msg)
        return
      }
      setProducts((prev) => prev.filter((p) => p.id !== product.id))
    } finally {
      setRestoringId(null)
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
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Archive className="h-8 w-8" />
            Архив товаров
          </h1>
          <p className="text-muted-foreground">
            Архивированные товары можно восстановить в каталог.
          </p>
        </div>
        <Link href="/dashboard/products">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            К товарам
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          {restoreError && (
            <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
              {restoreError}
            </div>
          )}
          {products.length === 0 ? (
            <div className="py-12 text-center">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Архив пуст</h3>
              <p className="text-muted-foreground mb-4">
                Архивированные товары появятся здесь, когда вы нажмёте «Архивировать» в каталоге.
              </p>
              <Link href="/dashboard/products">
                <Button variant="outline">К товарам</Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left font-medium p-3">ID</th>
                    <th className="text-left font-medium p-3">Артикул</th>
                    <th className="text-left font-medium p-3">Название</th>
                    <th className="text-left font-medium p-3">Остаток</th>
                    <th className="text-left font-medium p-3">Цена</th>
                    <th className="text-left font-medium p-3">Маркетплейс</th>
                    <th className="text-left font-medium p-3">Дата архива</th>
                    <th className="text-right font-medium p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const mappings = product.marketplaceMappings ?? []
                    const linkedMarketplaces = mappings.length > 0
                      ? mappings.map((m) => m.marketplace)
                      : (product.sku?.startsWith("WB-") ? ["WILDBERRIES"] :
                         product.sku?.startsWith("OZ-") ? ["OZON"] :
                         product.sku?.startsWith("YM-") ? ["YANDEX"] :
                         product.sku?.startsWith("AV-") ? ["AVITO"] : [])
                    return (
                      <tr key={product.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 font-mono font-medium">
                          {product.displayId != null ? String(product.displayId).padStart(4, "0") : product.id.slice(0, 8)}
                        </td>
                        <td className="p-3">{product.article || product.sku || "—"}</td>
                        <td className="p-3 font-medium">{product.title || "—"}</td>
                        <td className="p-3">{product.stock ?? 0}</td>
                        <td className="p-3">{String(product.price ?? "—")}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {linkedMarketplaces.length > 0 ? (
                              linkedMarketplaces.map((m) => {
                                const style = MARKETPLACE_BADGE_STYLE[m] ?? { bg: "#6b7280", text: "#fff" }
                                return (
                                  <Badge key={m} style={{ backgroundColor: style.bg, color: style.text }} className="font-normal">
                                    {m === "WILDBERRIES" ? "WB" : m === "OZON" ? "OZ" : m === "YANDEX" ? "Я" : m === "AVITO" ? "AV" : m.slice(0, 2)}
                                  </Badge>
                                )
                              })
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-muted-foreground">{formatArchivedAt(product.archivedAt)}</td>
                        <td className="p-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestore(product)}
                            disabled={restoringId === product.id}
                          >
                            {restoringId === product.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <>
                                <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" />
                                Восстановить
                              </>
                            )}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
