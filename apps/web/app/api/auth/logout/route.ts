import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000"

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie") ?? ""
    const res = await fetch(`${API_URL}/api/auth/logout`, {
      method: "POST",
      headers: { Cookie: cookieHeader },
      credentials: "include",
    })
    const response = NextResponse.json({ ok: true })
    response.headers.append("Set-Cookie", "user_name=; Path=/; Max-Age=0")
    const setCookie = res.headers.get("set-cookie")
    if (setCookie) response.headers.append("Set-Cookie", setCookie)
    return response
  } catch {
    const response = NextResponse.json({ ok: true })
    response.headers.append("Set-Cookie", "user_name=; Path=/; Max-Age=0")
    return response
  }
}
