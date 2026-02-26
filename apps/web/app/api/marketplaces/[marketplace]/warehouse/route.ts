import { NextRequest, NextResponse } from "next/server"
import { API_BASE } from "@/lib/api"

export const dynamic = "force-dynamic"

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization")
  if (auth?.startsWith("Bearer ")) return auth.slice(7)
  return null
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ marketplace: string }> }
) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  const { marketplace } = await params
  if (!marketplace) return NextResponse.json({ error: "Маркетплейс не указан" }, { status: 400 })
  try {
    const body = await req.json().catch(() => ({}))
    const res = await fetch(
      `${API_BASE}/marketplaces/${encodeURIComponent(marketplace)}/warehouse`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Сервер недоступен" }, { status: 500 })
  }
}
