import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password } = body
    if (!email || !password) {
      return NextResponse.json(
        { error: "Введите email и пароль" },
        { status: 400 }
      )
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Пароль должен быть не менее 6 символов" },
        { status: 400 }
      )
    }

    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: data.message ?? "Неверный email или пароль" },
        { status: res.status }
      )
    }

    const response = NextResponse.json({ accessToken: data.accessToken, user: data.user })
    const setCookie = res.headers.get("set-cookie")
    if (setCookie) response.headers.append("Set-Cookie", setCookie)
    const displayName = data.user?.name?.trim() || (data.user?.email?.split("@")[0] || "Пользователь")
    response.headers.append(
      "Set-Cookie",
      `user_name=${encodeURIComponent(displayName)}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`
    )
    return response
  } catch {
    return NextResponse.json(
      { error: "Сервер недоступен. Попробуйте позже." },
      { status: 500 }
    )
  }
}
