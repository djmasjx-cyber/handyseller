import { NextRequest, NextResponse } from "next/server"
import { API_BASE } from "@/lib/api"
import { TMS_API_BASE } from "@/lib/tms-api"

export const dynamic = "force-dynamic"

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization")
  if (auth?.startsWith("Bearer ")) return auth.slice(7)
  return null
}

/** Маршруты основного Nest API (учётки, OAuth, OpenAPI), остальное — tms-api. */
function useCoreApi(path: string[]): boolean {
  const head = path[0]
  return head === "core" || head === "oauth" || head === "integration-clients" || head === "openapi.yaml"
}

function resolveTarget(req: NextRequest, path: string[]): string {
  const qs = req.nextUrl.searchParams.toString()
  const q = qs ? `?${qs}` : ""
  const [scope, ...rest] = path
  if (scope === "core") {
    return `${API_BASE}/tms/${rest.join("/")}${q}`
  }
  if (useCoreApi(path)) {
    return `${API_BASE}/tms/${path.join("/")}${q}`
  }
  return `${TMS_API_BASE}/tms/${path.join("/")}${q}`
}

function isPublicOpenApiRoute(req: NextRequest, path: string[]): boolean {
  return req.method === "GET" && path.length === 1 && path[0] === "openapi.yaml"
}

async function proxy(req: NextRequest, path: string[]) {
  const token = getToken(req)
  const publicSpec = isPublicOpenApiRoute(req, path)
  if (!token && !publicSpec) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  const init: RequestInit = {
    method: req.method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
    return NextResponse.json({ error: "TMS сервис недоступен" }, { status: 502 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
