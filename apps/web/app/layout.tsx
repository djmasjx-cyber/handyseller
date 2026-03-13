import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { YandexMetrika } from "@/components/yandex-metrika";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL = "https://app.handyseller.ru";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "HandySeller — программа для продажи handmade на Wildberries и Ozon",
    template: "%s | HandySeller",
  },
  description: "Как продать хенд мейд на Ozon и Wildberries? Свечи ручной работы, бусы из жемчуга, 3D-модели — в одном окне. Где продавать handmade в интернете: HandySeller.",
  keywords: ["как продать хенд мейд", "продать handmade на Ozon", "продать handmade на Wildberries", "где продавать handmade", "продать свечи ручной работы", "продать бусы из жемчуга", "продать бусы из натуральных камней", "продать 3D модели в интернете", "где продать самодельные вещи", "как продавать на Ozon изделия ручной работы"],
  authors: [{ name: "HandySeller", url: BASE_URL }],
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  verification: {
    google: "_ZG7AjgkbTkjykWvreZPMYI7HJOC_SgDTT8F5Lmki9Y",
    yandex: "f8de0beda64eb67d",
  },
  openGraph: {
    type: "website",
    url: BASE_URL,
    siteName: "HandySeller",
    title: "HandySeller — программа для продажи handmade на Wildberries и Ozon",
    description: "Как продать хенд мейд на Ozon и Wildberries? Свечи, бусы из жемчуга, 3D-модели. Где продавать handmade в интернете — HandySeller.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "HandySeller — всё для продажи handmade" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "HandySeller — программа для продажи handmade на Wildberries и Ozon",
    description: "Как продать хенд мейд на Ozon и Wildberries? Свечи, бусы, 3D-модели. Где продавать handmade — HandySeller.",
  },
};

const schemaOrg = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "HandySeller",
  description: "Как продать хенд мейд на Ozon и Wildberries. Свечи ручной работы, бусы из жемчуга, 3D-модели. Где продавать handmade в интернете — HandySeller.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, Android, iOS (скоро)",
  url: "https://app.handyseller.ru",
  offers: { "@type": "Offer", price: "0", priceCurrency: "RUB" },
  featureList: ["Единые остатки на всех маркетплейсах", "Одно описание для всех площадок", "Уведомления о заказах в Telegram", "Работает на телефоне"],
  audience: { "@type": "Audience", audienceType: "Мастера handmade, ремесленники, самозанятые" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased overflow-x-hidden`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaOrg) }}
        />
        <Suspense fallback={null}>
          <YandexMetrika />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
