"use client"

import { useState, Suspense } from "react"
import Link from "next/link"
import { Button, Input, Label, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { ArrowLeft, Mail, Lock } from "lucide-react"
import { useSearchParams } from "next/navigation"

function LoginForm() {
  const searchParams = useSearchParams()
  const from = searchParams.get("from") || "/dashboard"
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    const form = e.currentTarget
    const formData = new FormData(form)
    const email = (formData.get("email") as string)?.trim()
    const password = formData.get("password") as string

    if (!email || !password) {
      setError("Введите email и пароль")
      setIsLoading(false)
      return
    }
    if (password.length < 6) {
      setError("Пароль должен быть не менее 6 символов")
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && (data.accessToken || data.ok)) {
        if (data.accessToken) localStorage.setItem("accessToken", data.accessToken)
        if (data.user) {
          localStorage.setItem("user", JSON.stringify({
            id: data.user.id,
            email: data.user.email,
            name: data.user.name,
            role: data.user.role ?? "USER",
          }))
        }
        let target = from.startsWith("/") ? from : "/dashboard"
        if (data.user?.role === "ADMIN" && target === "/dashboard") {
          target = "/admin"
        }
        window.location.href = target
        return
      }
      setError(data.error || data.message || "Неверный email или пароль")
    } catch {
      setError("Сервер недоступен. Попробуйте позже.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-2">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Вернуться на главную
          </Link>
          <CardTitle className="text-2xl">Вход в аккаунт</CardTitle>
          <CardDescription>
            Введите email и пароль для входа
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="on">
            {error && (
              <div className="rounded-md bg-destructive/10 text-destructive text-sm p-3">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="your@email.com"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? "Вход…" : "Войти"}
            </Button>
          </form>
          <div className="text-center text-sm text-muted-foreground mt-4">
            Нет аккаунта?{" "}
            <Link href="/register" className="text-primary hover:text-primary/80 font-medium">
              Зарегистрироваться
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="animate-pulse h-8 bg-muted rounded mb-4" />
            <div className="animate-pulse h-10 bg-muted rounded mb-4" />
            <div className="animate-pulse h-10 bg-muted rounded" />
          </CardContent>
        </Card>
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
