import { callTmsJson, getDemoAccessToken, jsonError } from "../_lib"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { requestId?: string; externalOrderId?: string; allowRealBooking?: boolean }
    if (!body.requestId) return Response.json({ message: "requestId is required" }, { status: 400 })
    if (!body.allowRealBooking) {
      return Response.json({ message: "Real carrier booking is disabled until allowRealBooking=true is sent." }, { status: 400 })
    }

    const token = await getDemoAccessToken()
    const shipment = await callTmsJson<{ id: string } & Record<string, unknown>>(
      `v1/shipments/${encodeURIComponent(body.requestId)}/confirm`,
      { method: "POST", token, idempotencyKey: `demo-confirm-${body.externalOrderId || body.requestId}` },
    )
    const shipmentId = String(shipment.id)
    const [events, documents, lookup] = await Promise.all([
      callTmsJson(`v1/shipments/${encodeURIComponent(shipmentId)}/events`, { token }).catch(() => null),
      callTmsJson(`shipments/${encodeURIComponent(shipmentId)}/documents`, { token }).catch(() => null),
      body.externalOrderId
        ? callTmsJson(`v1/shipments/by-external/${encodeURIComponent(body.externalOrderId)}?orderType=CLIENT_ORDER`, {
            token,
          }).catch(() => null)
        : Promise.resolve(null),
    ])
    return Response.json({ shipment, events, documents, lookup })
  } catch (error) {
    return jsonError(error)
  }
}
