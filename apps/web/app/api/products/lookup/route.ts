import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

import { API_BASE } from "@/lib/api"

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization")
  if (auth?.startsWith("Bearer ")) return auth.slice(7)
  return null
}

export async function GET(req: NextRequest) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q") ?? ""
  try {
    const res = await fetch(`${API_BASE}/products/lookup?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return NextResponse.json(data ?? { error: "Ошибка" }, { status: res.status })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Сервер недоступен" }, { status: 500 })
  }
}
