// Публичный номер счётчика Яндекс.Метрики (не секрет — виден в исходнике любого сайта)
const METRIKA_ID = 107695847

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
