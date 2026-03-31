"use client"

import { useState, useEffect, ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { LayoutDashboard, Users, CreditCard, Webhook, ShieldAlert, Palette, MessageSquare } from "lucide-react"
import { LogoutButton } from "@/components/logout-button"
import { AUTH_STORAGE_KEYS, setStoredUser } from "@/lib/auth-storage"

/**
 * Оболочка админ-зоны: проверка роли только через API, отдельный сайдбар без пользовательских ссылок.
 */
export function AdminLayoutShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    if (!token) {
      router.replace("/login?from=" + encodeURIComponent("/admin"))
      return
    }

    fetch("/api/users/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((user) => {
        if (user?.role === "ADMIN") {
          setStoredUser({ id: user.id, email: user.email, name: user.name, role: user.role })
          setAllowed(true)
        } else {
          setAllowed(false)
        }
      })
      .catch(() => setAllowed(false))
  }, [router])

  if (allowed === null) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
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
            <Link
              href="/dashboard"
              className="text-primary hover:underline text-sm font-medium"
            >
              Вернуться в дашборд
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="md:hidden border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/admin" className="flex items-center space-x-2">
            <div className="rounded-lg bg-primary p-2">
              <Palette className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold">HandySeller Admin</span>
          </Link>
        </div>
      </header>

      <div className="container py-6">
        <div className="grid lg:grid-cols-[240px_1fr] gap-8">
          <aside className="hidden md:block">
            <Card className="p-4">
              <nav className="space-y-1">
                <Link
                  href="/admin"
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md ${pathname === "/admin" ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <LayoutDashboard className="h-5 w-5" />
                  <span>Главная</span>
                </Link>
                <Link
                  href="/admin/users"
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md ${pathname?.startsWith("/admin/users") ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Users className="h-5 w-5" />
                  <span>Пользователи</span>
                </Link>
                <Link
                  href="/admin/payments"
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md ${pathname?.startsWith("/admin/payments") ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <CreditCard className="h-5 w-5" />
                  <span>Платежи</span>
                </Link>
                <Link
                  href="/admin/payments/webhooks"
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md ${pathname === "/admin/payments/webhooks" ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Webhook className="h-5 w-5" />
                  <span>Вебхуки</span>
                </Link>
                <Link
                  href="/admin/reviews"
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md ${pathname?.startsWith("/admin/reviews") ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <MessageSquare className="h-5 w-5" />
                  <span>Отзывы</span>
                </Link>
                <div className="border-t my-4" />
                <Link
                  href="/dashboard"
                  className="flex items-center space-x-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Palette className="h-5 w-5" />
                  <span>В дашборд</span>
                </Link>
                <LogoutButton className="w-full justify-start text-muted-foreground hover:text-destructive" />
              </nav>
            </Card>
          </aside>

          <main>{children}</main>
        </div>
      </div>
    </div>
  )
}
