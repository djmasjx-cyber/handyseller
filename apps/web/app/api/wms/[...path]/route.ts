import { NextRequest, NextResponse } from "next/server"
import { WMS_API_BASE } from "@/lib/wms-api"

export const dynamic = "force-dynamic"

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization")
  if (auth?.startsWith("Bearer ")) return auth.slice(7)
  return req.cookies.get("token")?.value ?? null
}

function resolveTarget(req: NextRequest, path: string[]): string {
  const qs = req.nextUrl.searchParams.toString()
  const q = qs ? `?${qs}` : ""
  return `${WMS_API_BASE}/wms/${path.join("/")}${q}`
}

async function proxy(req: NextRequest, path: string[]) {
  const token = getToken(req)
  if (!token) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  const init: RequestInit = {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": req.headers.get("content-type") ?? "application/json",
    },
    cache: "no-store",
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text()
  }

  try {
    const res = await fetch(resolveTarget(req, path), init)
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" },
    })
  } catch {
    return NextResponse.json({ error: "WMS сервис недоступен" }, { status: 502 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
