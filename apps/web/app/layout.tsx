import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { ChatWidget } from "@/components/chat-widget";
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
        {children}
        <ChatWidget />
        {/* Яндекс.Метрика — минимальный рабочий вариант */}
        <Script
          id="yandex-metrika"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(m,e,t,r,i,k,a){
                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                k=e.createElement(t),a=e.getElementsByTagName(t)[0],
                k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
              })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
              ym(107695847, "init", {
                clickmap: true,
                trackLinks: true,
                accurateTrackBounce: true,
                webvisor: true
              });
            `,
          }}
        />
        <noscript>
          <div>
            <img src="https://mc.yandex.ru/watch/107695847" style={{position:"absolute",left:"-9999px"}} alt="" />
          </div>
        </noscript>
        {/* Top.Mail.Ru (VK Pixel) — для рекламы */}
        <Script
          id="top-mail-ru"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              var _tmr = window._tmr || (window._tmr = []);
              _tmr.push({id: "3751305", type: "pageView", start: (new Date()).getTime()});
              (function (d, w, id) {
                if (d.getElementById(id)) return;
                var ts = d.createElement("script"); ts.type = "text/javascript"; ts.async = true; ts.id = id;
                ts.src = "https://top-fwz1.mail.ru/js/code.js";
                var f = function () {var s = d.getElementsByTagName("script")[0]; s.parentNode.insertBefore(ts, s);};
                if (w.opera == "[object Opera]") { d.addEventListener("DOMContentLoaded", f, false); } else { f(); }
              })(document, window, "tmr-code");
            `,
          }}
        />
        <noscript>
          <div>
            <img src="https://top-fwz1.mail.ru/counter?id=3751305;js=na" style={{position:"absolute",left:"-9999px"}} alt="Top.Mail.Ru" />
          </div>
        </noscript>
      </body>
    </html>
  );
}
