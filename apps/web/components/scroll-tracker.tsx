"use client"

import { useEffect } from "react"
import { reachGoal } from "@/lib/metrika"

interface ScrollTrackerProps {
  /** Идентификатор страницы (например, 'wildberries', 'ozon', 'faq') */
  pageId: string
}

/**
 * Компонент для отслеживания глубины прокрутки страницы.
 * Отправляет цели в Яндекс.Метрику при достижении 50% и 90% прокрутки.
 */
export function ScrollTracker({ pageId }: ScrollTrackerProps) {
  useEffect(() => {
    let fired50 = false
    let fired90 = false

    const handler = () => {
      const scrolled =
        ((window.scrollY + window.innerHeight) / document.body.scrollHeight) * 100

      if (scrolled >= 50 && !fired50) {
        fired50 = true
        reachGoal(`scroll_50_${pageId}`)
      }
      if (scrolled >= 90 && !fired90) {
        fired90 = true
        reachGoal(`scroll_90_${pageId}`)
      }
    }

    window.addEventListener("scroll", handler)
    // Проверяем сразу при загрузке (страница может быть короткой)
    handler()

    return () => window.removeEventListener("scroll", handler)
  }, [pageId])

  return null
}
