"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button, Input, Label, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { User, Smartphone, Link2 } from "lucide-react"

function userCookie(name: string) {
  return `user_name=${encodeURIComponent(name)}; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax`
}

export default function SettingsPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [linkedToUserEmail, setLinkedToUserEmail] = useState("")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  useEffect(() => {
    const token = localStorage.getItem("accessToken")
    if (!token) {
      router.push("/login")
      return
    }
    fetch("/api/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.email) {
          setName(data.name ?? "")
          setPhone(data.phone ?? "")
          setLinkedToUserEmail(data.linkedToUserEmail ?? "")
        }
      })
      .catch(() => {})
  }, [router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const token = localStorage.getItem("accessToken")
    if (!token) {
      router.push("/login")
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch("/api/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim() || undefined,
          phone: phone.trim() || undefined,
          linkedToUserEmail: linkedToUserEmail.trim() ? linkedToUserEmail.trim() : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || "Ошибка сохранения")
      document.cookie = userCookie(data.name || name.trim())
      setMessage({ type: "success", text: "Профиль сохранён" })
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Ошибка сохранения" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Настройки</h1>
        <p className="text-muted-foreground">Укажите имя и контакты — они видны только вам</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Профиль</CardTitle>
          <CardDescription>
            Имя отображается на главной странице дашборда. Если после входа показывается «друг» —
            введите имя здесь и сохраните.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {message && (
              <div
                className={`rounded-md p-3 text-sm ${
                  message.type === "success" ? "bg-green-500/10 text-green-700 dark:text-green-400" : "bg-destructive/10 text-destructive"
                }`}
              >
                {message.text}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Имя</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Иван Иванов"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Телефон</Label>
              <div className="relative">
                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 (999) 123-45-67"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedToUserEmail">Привязка к другому аккаунту</Label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="linkedToUserEmail"
                  type="email"
                  value={linkedToUserEmail}
                  onChange={(e) => setLinkedToUserEmail(e.target.value)}
                  placeholder="email@example.com — доступ к маркетплейсам этого аккаунта"
                  className="pl-10"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Укажите email основного аккаунта, чтобы использовать его Ozon и Wildberries. Оставьте пустым для отвязки.
              </p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
