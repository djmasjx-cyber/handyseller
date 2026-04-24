import { NextRequest, NextResponse } from "next/server"
import { API_BASE } from "@/lib/api"
import { TMS_API_BASE } from "@/lib/tms-api"

export const dynamic = "force-dynamic"

function getToken(req: NextRequest): string | null {
  const auth = req.headers.get("authorization")
  if (auth?.startsWith("Bearer ")) return auth.slice(7)
  return null
}

/**
 * Core API ownership is intentionally narrow:
 * - OAuth and integration-client management stay in core.
 * - Transport API (`/tms/v1/*`) is owned by `tms-api`.
 */
function useCoreApi(path: string[]): boolean {
  const head = path[0]
  return head === "oauth" || head === "integration-clients" || head === "openapi.yaml"
}

function resolveTarget(req: NextRequest, path: string[]): string {
  const qs = req.nextUrl.searchParams.toString()
  const q = qs ? `?${qs}` : ""
  const [scope, ...rest] = path
  if (useCoreApi(path)) {
    return `${API_BASE}/tms/${path.join("/")}${q}`
  }
  // Legacy compatibility path: `/tms/core/*` remains routed to core while clients migrate.
  if (scope === "core") {
    return `${API_BASE}/tms/${rest.join("/")}${q}`
  }
  return `${TMS_API_BASE}/tms/${path.join("/")}${q}`
}

function isPublicOpenApiRoute(req: NextRequest, path: string[]): boolean {
  return req.method === "GET" && path.length === 1 && path[0] === "openapi.yaml"
}

function isPublicOAuthTokenRoute(req: NextRequest, path: string[]): boolean {
  return req.method === "POST" && path.length === 2 && path[0] === "oauth" && path[1] === "token"
}

/** `Response.text()` перекодирует тело в UTF-8 и портит бинарные ответы (PDF, стикеры и т.д.). */
function isBinaryUpstreamContentType(contentType: string | null): boolean {
  if (!contentType) return false
  const base = contentType.toLowerCase().split(";")[0].trim()
  if (base === "application/pdf") return true
  if (base === "application/octet-stream") return true
  if (base === "application/zip") return true
  if (base.startsWith("image/")) return true
  if (base.startsWith("audio/")) return true
  if (base.startsWith("video/")) return true
  return false
}

function isShipmentDocumentFileDownload(path: string[], method: string): boolean {
  return (
    method === "GET" &&
    path.length >= 5 &&
    path[0] === "shipments" &&
    path[2] === "documents" &&
    path[4] === "file"
  )
}

function buildUpstreamResponseHeaders(res: Response): Headers {
  const h = new Headers()
  const ct = res.headers.get("content-type")
  if (ct) h.set("Content-Type", ct)
  const cd = res.headers.get("content-disposition")
  if (cd) h.set("Content-Disposition", cd)
  const cl = res.headers.get("content-length")
  if (cl) h.set("Content-Length", cl)
  return h
}

async function proxy(req: NextRequest, path: string[]) {
  const token = getToken(req)
  const isPublicRoute = isPublicOpenApiRoute(req, path) || isPublicOAuthTokenRoute(req, path)
  if (!token && !isPublicRoute) {
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
    const upstreamCt = res.headers.get("content-type")
    const useBinaryBody =
      isBinaryUpstreamContentType(upstreamCt) || isShipmentDocumentFileDownload(path, req.method)
    const headers = buildUpstreamResponseHeaders(res)

    if (useBinaryBody) {
      const body = await res.arrayBuffer()
      return new NextResponse(body, { status: res.status, headers })
    }

    const text = await res.text()
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", upstreamCt ?? "application/json")
    }
    return new NextResponse(text, { status: res.status, headers })
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
