export function normalizeMessageLines(value: unknown): string[] {
  if (typeof value === "string") {
    const msg = value.trim()
    return msg ? [msg] : []
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => normalizeMessageLines(item)).filter(Boolean)
  }
  if (value && typeof value === "object") {
    return normalizeMessageLines((value as { message?: unknown }).message)
  }
  return []
}

export function extractApiError(errorBody: unknown, fallback: string): { message: string; details: string[] } {
  const lines = [...new Set(normalizeMessageLines(errorBody))]
  if (lines.length === 0) return { message: fallback, details: [] }
  return {
    message: lines[0] ?? fallback,
    details: lines.slice(1),
  }
}
