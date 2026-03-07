import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

import { API_BASE } from "@/lib/api"

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization")
  if (auth?.startsWith("Bearer ")) return auth.slice(7)
  return null
}

export async function POST(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  try {
    const { searchParams } = new URL(req.url)
    const since = searchParams.get("since") ?? ""
    const days = searchParams.get("days") ?? ""
    const params = new URLSearchParams()
    if (since) params.set("since", since)
    else if (days) params.set("days", days)
    const qs = params.toString()
    const url = qs ? `${API_BASE}/orders/sync?${qs}` : `${API_BASE}/orders/sync`
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Сервер недоступен" }, { status: 500 })
  }
}
