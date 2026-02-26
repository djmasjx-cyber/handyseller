"use client"

import { useEffect, useState, ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { ShieldAlert } from "lucide-react"
import { isAdmin } from "@/lib/auth-storage"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"

/**
 * Показывает детей только для пользователей с ролью ADMIN.
 * Если role нет в localStorage — пробуем получить /api/users/me и сохранить.
 */
export function AdminAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    if (!token) {
      router.replace("/login?from=" + encodeURIComponent("/dashboard/admin"))
      return
    }

    if (isAdmin()) {
      setAllowed(true)
      return
    }

    // Нет user в storage — пробуем подтянуть из API
    fetch("/api/users/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((user) => {
        if (user?.role === "ADMIN") {
          localStorage.setItem(AUTH_STORAGE_KEYS.user, JSON.stringify({ id: user.id, email: user.email, name: user.name, role: user.role }))
          setAllowed(true)
        } else {
          setAllowed(false)
        }
      })
      .catch(() => setAllowed(false))
  }, [router])

  if (allowed === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-6 w-6" />
              Доступ запрещён
            </CardTitle>
            <CardDescription>
              У вас нет прав для просмотра админ-панели. Требуется роль администратора.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="text-primary hover:underline text-sm"
            >
              Вернуться в дашборд
            </button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}
