import Link from "next/link"
import type { Metadata } from "next"
import { Button, Badge } from "@handyseller/ui"
import { HomeLogoLink } from "@/components/home-logo-link"
import { Breadcrumb, generateBreadcrumbSchema } from "@/components/breadcrumb"
import { TrackedLink } from "@/components/tracked-link"
import { ScrollTracker } from "@/components/scroll-tracker"
import {
  ArrowRight,
  Palette,
  BookOpen,
  ChevronRight,
  Lightbulb,
  Calculator,
  Camera,
  FileCheck,
  Package,
} from "lucide-react"

const CONTACTS = {
  telegram: "https://t.me/Handyseller_bot",
  email: "support@handyseller.ru",
}

const BLOG_POSTS = [
  {
    slug: "chto-mozhno-sdelat-svoimi-rukami-dlya-prodazhi",
    title: "Что можно сделать своими руками для продажи на маркетплейсах — 30 идей",
    description: "Список 30 идей хендмейда для продажи: украшения, декор, текстиль, косметика, игрушки, 3D-печать. Что реально продаётся на Wildberries и Ozon.",
    icon: Lightbulb,
    color: "text-yellow-500",
  },
  {
    slug: "kak-rasschitat-tsenu-hendmeida",
    title: "Как правильно рассчитать цену на хендмейд для маркетплейсов",
    description: "Формула расчёта цены: себестоимость + время + упаковка + комиссия + налог + прибыль. Примеры расчёта и типичные ошибки мастеров.",
    icon: Calculator,
    color: "text-green-500",
  },
  {
    slug: "kak-sdelat-foto-hendmeida-dlya-marketpleysov",
    title: "Как сфотографировать хендмейд для маркетплейсов: простой гайд",
    description: "Пошаговый гайд по съёмке на телефон: свет, фон, ракурсы, типичные ошибки. Советы по инфографике для карточек товаров.",
    icon: Camera,
    color: "text-blue-500",
  },
  {
    slug: "kak-stat-samozanyatym-i-nachat-prodavat",
    title: "Как стать самозанятым и начать продавать хендмейд",
    description: "Регистрация через «Мой налог», лимиты дохода, как выставлять чеки при продаже через маркетплейс. Реальные примеры мастеров.",
    icon: FileCheck,
    color: "text-purple-500",
  },
  {
    slug: "kak-upakovyvat-hendmeid-dlya-marketpleysov",
    title: "Как упаковать хендмейд для отправки на маркетплейс",
    description: "Требования к упаковке на Wildberries, Ozon, Яндекс Маркет. Защита хрупких изделий и как красивая упаковка влияет на отзывы.",
    icon: Package,
    color: "text-orange-500",
  },
]

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "Главная", url: "https://app.handyseller.ru" },
  { name: "Блог", url: "https://app.handyseller.ru/blog" },
])

export const metadata: Metadata = {
  title: "Блог HandySeller — советы для мастеров и продавцов хендмейда",
  description:
    "Полезные статьи для мастеров: как продавать хендмейд на маркетплейсах, расчёт цен, фотография товаров, упаковка, самозанятость. Советы от HandySeller.",
  alternates: { canonical: "https://app.handyseller.ru/blog" },
  openGraph: {
    title: "Блог HandySeller — советы для мастеров хендмейда",
    description: "Полезные статьи для мастеров: как продавать на маркетплейсах, расчёт цен, фото, упаковка, самозанятость.",
    url: "https://app.handyseller.ru/blog",
    type: "website",
  },
}

export default function BlogIndex() {
  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between py-2">
          <HomeLogoLink className="flex items-center space-x-2">
            <div className="rounded-lg bg-primary p-1.5">
              <Palette className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">HandySeller</span>
          </HomeLogoLink>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" asChild>
              <TrackedLink href="/login" goal="click_login">Войти</TrackedLink>
            </Button>
            <Button asChild>
              <TrackedLink href="/register" goal="click_start_free">
                Начать бесплатно
                <ArrowRight className="ml-2 h-4 w-4" />
              </TrackedLink>
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 md:py-12">
        <ScrollTracker pageId="blog" />
        <div className="max-w-4xl mx-auto">
          <Breadcrumb items={[
            { label: "Главная", href: "/" },
            { label: "Блог" },
          ]} />

          <Badge variant="secondary" className="mb-4">
            <BookOpen className="mr-1 h-3 w-3" />
            Полезные статьи
          </Badge>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Блог для мастеров: как продавать хендмейд на маркетплейсах
          </h1>

          <p className="text-lg text-muted-foreground mb-8">
            Собрали полезные материалы для мастеров, которые хотят продавать товары 
            ручной работы на Wildberries, Ozon и Яндекс Маркете. От идей что делать 
            до тонкостей упаковки — всё, что нужно знать перед стартом.
          </p>

          {/* Статьи */}
          <div className="grid gap-6 mb-12">
            {BLOG_POSTS.map((post) => {
              const Icon = post.icon
              return (
                <Link
                  key={post.slug}
                  href={`/blog/${post.slug}`}
                  className="group border rounded-xl p-6 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div className={`h-12 w-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 ${post.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors">
                        {post.title}
                      </h2>
                      <p className="text-muted-foreground mb-3">
                        {post.description}
                      </p>
                      <span className="inline-flex items-center text-sm text-primary font-medium">
                        Читать статью
                        <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-1 transition-transform" />
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Гайды по маркетплейсам */}
          <section className="bg-muted/50 rounded-2xl p-8 mb-12">
            <h2 className="text-2xl font-bold mb-4">Гайды по маркетплейсам</h2>
            <p className="text-muted-foreground mb-6">
              Подробные инструкции по выходу на каждую площадку:
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <Link
                href="/kak-prodavat-hendmeid-na-wildberries"
                className="border rounded-lg p-4 bg-background hover:shadow-md transition-shadow"
              >
                <h3 className="font-bold mb-1">Wildberries</h3>
                <p className="text-sm text-muted-foreground">Как начать продавать хендмейд на WB</p>
              </Link>
              <Link
                href="/kak-prodavat-hendmeid-na-ozon"
                className="border rounded-lg p-4 bg-background hover:shadow-md transition-shadow"
              >
                <h3 className="font-bold mb-1">Ozon</h3>
                <p className="text-sm text-muted-foreground">Гайд по продаже хендмейда на Озон</p>
              </Link>
              <Link
                href="/kak-prodavat-hendmeid-na-yandex-markete"
                className="border rounded-lg p-4 bg-background hover:shadow-md transition-shadow"
              >
                <h3 className="font-bold mb-1">Яндекс Маркет</h3>
                <p className="text-sm text-muted-foreground">Инструкция для Яндекс Маркета</p>
              </Link>
            </div>
          </section>

          {/* CTA */}
          <section className="bg-primary/5 border border-primary/20 rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">
              Готовы автоматизировать продажи?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              HandySeller помогает мастерам управлять товарами, заказами и остатками 
              на всех маркетплейсах из одного окна. Начните с бесплатного тарифа.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Button size="lg" asChild>
                <TrackedLink href="/register" goal="click_start_free">
                  Попробовать бесплатно
                  <ArrowRight className="ml-2 h-5 w-5" />
                </TrackedLink>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <TrackedLink href="/login" goal="click_login">Уже есть аккаунт</TrackedLink>
              </Button>
            </div>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 mt-12">
        <div className="container">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="space-y-3">
              <HomeLogoLink className="flex items-center space-x-2">
                <div className="rounded-lg bg-primary p-2">
                  <Palette className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold">HandySeller</span>
              </HomeLogoLink>
              <p className="text-sm text-muted-foreground">
                Продавайте изделия ручной работы на всех маркетплейсах из одного окна
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-sm">Навигация</h4>
              <nav className="space-y-2">
                <Link href="/#features" className="text-muted-foreground hover:text-primary block">
                  Возможности
                </Link>
                <Link href="/#for-who" className="text-muted-foreground hover:text-primary block">
                  Для кого
                </Link>
                <Link href="/#pricing" className="text-muted-foreground hover:text-primary block">
                  Тарифы
                </Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-sm">Ресурсы</h4>
              <nav className="space-y-2">
                <Link href="/kak-prodavat-hendmeid-na-wildberries" className="text-muted-foreground hover:text-primary block">
                  Как продавать на WB
                </Link>
                <Link href="/kak-prodavat-hendmeid-na-ozon" className="text-muted-foreground hover:text-primary block">
                  Как продавать на Ozon
                </Link>
                <Link href="/kak-prodavat-hendmeid-na-yandex-markete" className="text-muted-foreground hover:text-primary block">
                  Как продавать на Яндекс Маркете
                </Link>
                <Link href="/blog" className="text-muted-foreground hover:text-primary block">
                  Блог
                </Link>
                <Link href="/faq" className="text-muted-foreground hover:text-primary block">
                  FAQ
                </Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-sm">Контакты</h4>
              <div className="space-y-2">
                <a
                  href={CONTACTS.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary block"
                >
                  Telegram
                </a>
                <a
                  href={`mailto:${CONTACTS.email}`}
                  className="text-muted-foreground hover:text-primary block"
                >
                  {CONTACTS.email}
                </a>
              </div>
            </div>
          </div>
          <div className="border-t mt-6 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground">© 2026 HandySeller. Все права защищены.</p>
            <div className="flex gap-4 text-sm">
              <Link href="/oferta" className="text-muted-foreground hover:text-primary">Оферта</Link>
              <Link href="/privacy" className="text-muted-foreground hover:text-primary">Конфиденциальность</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
