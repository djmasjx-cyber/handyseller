/** Общие подписи/разбор ошибок WMS в UI. */

const VGH_FIELD_RU: Record<string, string> = {
  weightGrams: "вес",
  lengthMm: "длина",
  widthMm: "ширина",
  heightMm: "высота",
}

function isVghIncompletePayload(o: Record<string, unknown>): boolean {
  return o.code === "VGH_INCOMPLETE" || o.code === "AGX_INCOMPLETE"
}

export function formatWmsAcceptError(data: unknown): string {
  if (!data || typeof data !== "object") return "Приемка отклонена (проверьте ВГХ)."
  const d = data as Record<string, unknown>
  if (isVghIncompletePayload(d) && Array.isArray(d.lines)) {
    return (d.lines as Array<{ sku?: string; lineTitle?: string | null; missing?: string[] }>)
      .map((ln) => {
        const label = [ln.sku, ln.lineTitle].filter(Boolean).join(" — ") || "позиция"
        const miss = (ln.missing ?? []).map((k) => VGH_FIELD_RU[k] ?? k).join(", ")
        return `${label}: не заполнено — ${miss}`
      })
      .join("; ")
  }
  const msg = d.message
  if (typeof msg === "string") return msg
  if (Array.isArray(msg)) return msg.join(", ")
  if (msg && typeof msg === "object" && !Array.isArray(msg)) {
    const o = msg as Record<string, unknown>
    if (isVghIncompletePayload(o) && Array.isArray(o.lines)) {
      return formatWmsAcceptError(o)
    }
  }
  return "Приемка отклонена (проверьте ВГХ)."
}
