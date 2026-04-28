import { callTmsJson, getDemoAccessToken, jsonError } from "../_lib"

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { requestId?: string; quoteId?: string; pickupPointId?: string }
    if (!body.requestId || !body.quoteId) {
      return Response.json({ message: "requestId and quoteId are required" }, { status: 400 })
    }
    const token = await getDemoAccessToken()
    const result = await callTmsJson(`v1/shipments/${encodeURIComponent(body.requestId)}/select`, {
      method: "POST",
      token,
      body: { quoteId: body.quoteId, pickupPointId: body.pickupPointId },
    })
    return Response.json(result)
  } catch (error) {
    return jsonError(error)
  }
}
