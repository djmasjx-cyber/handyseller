import { type NextRequest, NextResponse } from "next/server"

/** Подсказки адресов РФ через DaData (ключи только на сервере). */
export async function POST(req: NextRequest) {
  let body: { query?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ suggestions: [] }, { status: 400 })
  }
  const query = typeof body.query === "string" ? body.query.trim() : ""
  if (query.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  const token = process.env.DADATA_TOKEN?.trim()
  if (!token) {
    return NextResponse.json({
      suggestions: [],
      configured: false,
      hint: "Задайте DADATA_TOKEN в окружении web для подсказок адресов.",
    })
  }

  try {
    const res = await fetch("https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Token ${token}`,
      },
      body: JSON.stringify({
        query,
        count: 8,
      }),
      cache: "no-store",
    })
    if (!res.ok) {
      return NextResponse.json({ suggestions: [], error: "dadata_http" }, { status: 200 })
    }
    const data = (await res.json()) as {
      suggestions?: Array<{ value?: string; unrestricted_value?: string }>
    }
    const suggestions = (data.suggestions ?? []).map((s) => ({
      label: s.value ?? "",
      value: (s.unrestricted_value ?? s.value ?? "").trim(),
    }))
    return NextResponse.json({ suggestions, configured: true })
  } catch {
    return NextResponse.json({ suggestions: [], error: "dadata_fetch" })
  }
}
