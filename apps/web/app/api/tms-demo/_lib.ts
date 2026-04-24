import { API_BASE } from "@/lib/api"
import { TMS_API_BASE } from "@/lib/tms-api"

type DemoCheckoutPayload = {
  externalOrderId?: string
  customer: { name: string; phone: string; email?: string; address: string }
  cart: {
    items: Array<{ productId: string; title: string; quantity: number; priceRub: number; weightGrams: number }>
    declaredValueRub: number
    weightGrams: number
    widthMm: number
    lengthMm: number
    heightMm: number
  }
  pickupDate?: string
}

export class DemoTmsError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

async function readJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { raw: text }
  }
}

export async function getDemoAccessToken(): Promise<string> {
  const clientId = process.env.TMS_DEMO_CLIENT_ID?.trim()
  const clientSecret = process.env.TMS_DEMO_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    throw new DemoTmsError("TMS demo credentials are not configured", 500)
  }
  const res = await fetch(`${API_BASE}/tms/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
    cache: "no-store",
  })
  const data = (await readJsonSafe(res)) as { access_token?: string } | null
  if (!res.ok || !data?.access_token) throw new DemoTmsError("Could not obtain TMS demo access token", res.status, data)
  return data.access_token
}

export async function callTmsJson<T>(
  path: string,
  init: { method?: "GET" | "POST"; token: string; body?: unknown; idempotencyKey?: string },
): Promise<T> {
  const res = await fetch(`${TMS_API_BASE}/tms/${path.replace(/^\/+/, "")}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${init.token}`,
      "Content-Type": "application/json",
      "X-Request-Id": `demo-${Date.now()}`,
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {}),
    },
    body: init.body == null ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  })
  const data = await readJsonSafe(res)
  if (!res.ok) throw new DemoTmsError("TMS request failed", res.status, data)
  return data as T
}

export function buildShipmentPayload(input: DemoCheckoutPayload) {
  const externalOrderId = input.externalOrderId?.trim() || `DEMO-SITE-${Date.now()}`
  const pickupDate = input.pickupDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const originLabel = process.env.TMS_DEMO_ORIGIN_LABEL?.trim() || "Москва, Склад HandySeller"

  return {
    externalOrderId,
    payload: {
      snapshot: {
        sourceSystem: "HANDYSELLER_CORE",
        userId: "demo-site",
        coreOrderId: externalOrderId,
        coreOrderNumber: externalOrderId,
        marketplace: "OWN_SITE",
        createdAt: new Date().toISOString(),
        originLabel,
        destinationLabel: input.customer.address,
        cargo: {
          weightGrams: input.cart.weightGrams,
          widthMm: input.cart.widthMm,
          lengthMm: input.cart.lengthMm,
          heightMm: input.cart.heightMm,
          places: 1,
          declaredValueRub: input.cart.declaredValueRub,
        },
        itemSummary: input.cart.items.map((item) => ({
          productId: item.productId,
          title: item.title,
          quantity: item.quantity,
          weightGrams: item.weightGrams,
        })),
        contacts: {
          shipper: {
            name: process.env.TMS_DEMO_SHIPPER_NAME?.trim() || "Склад HandySeller",
            phone: process.env.TMS_DEMO_SHIPPER_PHONE?.trim() || "+79990001122",
          },
          recipient: { name: input.customer.name, phone: input.customer.phone, email: input.customer.email || undefined },
        },
      },
      draft: {
        originLabel,
        destinationLabel: input.customer.address,
        serviceFlags: ["EXPRESS"],
        pickupDate,
        pickupTimeStart: "09:00",
        pickupTimeEnd: "18:00",
        notes: `Demo checkout order ${externalOrderId}`,
      },
      integration: { externalOrderId, orderType: "CLIENT_ORDER" },
    },
  }
}

export function jsonError(error: unknown) {
  if (error instanceof DemoTmsError) {
    return Response.json({ message: error.message, details: error.details }, { status: error.status })
  }
  return Response.json({ message: error instanceof Error ? error.message : "Unknown demo error" }, { status: 500 })
}
