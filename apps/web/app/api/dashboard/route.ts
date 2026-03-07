import { NextRequest, NextResponse } from "next/server"
import { API_BASE } from "@/lib/api"

export const dynamic = "force-dynamic"

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization")
  if (auth?.startsWith("Bearer ")) return auth.slice(7)
  return null
}

export async function GET(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  try {
    const headers = { Authorization: `Bearer ${token}` }
    // Календарный месяц: с 1-го числа текущего месяца
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const since = monthStart.toISOString()
    const [productsRes, ordersRes, statisticsRes, linkedProductsRes, connectionsRes, userRes] =
      await Promise.all([
        fetch(`${API_BASE}/products`, { headers }),
        fetch(`${API_BASE}/marketplaces/orders?since=${encodeURIComponent(since)}`, { headers }),
        fetch(`${API_BASE}/marketplaces/statistics`, { headers }),
        fetch(`${API_BASE}/marketplaces/linked-products-stats`, { headers }),
        fetch(`${API_BASE}/marketplaces/user`, { headers }),
        fetch(`${API_BASE}/users/me`, { headers }),
      ])

    const products = productsRes.ok ? await productsRes.json().catch(() => []) : []
    const orders = ordersRes.ok ? await ordersRes.json().catch(() => []) : []
    const connections = connectionsRes.ok ? await connectionsRes.json().catch(() => []) : []

    const productsListRaw = Array.isArray(products) ? products : []
    // Уникальные товары по id (как на странице "Мой склад")
    const uniqueProductsMap = new Map<string, unknown>()
    for (const p of productsListRaw as Array<{ id?: string; [k: string]: unknown }>) {
      if (p?.id && !uniqueProductsMap.has(p.id)) {
        uniqueProductsMap.set(p.id, p)
      }
    }
    const productsList = Array.from(uniqueProductsMap.values())
    let ordersList = Array.isArray(orders) ? orders : []
    // Обогащаем заказы названиями товаров из каталога (по productId/nmId в sku)
    const productBySku = new Map<string, { title: string }>()
    for (const p of productsList as Array<{ sku?: string; title?: string }>) {
      if (p?.sku) productBySku.set(p.sku, { title: p.title ?? "" })
    }
    ordersList = ordersList.map((o: { productId?: string; productName?: string; [k: string]: unknown }) => {
      const pid = String(o?.productId ?? "")
      for (const [sku, prod] of productBySku) {
        if (sku.includes(pid)) return { ...o, productName: prod.title || o.productName }
      }
      return o
    })

    const rawStats = statisticsRes.ok ? await statisticsRes.json().catch(() => ({})) : {}
    const linkedStats = linkedProductsRes.ok ? await linkedProductsRes.json().catch(() => null) : null
    const stats =
      rawStats && typeof rawStats === "object" && "statistics" in rawStats
        ? (rawStats as { statistics: Record<string, { totalProducts?: number; totalOrders?: number; revenue?: number; lastSyncAt?: string; linkedProductsCount?: number }> }).statistics
        : (rawStats as Record<string, { totalProducts?: number; totalOrders?: number; revenue?: number; lastSyncAt?: string; linkedProductsCount?: number }>)
    const totalUniqueLinkedProducts =
      linkedStats && typeof linkedStats === "object" && "totalUnique" in linkedStats
        ? Number((linkedStats as { totalUnique?: number }).totalUnique)
        : typeof rawStats === "object" && rawStats !== null && "totalUniqueLinkedProducts" in rawStats
          ? Number((rawStats as { totalUniqueLinkedProducts?: number }).totalUniqueLinkedProducts)
          : undefined
    const conns = Array.isArray(connections) ? connections : []
    const userData = userRes.ok ? await userRes.json().catch(() => ({})) : {}
    const userName = userData?.name ?? null

    const linkedByMp = (linkedStats && typeof linkedStats === "object" && "byMarketplace" in linkedStats
      ? (linkedStats as { byMarketplace?: Record<string, number> }).byMarketplace
      : {}) as Record<string, number>

    const mergedStats: Record<string, { totalProducts?: number; totalOrders?: number; revenue?: number; lastSyncAt?: string; linkedProductsCount?: number }> = {}
    for (const [key, s] of Object.entries(stats)) {
      mergedStats[key] = { ...s, linkedProductsCount: linkedByMp[key] ?? (s as { linkedProductsCount?: number }).linkedProductsCount }
    }
    for (const key of Object.keys(linkedByMp)) {
      if (!mergedStats[key]) mergedStats[key] = { totalProducts: 0, totalOrders: 0, revenue: 0, lastSyncAt: undefined, linkedProductsCount: linkedByMp[key] }
    }

    let totalRevenue = 0
    let totalOrders = 0
    let totalProductsOnMarketplaces = totalUniqueLinkedProducts ?? 0
    if (totalProductsOnMarketplaces === 0) {
      for (const s of Object.values(stats) as Array<{ revenue?: number; totalOrders?: number; totalProducts?: number }>) {
        totalRevenue += s?.revenue ?? 0
        totalOrders += s?.totalOrders ?? 0
        totalProductsOnMarketplaces += s?.totalProducts ?? 0
      }
    } else {
      for (const s of Object.values(stats) as Array<{ revenue?: number; totalOrders?: number }>) {
        totalRevenue += s?.revenue ?? 0
        totalOrders += s?.totalOrders ?? 0
      }
    }

    const newOrders = ordersList.filter((o: { status?: string }) =>
      ["NEW", "new", "1"].includes(String(o?.status ?? ""))
    )
    const ordersRequireAttention = newOrders.length

    const marketplaceNames = conns
      .map((c: { type?: string; marketplace?: string }) => c?.type ?? c?.marketplace ?? "")
      .filter(Boolean)
    const mpLabel =
      marketplaceNames.length > 0
        ? marketplaceNames.join(", ").replace(/WILDBERRIES/gi, "WB").replace(/YANDEX/gi, "Яндекс")
        : "—"

    // Агрегация по статусам из уже загруженных заказов — без доп. запроса к БД
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59)
    const rawToGroup = (s: string): "delivered" | "shipped" | "inProgress" | "cancelled" | null => {
      const k = (s ?? "").toLowerCase().replace(/\s/g, "")
      if (["sold", "receive", "delivered"].includes(k)) return "delivered"
      if (["complete", "deliver", "sorted", "shipped", "ready_for_pickup", "delivering", "delivery", "pickup"].includes(k)) return "shipped"
      if (["new", "confirm", "confirmed", "waiting", "awaiting_packaging", "awaiting_deliver", "processing"].includes(k)) return "inProgress"
      if (["cancelled", "canceled", "cancel", "reject", "rejected", "awaiting_packaging_cancelled", "cancelled_by_seller", "cancelled_by_client", "canceled_by_seller", "canceled_by_client", "declined_by_client", "customer_refused"].includes(k)) return "cancelled"
      return null
    }
    const ordersStatsByStatus: Record<string, { delivered: { count: number; sum: number }; shipped: { count: number; sum: number }; inProgress: { count: number; sum: number }; cancelled: { count: number; sum: number } }> = {}
    const empty = () => ({ count: 0, sum: 0 })
    for (const o of ordersList as Array<{ status?: string; rawStatus?: string; amount?: number; marketplace?: string; createdAt?: string }>) {
      const createdAt = o.createdAt ? new Date(o.createdAt) : null
      if (!createdAt || createdAt < monthStart || createdAt > monthEnd) continue
      const mp = (o.marketplace ?? "").toUpperCase()
      if (!mp || mp === "MANUAL") continue
      const statusRaw = (o.rawStatus ?? o.status ?? "").toString()
      const group = rawToGroup(statusRaw) ?? "inProgress"
      if (!ordersStatsByStatus[mp]) ordersStatsByStatus[mp] = { delivered: empty(), shipped: empty(), inProgress: empty(), cancelled: empty() }
      const stats = ordersStatsByStatus[mp][group]
      stats.count += 1
      stats.sum += Math.round((Number(o.amount ?? 0) || 0) * 100) / 100
    }
    for (const key of Object.keys(ordersStatsByStatus)) {
      for (const g of ["delivered", "shipped", "inProgress", "cancelled"] as const) {
        ordersStatsByStatus[key][g].sum = Math.round(ordersStatsByStatus[key][g].sum * 100) / 100
      }
    }

    return NextResponse.json({
      products: productsList,
      orders: ordersList,
      statistics: mergedStats,
      connections: conns,
      userName,
      ordersStatsByStatus,
      summary: {
        totalProducts: productsList.length,
        totalProductsOnMarketplaces,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalOrders,
        newOrdersCount: newOrders.length,
        ordersRequireAttention,
        connectedMarketplaces: conns.length,
        marketplaceLabel: mpLabel,
      },
    })
  } catch {
    return NextResponse.json({ error: "Сервер недоступен" }, { status: 500 })
  }
}
