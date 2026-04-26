import type { NextConfig } from "next";
import path from "path";

const outputMode = process.env.OUTPUT_MODE;
const isExport = outputMode === "export";
const isStandalone = outputMode === "standalone";
const apiBase = process.env.API_URL || "http://localhost:4000";

const nextConfig: NextConfig = {
  transpilePackages: ["@handyseller/ui"],
  output: isExport ? "export" : isStandalone ? "standalone" : undefined,
  ...(isExport ? {} : { outputFileTracingRoot: path.join(__dirname, "../../") }),
  // Редиректы со старого /dashboard/admin на /admin
  async redirects() {
    return [
      { source: "/dashboard/wms", destination: "/dashboard/wms/sklad", permanent: false },
      { source: "/dashboard/admin", destination: "/admin", permanent: true },
      { source: "/dashboard/admin/users", destination: "/admin/users", permanent: true },
      { source: "/dashboard/admin/payments", destination: "/admin/payments", permanent: true },
      { source: "/dashboard/admin/payments/webhooks", destination: "/admin/payments/webhooks", permanent: true },
      { source: "/dashboard/admin/reviews", destination: "/admin/reviews", permanent: true },
    ];
  },
  // На деплое: Nginx проксирует /api -> NestJS. Локально: rewrite для dev.
  ...(isStandalone ? {} : {
    async rewrites() {
      // Не проксировать /api/tms/*:
      // эти пути обрабатывает Next BFF (app/api/...).
      // Иначе запрос уходит в Nest и возвращает 404/ошибку.
      return [
        {
          source: "/api/:path((?!tms(?:/|$)).*)",
          destination: `${apiBase}/api/:path`,
        },
      ];
    },
  }),
};

export default nextConfig;
