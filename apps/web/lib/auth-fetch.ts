import { AUTH_STORAGE_KEYS } from "./auth-storage"

/**
 * Обёртка fetch: при 401 пробует обновить токен через refresh; при неудаче — редирект на логин.
 * Использовать для всех запросов, требующих авторизации.
 */
export async function authFetch(
  url: string | URL,
  init?: RequestInit,
  on401?: () => void
): Promise<Response> {
  let res = await fetch(url, init)

  if (res.status === 401 && typeof window !== "undefined") {
    const refreshRes = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    })
    if (refreshRes.ok) {
      const data = await refreshRes.json().catch(() => ({}))
      if (data.accessToken) {
        localStorage.setItem(AUTH_STORAGE_KEYS.accessToken, data.accessToken)
        const headers = new Headers(init?.headers)
        headers.set("Authorization", `Bearer ${data.accessToken}`)
        res = await fetch(url, { ...init, headers })
        if (res.status !== 401) return res
      }
    }
    localStorage.removeItem(AUTH_STORAGE_KEYS.accessToken)
    localStorage.removeItem(AUTH_STORAGE_KEYS.user)
    const from = encodeURIComponent(window.location.pathname + window.location.search)
    const target = `/login?from=${from}`
    if (on401) on401()
    else window.location.href = target
  }
  return res
}
