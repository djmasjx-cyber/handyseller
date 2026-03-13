"use client"

import { useEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"

declare global {
  interface Window {
    ym: (id: number, action: string, ...args: unknown[]) => void
  }
}

// Публичный номер счётчика Яндекс.Метрики
const METRIKA_ID = 107695847

/**
 * Компонент для отслеживания SPA-переходов в Яндекс.Метрике.
 * Основной скрипт загружается через next/script в layout.tsx.
 * Этот компонент только отправляет hit при смене страницы.
 */
export function YandexMetrika() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Отслеживание смены страниц (SPA) — отправляем hit при каждом переходе
    // Первый hit отправляется автоматически при инициализации в layout.tsx
    // Здесь отправляем только при изменении pathname/searchParams
    if (typeof window !== "undefined" && window.ym) {
      window.ym(METRIKA_ID, "hit", window.location.href)
    }
  }, [pathname, searchParams])

  // Не рендерим ничего — скрипт уже в layout.tsx
  return null
}
