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
  const limit = req.nextUrl.searchParams.get("limit") ?? "20"
  const offset = req.nextUrl.searchParams.get("offset") ?? "0"

  const params = new URLSearchParams({ limit, offset })
  if (scheme) params.set("scheme", scheme)
  const url = `${API_BASE}/finance/products/paged?${params.toString()}`

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Сервер недоступен" }, { status: 500 })
  }
}
