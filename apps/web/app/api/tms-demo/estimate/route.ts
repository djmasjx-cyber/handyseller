import { buildShipmentPayload, callTmsJson, getDemoAccessToken, jsonError } from "../_lib"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const checkout = await req.json()
    const token = await getDemoAccessToken()
    const { externalOrderId, payload } = buildShipmentPayload(checkout)
    const result = await callTmsJson("v1/shipments/estimate", {
      method: "POST",
      token,
      body: payload,
      idempotencyKey: `demo-estimate-${externalOrderId}`,
    })
    return Response.json({ externalOrderId, requestPayload: payload, ...result })
  } catch (error) {
    return jsonError(error)
  }
}
