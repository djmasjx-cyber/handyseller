"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Button, Input, Label, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { ArrowLeft, Mail, Lock, User, Smartphone } from "lucide-react"

function RegisterForm() {
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
    const name = (formData.get("name") as string)?.trim()
    const email = (formData.get("email") as string)?.trim()
    const password = formData.get("password") as string
    const confirmPassword = formData.get("confirm-password") as string
    const terms = formData.get("terms") === "on"

    if (!name || !email || !password) {
      setError("Заполните обязательные поля: имя, email и пароль")
      setIsLoading(false)
      return
    }
    if (!terms) {
      setError("Необходимо принять условия Публичной оферты и Политики конфиденциальности")
      setIsLoading(false)
      return
    }
    if (password.length < 6) {
      setError("Пароль должен быть не менее 6 символов")
      setIsLoading(false)
      return
    }
    if (password !== confirmPassword) {
      setError("Пароли не совпадают")
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone: formData.get("phone") || "",
          email,
          password,
        }),
        credentials: "include",
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && (data.accessToken || data.ok || data.success)) {
        if (data.accessToken) localStorage.setItem("accessToken", data.accessToken)
        const target = from.startsWith("/") ? from : "/dashboard"
        window.location.href = target
        return
      }
      const msg = data.message ?? data.error ?? "Ошибка регистрации"
      setError(Array.isArray(msg) ? msg.join(". ") : msg)
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
          <CardTitle className="text-2xl">Создать аккаунт</CardTitle>
          <CardDescription>
            Начните продавать свои изделия уже сегодня
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-md bg-destructive/10 text-destructive text-sm p-3">
                  {error}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">Имя *</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  name="name"
                  placeholder="Мария Иванова"
                  className="pl-10"
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="+7 (999) 123-45-67"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
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
                  placeholder="••••••••"
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Подтвердите пароль *</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="confirm-password"
                  name="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  className="pl-10"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <div className="flex items-start space-x-2">
              <input
                id="terms"
                name="terms"
                type="checkbox"
                className="h-4 w-4 rounded border-input mt-1"
                required
              />
              <Label htmlFor="terms" className="text-sm cursor-pointer">
                Я принимаю условия{" "}
                <Link href="/oferta" className="text-primary hover:text-primary/80" target="_blank" rel="noopener noreferrer">
                  Публичной оферты
                </Link>{" "}
                и{" "}
                <Link href="/privacy" className="text-primary hover:text-primary/80" target="_blank" rel="noopener noreferrer">
                  Политики конфиденциальности
                </Link>
              </Label>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? "Регистрация…" : "Зарегистрироваться"}
            </Button>
          </form>
          <div className="text-center text-sm text-muted-foreground mt-4">
            Уже есть аккаунт?{" "}
            <Link href="/login" className="text-primary hover:text-primary/80 font-medium">
              Войти
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardContent className="pt-6">
              <div className="animate-pulse h-8 bg-muted rounded mb-4" />
              <div className="animate-pulse h-10 bg-muted rounded mb-4" />
              <div className="animate-pulse h-10 bg-muted rounded" />
            </CardContent>
          </Card>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  )
}
