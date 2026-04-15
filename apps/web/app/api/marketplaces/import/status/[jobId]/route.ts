import { NextRequest, NextResponse } from "next/server"
import { API_BASE } from "@/lib/api"

export const dynamic = "force-dynamic"

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization")
  if (auth?.startsWith("Bearer ")) return auth.slice(7)
  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const token = getToken(req)
  if (!token) return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  const { jobId } = await params
  if (!jobId?.trim()) return NextResponse.json({ error: "Не указан jobId" }, { status: 400 })

  try {
    const res = await fetch(`${API_BASE}/marketplaces/import/status/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json(data, { status: res.status })
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: "Сервер недоступен" }, { status: 500 })
  }
}
