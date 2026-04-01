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
  const scheme = req.nextUrl.searchParams.get("scheme") ?? ""
  const url = `${API_BASE}/finance/products${scheme ? `?scheme=${scheme}` : ""}`
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => [])
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Сервер недоступен" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  // PATCH /api/finance/products?productId=xxx
  const productId = req.nextUrl.searchParams.get("productId")
  if (!productId) return NextResponse.json({ error: "productId required" }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  try {
    const res = await fetch(`${API_BASE}/finance/products/${productId}/cost`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Сервер недоступен" }, { status: 500 })
  }
}
