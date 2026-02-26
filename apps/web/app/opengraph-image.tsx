import { ImageResponse } from "next/og";

export const alt = "HandySeller — всё для продажи handmade на маркетплейсах";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              fontSize: 72,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.02em",
            }}
          >
            HandySeller
          </div>
          <div
            style={{
              fontSize: 32,
              color: "rgba(255,255,255,0.85)",
              textAlign: "center",
              maxWidth: 800,
              lineHeight: 1.3,
            }}
          >
            Всё для продажи handmade на Wildberries и Ozon
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 24,
              padding: "12px 24px",
              background: "rgba(255,255,255,0.15)",
              borderRadius: 12,
              fontSize: 22,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            app.handyseller.ru
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
