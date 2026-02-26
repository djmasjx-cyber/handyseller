import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000"

function userCookie(name: string) {
  const value = encodeURIComponent(name)
  return `user_name=${value}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, email, password, phone } = body
    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Заполните имя, email и пароль" },
        { status: 400 }
      )
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Пароль должен быть не менее 6 символов" },
        { status: 400 }
      )
    }

    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, phone: phone || undefined }),
      credentials: "include",
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return NextResponse.json(
        { error: Array.isArray(data.message) ? data.message[0] : data.message || "Ошибка регистрации" },
        { status: res.status }
      )
    }

    const response = NextResponse.json({ ok: true, accessToken: data.accessToken, user: data.user })
    response.headers.append("Set-Cookie", userCookie(data.user?.name ?? name))
    const setCookie = res.headers.get("set-cookie")
    if (setCookie) response.headers.append("Set-Cookie", setCookie)
    return response
  } catch {
    return NextResponse.json(
      { error: "Сервер недоступен. Убедитесь, что API запущен." },
      { status: 500 }
    )
  }
}
