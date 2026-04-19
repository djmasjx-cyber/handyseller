import { type NextRequest, NextResponse } from "next/server"

const DADATA_URL = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address"

function resolveDadataKeys(): { token: string | null; secret: string | null } {
  const token =
    process.env.DADATA_TOKEN?.trim() ||
    process.env.DADATA_API_KEY?.trim() ||
    process.env.NEXT_SERVER_DADATA_TOKEN?.trim() ||
    null
  const secret =
    process.env.DADATA_SECRET?.trim() ||
    process.env.DADATA_SECRET_KEY?.trim() ||
    process.env.NEXT_SERVER_DADATA_SECRET?.trim() ||
    null
  return { token, secret }
}

/** Подсказки адресов (РФ и др.) через DaData REST API. Ключи только на сервере. */
export async function POST(req: NextRequest) {
  let body: { query?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ suggestions: [], error: "bad_json" }, { status: 400 })
  }
  const query = typeof body.query === "string" ? body.query.trim() : ""
  if (query.length < 1) {
    return NextResponse.json({ suggestions: [] })
  }

  const { token, secret } = resolveDadataKeys()
  if (!token) {
    return NextResponse.json({
      suggestions: [],
      configured: false,
      hint: "Задайте DADATA_TOKEN или DADATA_API_KEY в окружении сервера web.",
    })
  }

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Token ${token}`,
    }
    // Пара «ключ + секрет» из личного кабинета DaData (часто требуется для платных тарифов).
    if (secret) {
      headers["X-Secret"] = secret
    }

    const res = await fetch(DADATA_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        count: 10,
      }),
      cache: "no-store",
    })

    const rawText = await res.text()
    if (!res.ok) {
      let detail = ""
      try {
        const errJson = JSON.parse(rawText) as { message?: string; family?: string }
        detail = errJson.message || errJson.family || ""
      } catch {
        detail = rawText.slice(0, 200)
      }
      return NextResponse.json({
        suggestions: [],
        configured: true,
        error: "dadata_http",
        status: res.status,
        // Не отдаём ключи; короткая подсказка для админа в логах/сети.
        detail: res.status === 401 || res.status === 403 ? "Проверьте DADATA_TOKEN и при необходимости DADATA_SECRET" : detail,
      })
    }

    let data: {
      suggestions?: Array<{ value?: string; unrestricted_value?: string; data?: { qc?: number } }>
    }
    try {
      data = JSON.parse(rawText) as typeof data
    } catch {
      return NextResponse.json({ suggestions: [], configured: true, error: "dadata_parse" })
    }

    const suggestions = (data.suggestions ?? [])
      .map((s) => ({
        label: (s.value ?? "").trim(),
        value: (s.unrestricted_value ?? s.value ?? "").trim(),
      }))
      .filter((s) => s.label.length > 0)

    return NextResponse.json({ suggestions, configured: true })
  } catch {
    return NextResponse.json({ suggestions: [], configured: true, error: "dadata_fetch" })
  }
}
