"use client"

import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"

declare global {
  interface Window {
    ym: (id: number, action: string, ...args: unknown[]) => void
  }
}

const METRIKA_ID = Number(process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID)

export function YandexMetrika() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!METRIKA_ID) return
    // Отслеживание смены страниц (SPA)
    window.ym?.(METRIKA_ID, "hit", window.location.href)
  }, [pathname, searchParams])

  if (!METRIKA_ID) return null

  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function(m,e,t,r,i,k,a){
              m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
              m[i].l=1*new Date();
              k=e.createElement(t),a=e.getElementsByTagName(t)[0],
              k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
            ym(${METRIKA_ID}, "init", {
              clickmap: true,
              trackLinks: true,
              accurateTrackBounce: true,
              webvisor: true,
              ecommerce: false
            });
          `,
        }}
      />
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${METRIKA_ID}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  )
}
