"use client"

import { useState, useEffect, useCallback, ReactNode } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@handyseller/ui"
import { LayoutDashboard, Package, BarChart3, Settings, Menu, Palette, LogIn, ShoppingCart, Shield, CreditCard, X, ChevronDown, DollarSign, Truck } from "lucide-react"
import { LogoutButton } from "@/components/logout-button"
import { AUTH_STORAGE_KEYS, isAdmin } from "@/lib/auth-storage"

function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(AUTH_STORAGE_KEYS.accessToken)
}

export function DashboardAuthGate({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [productsExpanded, setProductsExpanded] = useState(false)
  const [ordersExpanded, setOrdersExpanded] = useState(false)
  const [financeExpanded, setFinanceExpanded] = useState(false)
  const [tmsExpanded, setTmsExpanded] = useState(false)

  const checkAuth = useCallback(() => {
    const token = getToken()
    setIsAuthenticated(!!token)
    if (!token) {
      router.replace("/login?from=" + encodeURIComponent("/dashboard"))
    }
  }, [router])

  useEffect(() => {
    checkAuth()
    const handleStorage = () => checkAuth()
    window.addEventListener("storage", handleStorage)
    return () => window.removeEventListener("storage", handleStorage)
  }, [checkAuth])

  // Разворачиваем только активную группу при переходе на её страницы
  useEffect(() => {
    const isOrders = pathname?.startsWith("/dashboard/orders") ?? false
    const isProducts = pathname?.startsWith("/dashboard/products") ?? false
    const isFinance = pathname?.startsWith("/dashboard/finance") ?? false
    const isTms = pathname?.startsWith("/dashboard/tms") ?? false

    setOrdersExpanded(isOrders)
    setProductsExpanded(isProducts)
    setFinanceExpanded(isFinance)
    setTmsExpanded(isTms)
  }, [pathname])

  // Неавторизован или ещё проверяем: показываем явную карточку входа
  if (isAuthenticated !== true) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutDashboard className="h-6 w-6 text-primary" />
              Панель управления
            </CardTitle>
            <CardDescription>
              Войдите в аккаунт, чтобы получить доступ к дашборду, товарам и маркетплейсам
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full" size="lg">
              <Link href={"/login?from=" + encodeURIComponent("/dashboard")}>
                <LogIn className="mr-2 h-5 w-5" />
                Войти в аккаунт
              </Link>
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Нет аккаунта?{" "}
              <Link href="/register" className="text-primary hover:underline">
                Зарегистрироваться
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const navLinks = [
    { href: "/dashboard", icon: LayoutDashboard, label: "Главная" },
    { href: "/dashboard/analytics", icon: BarChart3, label: "Аналитика" },
    { href: "/dashboard/marketplaces", icon: Palette, label: "Маркетплейсы" },
    { href: "/dashboard/subscription", icon: CreditCard, label: "Подписка" },
    { href: "/dashboard/settings", icon: Settings, label: "Настройки" },
  ]

  const isOnOrders = pathname === "/dashboard/orders"
  const isOnAssembly = pathname === "/dashboard/orders/assembly"
  const isOnProducts = pathname === "/dashboard/products"
  const isOnProductsArchive = pathname === "/dashboard/products/archive"
  const isOnFinanceFbo = pathname === "/dashboard/finance/fbo"
  const isOnFinanceFbs = pathname === "/dashboard/finance/fbs"
  const isOnFinance = isOnFinanceFbo || isOnFinanceFbs
  const isOnTms = pathname?.startsWith("/dashboard/tms") ?? false

  // Загрузка или авторизован — рендерим layout
  return (
    <div className="min-h-screen bg-background">
      <header className="md:hidden border-b bg-card sticky top-0 z-50 safe-area-inset-top">
        <div className="container flex h-14 items-center justify-between px-4">
          <Link href="/dashboard" className="flex items-center space-x-2 flex-shrink-0 min-w-0">
            <div className="rounded-lg bg-primary p-2 flex-shrink-0">
              <Palette className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold truncate">HandySeller</span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex-shrink-0 min-w-[44px] min-h-[44px] touch-manipulation"
            aria-label="Открыть меню"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </div>
      </header>

      {/* Мобильное меню (выдвижная панель) */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/50 md:hidden"
            onClick={() => setMenuOpen(false)}
            aria-hidden="true"
          />
          <div
            className="fixed top-0 right-0 bottom-0 z-[101] w-[280px] max-w-[85vw] bg-background border-l shadow-xl md:hidden flex flex-col safe-area-inset"
            role="dialog"
            aria-label="Меню навигации"
          >
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-bold">Меню</span>
              <Button
                variant="ghost"
                size="icon"
                type="button"
                onClick={() => setMenuOpen(false)}
                className="min-w-[44px] min-h-[44px] touch-manipulation"
                aria-label="Закрыть меню"
              >
                <X className="h-6 w-6" />
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {/* Главная */}
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                className={`flex items-center space-x-3 px-3 py-3 rounded-md min-h-[44px] touch-manipulation ${pathname === "/dashboard" ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <LayoutDashboard className="h-5 w-5 flex-shrink-0" />
                <span>Главная</span>
              </Link>

              {/* Товары — группа */}
              <div className="py-1">
                <div
                  className={`w-full flex items-center px-3 py-3 rounded-md min-h-[44px] touch-manipulation ${isOnProducts || isOnProductsArchive ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Link
                    href="/dashboard/products"
                    onClick={() => {
                      setProductsExpanded(true)
                      setMenuOpen(false)
                    }}
                    className="flex items-center space-x-3 flex-1"
                  >
                    <Package className="h-5 w-5 flex-shrink-0" />
                    <span>Товары</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setProductsExpanded((v) => !v)}
                    className="ml-2 p-1 rounded hover:bg-muted"
                    aria-label="Развернуть товары"
                    aria-expanded={productsExpanded}
                  >
                    <ChevronDown className={`h-5 w-5 transition-transform ${productsExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {productsExpanded && (
                  <>
                    <Link
                      href="/dashboard/products"
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center space-x-3 pl-6 pr-3 py-2.5 rounded-md min-h-[40px] touch-manipulation text-sm ${isOnProducts ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                      <span>Все товары</span>
                    </Link>
                    <Link
                      href="/dashboard/products/archive"
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center space-x-3 pl-6 pr-3 py-2.5 rounded-md min-h-[40px] touch-manipulation text-sm ${isOnProductsArchive ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                      <span>Архив товаров</span>
                    </Link>
                  </>
                )}
              </div>

              {/* Заказы — раскрываемая группа, клик по кнопке раскрывает */}
              <div className="py-1">
                <div
                  className={`w-full flex items-center px-3 py-3 rounded-md min-h-[44px] touch-manipulation ${isOnOrders || isOnAssembly ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Link
                    href="/dashboard/orders"
                    onClick={() => {
                      setOrdersExpanded(true)
                      setMenuOpen(false)
                    }}
                    className="flex items-center space-x-3 flex-1"
                  >
                    <ShoppingCart className="h-5 w-5 flex-shrink-0" />
                    <span>Заказы</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setOrdersExpanded((v) => !v)}
                    className="ml-2 p-1 rounded hover:bg-muted"
                    aria-label="Развернуть заказы"
                    aria-expanded={ordersExpanded}
                  >
                    <ChevronDown className={`h-5 w-5 transition-transform ${ordersExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {ordersExpanded && (
                  <>
                    <Link
                      href="/dashboard/orders"
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center space-x-3 pl-6 pr-3 py-2.5 rounded-md min-h-[40px] touch-manipulation text-sm ${isOnOrders ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                      <span>Все заказы</span>
                    </Link>
                    <Link
                      href="/dashboard/orders/assembly"
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center space-x-3 pl-6 pr-3 py-2.5 rounded-md min-h-[40px] touch-manipulation text-sm ${isOnAssembly ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                      <span>Заказы на сборке</span>
                    </Link>
                  </>
                )}
              </div>
              {/* Юнит-экономика — раскрываемая группа */}
              <div className="py-1">
                <div
                  className={`w-full flex items-center px-3 py-3 rounded-md min-h-[44px] touch-manipulation ${isOnFinance ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <button
                    type="button"
                    onClick={() => setFinanceExpanded((v) => !v)}
                    className="flex items-center space-x-3 flex-1 text-left"
                  >
                    <DollarSign className="h-5 w-5 flex-shrink-0" />
                    <span>Юнит-экономика</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFinanceExpanded((v) => !v)}
                    className="ml-2 p-1 rounded hover:bg-muted"
                    aria-label="Развернуть финансы"
                    aria-expanded={financeExpanded}
                  >
                    <ChevronDown className={`h-5 w-5 transition-transform ${financeExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {financeExpanded && (
                  <>
                    <Link
                      href="/dashboard/finance/fbo"
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center space-x-3 pl-6 pr-3 py-2.5 rounded-md min-h-[40px] touch-manipulation text-sm ${isOnFinanceFbo ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                      <span>FBO</span>
                    </Link>
                    <Link
                      href="/dashboard/finance/fbs"
                      onClick={() => setMenuOpen(false)}
                      className={`flex items-center space-x-3 pl-6 pr-3 py-2.5 rounded-md min-h-[40px] touch-manipulation text-sm ${isOnFinanceFbs ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                    >
                      <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                      <span>FBS</span>
                    </Link>
                  </>
                )}
              </div>
              <div className="py-1">
                <div
                  className={`w-full flex items-center px-3 py-3 rounded-md min-h-[44px] touch-manipulation ${isOnTms ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Link
                    href="/dashboard/tms"
                    onClick={() => {
                      setTmsExpanded(true)
                      setMenuOpen(false)
                    }}
                    className="flex items-center space-x-3 flex-1"
                  >
                    <Truck className="h-5 w-5 flex-shrink-0" />
                    <span>TMS</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => setTmsExpanded((v) => !v)}
                    className="ml-2 p-1 rounded hover:bg-muted"
                    aria-label="Развернуть TMS"
                    aria-expanded={tmsExpanded}
                  >
                    <ChevronDown className={`h-5 w-5 transition-transform ${tmsExpanded ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {tmsExpanded && (
                  <>
                    {[
                      ["/dashboard/tms", "Дашборд"],
                      ["/dashboard/tms/orders", "Заказы клиентов"],
                      ["/dashboard/tms/requests", "Сравнение тарифов"],
                      ["/dashboard/tms/shipments", "Отгрузки"],
                      ["/dashboard/tms/tracking", "Трекинг"],
                      ["/dashboard/tms/carriers", "Перевозчики"],
                      ["/dashboard/tms/rules", "Правила"],
                      ["/dashboard/tms/analytics", "Аналитика"],
                      ["/dashboard/tms/settings", "Настройки"],
                    ].map(([href, label]) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMenuOpen(false)}
                        className={`flex items-center space-x-3 pl-6 pr-3 py-2.5 rounded-md min-h-[40px] touch-manipulation text-sm ${pathname === href ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                      >
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                        <span>{label}</span>
                      </Link>
                    ))}
                  </>
                )}
              </div>
              {/* Остальные пункты */}
              {navLinks.slice(1).map((item) => {
                const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href))
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center space-x-3 px-3 py-3 rounded-md min-h-[44px] touch-manipulation ${isActive ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
              {isAdmin() && (
                <Link
                  href="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center space-x-3 px-3 py-3 rounded-md min-h-[44px] touch-manipulation text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Shield className="h-5 w-5 flex-shrink-0" />
                  <span>Админ-панель</span>
                </Link>
              )}
              <div className="border-t my-4" />
              <div className="px-3 py-2">
                <LogoutButton className="w-full justify-start text-muted-foreground hover:text-destructive min-h-[44px]" />
              </div>
            </nav>
          </div>
        </>
      )}

      <div className="container py-6">
        <div className="grid lg:grid-cols-[240px_1fr] gap-8">
          <aside className="hidden md:block">
            <Card className="p-4">
              <nav className="space-y-1">
                <Link
                  href="/dashboard"
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md ${pathname === "/dashboard" ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <LayoutDashboard className="h-5 w-5" />
                  <span>Главная</span>
                </Link>
                {/* Товары — группа */}
                <div className="space-y-0.5">
                  <div
                    className={`w-full flex items-center px-3 py-2 rounded-md ${isOnProducts || isOnProductsArchive ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    <Link
                      href="/dashboard/products"
                      onClick={() => setProductsExpanded(true)}
                      className="flex items-center space-x-3 flex-1 text-left"
                    >
                      <Package className="h-5 w-5 flex-shrink-0" />
                      <span>Товары</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setProductsExpanded((v) => !v)}
                      className="ml-2 p-1 rounded hover:bg-muted"
                      aria-label="Развернуть товары"
                      aria-expanded={productsExpanded}
                    >
                      <ChevronDown className={`h-5 w-5 transition-transform ${productsExpanded ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  {productsExpanded && (
                    <>
                      <Link
                        href="/dashboard/products"
                        className={`flex items-center space-x-3 pl-6 pr-3 py-2 rounded-md text-sm ${isOnProducts ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                      >
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                        <span>Все товары</span>
                      </Link>
                      <Link
                        href="/dashboard/products/archive"
                        className={`flex items-center space-x-3 pl-6 pr-3 py-2 rounded-md text-sm ${isOnProductsArchive ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                      >
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                        <span>Архив товаров</span>
                      </Link>
                    </>
                  )}
                </div>
                {/* Заказы — раскрываемая группа, клик по кнопке раскрывает */}
                <div className="space-y-0.5">
                  <div
                    className={`w-full flex items-center px-3 py-2 rounded-md ${isOnOrders || isOnAssembly ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    <Link
                      href="/dashboard/orders"
                      onClick={() => setOrdersExpanded(true)}
                      className="flex items-center space-x-3 flex-1 text-left"
                    >
                      <ShoppingCart className="h-5 w-5 flex-shrink-0" />
                      <span>Заказы</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setOrdersExpanded((v) => !v)}
                      className="ml-2 p-1 rounded hover:bg-muted"
                      aria-label="Развернуть заказы"
                      aria-expanded={ordersExpanded}
                    >
                      <ChevronDown className={`h-5 w-5 transition-transform ${ordersExpanded ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  {ordersExpanded && (
                    <>
                      <Link
                        href="/dashboard/orders"
                        className={`flex items-center space-x-3 pl-6 pr-3 py-2 rounded-md text-sm ${isOnOrders ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                      >
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                        <span>Все заказы</span>
                      </Link>
                      <Link
                        href="/dashboard/orders/assembly"
                        className={`flex items-center space-x-3 pl-6 pr-3 py-2 rounded-md text-sm ${isOnAssembly ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                      >
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                        <span>Заказы на сборке</span>
                      </Link>
                    </>
                  )}
                </div>
                {/* Юнит-экономика — группа */}
                <div className="space-y-0.5">
                  <div
                    className={`w-full flex items-center px-3 py-2 rounded-md ${isOnFinance ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    <button
                      type="button"
                      onClick={() => setFinanceExpanded((v) => !v)}
                      className="flex items-center space-x-3 flex-1 text-left"
                    >
                      <DollarSign className="h-5 w-5 flex-shrink-0" />
                      <span>Юнит-экономика</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinanceExpanded((v) => !v)}
                      className="ml-2 p-1 rounded hover:bg-muted"
                      aria-label="Развернуть финансы"
                      aria-expanded={financeExpanded}
                    >
                      <ChevronDown className={`h-5 w-5 transition-transform ${financeExpanded ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  {financeExpanded && (
                    <>
                      <Link
                        href="/dashboard/finance/fbo"
                        className={`flex items-center space-x-3 pl-6 pr-3 py-2 rounded-md text-sm ${isOnFinanceFbo ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                      >
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                        <span>FBO</span>
                      </Link>
                      <Link
                        href="/dashboard/finance/fbs"
                        className={`flex items-center space-x-3 pl-6 pr-3 py-2 rounded-md text-sm ${isOnFinanceFbs ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                      >
                        <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                        <span>FBS</span>
                      </Link>
                    </>
                  )}
                </div>
                <div className="space-y-0.5">
                  <div
                    className={`w-full flex items-center px-3 py-2 rounded-md ${isOnTms ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    <Link
                      href="/dashboard/tms"
                      onClick={() => setTmsExpanded(true)}
                      className="flex items-center space-x-3 flex-1 text-left"
                    >
                      <Truck className="h-5 w-5 flex-shrink-0" />
                      <span>TMS</span>
                    </Link>
                    <button
                      type="button"
                      onClick={() => setTmsExpanded((v) => !v)}
                      className="ml-2 p-1 rounded hover:bg-muted"
                      aria-label="Развернуть TMS"
                      aria-expanded={tmsExpanded}
                    >
                      <ChevronDown className={`h-5 w-5 transition-transform ${tmsExpanded ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                  {tmsExpanded && (
                    <>
                      {[
                        ["/dashboard/tms", "Дашборд"],
                        ["/dashboard/tms/orders", "Заказы клиентов"],
                        ["/dashboard/tms/requests", "Сравнение тарифов"],
                        ["/dashboard/tms/shipments", "Отгрузки"],
                        ["/dashboard/tms/tracking", "Трекинг"],
                        ["/dashboard/tms/carriers", "Перевозчики"],
                        ["/dashboard/tms/rules", "Правила"],
                        ["/dashboard/tms/analytics", "Аналитика"],
                        ["/dashboard/tms/settings", "Настройки"],
                      ].map(([href, label]) => (
                        <Link
                          key={href}
                          href={href}
                          className={`flex items-center space-x-3 pl-6 pr-3 py-2 rounded-md text-sm ${pathname === href ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                        >
                          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 shrink-0" />
                          <span>{label}</span>
                        </Link>
                      ))}
                    </>
                  )}
                </div>
                <Link
                  href="/dashboard/analytics"
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md ${pathname === "/dashboard/analytics" ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <BarChart3 className="h-5 w-5" />
                  <span>Аналитика</span>
                </Link>
                <Link
                  href="/dashboard/marketplaces"
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md ${pathname === "/dashboard/marketplaces" ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Palette className="h-5 w-5" />
                  <span>Маркетплейсы</span>
                </Link>
                <Link
                  href="/dashboard/subscription"
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md ${pathname === "/dashboard/subscription" ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <CreditCard className="h-5 w-5" />
                  <span>Подписка</span>
                </Link>
                <Link
                  href="/dashboard/settings"
                  className={`flex items-center space-x-3 px-3 py-2 rounded-md ${pathname === "/dashboard/settings" ? "text-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  <Settings className="h-5 w-5" />
                  <span>Настройки</span>
                </Link>
                {isAdmin() && (
                  <Link
                    href="/admin"
                    className="flex items-center space-x-3 px-3 py-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Shield className="h-5 w-5" />
                    <span>Админ-панель</span>
                  </Link>
                )}
                <div className="border-t my-4" />
                <LogoutButton className="w-full justify-start text-muted-foreground hover:text-destructive" />
              </nav>
            </Card>
          </aside>

          <main className="min-w-0 overflow-x-hidden">{children}</main>
        </div>
      </div>
    </div>
  )
}
