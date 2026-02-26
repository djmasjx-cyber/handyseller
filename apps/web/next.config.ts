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
      { source: "/dashboard/admin", destination: "/admin", permanent: true },
      { source: "/dashboard/admin/users", destination: "/admin/users", permanent: true },
      { source: "/dashboard/admin/payments", destination: "/admin/payments", permanent: true },
      { source: "/dashboard/admin/payments/webhooks", destination: "/admin/payments/webhooks", permanent: true },
    ];
  },
  // На деплое: Nginx проксирует /api -> NestJS. Локально: rewrite для dev.
  ...(isStandalone ? {} : {
    async rewrites() {
      return [{ source: "/api/:path*", destination: `${apiBase}/api/:path*` }];
    },
  }),
};

export default nextConfig;
