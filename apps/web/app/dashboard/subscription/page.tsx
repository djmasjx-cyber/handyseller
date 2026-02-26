"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { authFetch } from "@/lib/auth-fetch"
import { AUTH_STORAGE_KEYS } from "@/lib/auth-storage"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Badge } from "@handyseller/ui"
import { Loader2, CheckCircle, XCircle } from "lucide-react"

interface Subscription {
  id: string
  plan: string
  expiresAt: string | null
  createdAt: string
}

const PLANS = [
  {
    id: "FREE",
    name: "Бесплатный",
    description: "Для тех, кто только начинает",
    price: 0,
    features: [
      { text: "До 5 активных товаров", included: true },
      { text: "1 маркетплейс", included: true },
      { text: "Базовая аналитика", included: true },
      { text: "Учёт материалов", included: false },
      { text: "Приоритетная поддержка", included: false },
    ],
  },
  {
    id: "PROFESSIONAL",
    name: "Любительский",
    description: "Для активных продавцов",
    price: 490,
    features: [
      { text: "До 20 активных товаров", included: true },
      { text: "До 2 маркетплейсов", included: true },
      { text: "Расширенная аналитика", included: true },
      { text: "Учёт материалов", included: false },
      { text: "Приоритетная поддержка", included: false },
    ],
  },
  {
    id: "BUSINESS",
    name: "Профессиональный",
    description: "Для успешных мастеров",
    price: 1490,
    features: [
      { text: "Безлимит товаров", included: true },
      { text: "Все маркетплейсы", included: true },
      { text: "Полная аналитика", included: true },
      { text: "Учёт материалов", included: true },
      { text: "Приоритетная поддержка", included: true },
    ],
  },
] as const

const planOrder = ["FREE", "PROFESSIONAL", "BUSINESS"] as const
const planIndex = (p: string) => planOrder.indexOf(p as (typeof planOrder)[number]) ?? -1

export default function SubscriptionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [loading, setLoading] = useState(true)
  const [payingPlanId, setPayingPlanId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const fetchSubscription = useCallback(() => {
    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    if (!token) return

    setLoading(true)
    authFetch("/api/subscriptions/me", { headers: { Authorization: `Bearer ${token}` } }, () =>
      router.replace("/login?from=" + encodeURIComponent("/dashboard/subscription"))
    )
      .then((r) => (r.status === 401 ? null : r.json()))
      .then((data) => {
        if (data?.id) setSubscription(data)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [router])

  useEffect(() => {
    fetchSubscription()
  }, [fetchSubscription])

  useEffect(() => {
    const success = searchParams.get("success")
    const fail = searchParams.get("fail")
    if (success === "1") {
      setMessage({ type: "success", text: "Оплата прошла успешно! Подписка активирована." })
      fetchSubscription()
      window.history.replaceState({}, "", "/dashboard/subscription")
    } else if (fail === "1") {
      setMessage({ type: "error", text: "Оплата не прошла. Попробуйте ещё раз или выберите другой способ." })
      window.history.replaceState({}, "", "/dashboard/subscription")
    }
  }, [searchParams, fetchSubscription])

  const handlePay = async (planId: "PROFESSIONAL" | "BUSINESS") => {
    if (!subscription || payingPlanId) return
    const plan = PLANS.find((p) => p.id === planId)
    if (!plan || plan.price <= 0) return

    const token = localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
    if (!token) return

    const base = typeof window !== "undefined" ? window.location.origin : ""
    const returnUrl = `${base}/dashboard/subscription?success=1`
    const failUrl = `${base}/dashboard/subscription?fail=1`

    setPayingPlanId(planId)
    setMessage(null)
    try {
      const r = await authFetch("/api/payments/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          subscriptionId: subscription.id,
          amount: plan.price,
          targetPlan: planId,
          returnUrl,
          failUrl,
          idempotencyKey: `sub-${subscription.id}-${planId}-${Date.now()}`,
        }),
      })
      const data = await r.json()
      if (r.ok && data?.formUrl) {
        window.location.href = data.formUrl
        return
      }
      const msg = data?.message ?? "Не удалось создать платёж"
      const friendly =
        msg.includes("не настроена") || msg.includes("не настроен")
          ? "Оплата временно недоступна. Обратитесь к администратору сервиса."
          : msg
      setMessage({ type: "error", text: friendly })
    } catch (e) {
      setMessage({ type: "error", text: "Ошибка: " + (e instanceof Error ? e.message : String(e)) })
    } finally {
      setPayingPlanId(null)
    }
  }

  const formatDate = (s: string | null) => {
    if (!s) return "—"
    try {
      return new Date(s).toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" })
    } catch {
      return "—"
    }
  }

  const currentPlanLabel = PLANS.find((p) => p.id === subscription?.plan)?.name ?? subscription?.plan
  const currentPlanIndex = planIndex(subscription?.plan ?? "FREE")
  const isExpired =
    subscription?.expiresAt && new Date(subscription.expiresAt) < new Date()
  const needsUpgrade = isExpired || currentPlanIndex < planOrder.length - 1

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Подписка</h1>
        <p className="text-muted-foreground">Выберите тариф и оплатите подписку</p>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-lg p-4 ${
            message.type === "success"
              ? "bg-green-500/10 text-green-700 dark:text-green-400"
              : "bg-destructive/10 text-destructive"
          }`}
        >
          {message.type === "success" ? (
            <CheckCircle className="h-5 w-5 shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 shrink-0" />
          )}
          <p>{message.text}</p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Текущий план</CardTitle>
          <CardDescription>
            {currentPlanLabel}
            {subscription?.expiresAt && (
              <span className="ml-2">
                • Действует до {formatDate(subscription.expiresAt)}
                {isExpired && (
                  <span className="text-destructive ml-1">(истекла)</span>
                )}
              </span>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = subscription?.plan === plan.id && !isExpired
          const isUpgrade = planIndex(plan.id) > currentPlanIndex || isExpired
          const canPay = plan.price > 0 && (isUpgrade || isExpired)

          return (
            <Card
              key={plan.id}
              className={`relative overflow-visible ${isCurrent ? "border-2 border-primary shadow-lg shadow-primary/20" : ""}`}
            >
              {isCurrent && (
                <div className="absolute -top-2.5 right-4 z-10">
                  <Badge className="bg-primary text-primary-foreground shadow-sm border-0">Текущий</Badge>
                </div>
              )}
              <CardHeader className={isCurrent ? "pt-6" : ""}>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="pt-2">
                  <span className="text-3xl font-bold">{plan.price.toLocaleString("ru-RU")} ₽</span>
                  <span className="text-muted-foreground">/мес</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {plan.features.map((f, i) => (
                    <li key={i} className={`flex items-center text-sm ${f.included ? "" : "text-muted-foreground"}`}>
                      <span className={f.included ? "text-green-500 mr-2" : "mr-2"}>
                        {f.included ? "✓" : "—"}
                      </span>
                      {f.text}
                    </li>
                  ))}
                </ul>
                {canPay ? (
                  <Button
                    className="w-full"
                    onClick={() => handlePay(plan.id as "PROFESSIONAL" | "BUSINESS")}
                    disabled={!!payingPlanId}
                  >
                    {payingPlanId === plan.id ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Оплатить…
                      </>
                    ) : (
                      `Оплатить ${plan.price.toLocaleString("ru-RU")} ₽`
                    )}
                  </Button>
                ) : plan.price === 0 ? (
                  <Button variant="outline" className="w-full" disabled>
                    Бесплатно
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
