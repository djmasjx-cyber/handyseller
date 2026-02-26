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
    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from") ?? ""
    const to = searchParams.get("to") ?? ""
    const q = new URLSearchParams()
    if (from) q.set("from", from)
    if (to) q.set("to", to)
    const query = q.toString()
    const res = await fetch(`${API_BASE}/analytics/products${query ? `?${query}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Сервер недоступен" }, { status: 500 })
  }
}
