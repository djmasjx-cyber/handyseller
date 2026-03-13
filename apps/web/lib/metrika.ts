const METRIKA_ID = Number(process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID)

declare global {
  interface Window {
    ym: (id: number, action: string, ...args: unknown[]) => void
  }
}

/**
 * Отправляет цель в Яндекс.Метрику
 * @param goalName - идентификатор цели (например, 'click_start_free')
 * @param params - дополнительные параметры цели
 */
export function reachGoal(goalName: string, params?: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.ym && METRIKA_ID) {
    window.ym(METRIKA_ID, "reachGoal", goalName, params)
  }
}
