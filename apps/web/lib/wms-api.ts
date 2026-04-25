export const WMS_API_BASE =
  (process.env.NEXT_PUBLIC_WMS_API_URL ?? process.env.WMS_API_URL ?? "http://localhost:4200").replace(
    /\/api\/?$/,
    "",
  ) + "/api"
