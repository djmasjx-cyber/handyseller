/** Базовый URL NestJS API. Префикс /api обязателен — NestJS использует setGlobalPrefix('api'). */
export const API_BASE =
  (process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:4000").replace(
    /\/api\/?$/,
    ""
  ) + "/api"
