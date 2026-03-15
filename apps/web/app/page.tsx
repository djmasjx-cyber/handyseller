import Link from "next/link"
import Image from "next/image"
import type { Metadata } from "next"
import { Button, Badge } from "@handyseller/ui"
import { HomeLogoLink } from "@/components/home-logo-link"
import { TrackedLink, TrackedAnchor } from "@/components/tracked-link"
import { TelegramLink } from "@/components/telegram-link"
import {
  ArrowRight,
  Zap,
  Shield,
  Smartphone,
  Palette,
  Users,
  Hammer,
  Printer,
  Scissors,
  Gem,
  Hand,
  MessageCircle,
} from "lucide-react"

const CONTACTS = {
  telegramUsername: "Handyseller_bot",
  email: "support@handyseller.ru",
}

const FAQ = [
  { q: "Где можно продать самодельные вещи и хенд мейд?", a: "На Ozon и Wildberries — крупнейших маркетплейсах России. HandySeller помогает выкладывать изделия ручной работы на обе площадки из одного окна." },
  { q: "Как продать хенд мейд на Ozon и Wildberries?", a: "Зарегистрируйтесь как самозанятый, подключите HandySeller, добавьте товары — они автоматически появятся на Ozon и Wildberries. Одно описание, синхронизация остатков." },
  { q: "Подойдёт ли для свечей, бус из жемчуга и 3D-моделей?", a: "Да. Свечи ручной работы, бусы из натуральных камней и жемчуга, 3D-печать — HandySeller для любого handmade." },
  { q: "Нужен ли мне ИП или ООО?", a: "Нет. Вы можете зарегистрироваться как самозанятый за 5 минут через приложение «Мой налог» и сразу начать продавать." },
  { q: "Можно ли вести учёт с телефона?", a: "Да. HandySeller удобно работает на смартфоне — добавляйте товары, следите за заказами из мастерской." },
]

export const metadata: Metadata = {
  title: "HandySeller — программа для продажи handmade на Wildberries и Ozon",
  description: "Как продать хенд мейд на Ozon и Wildberries? Свечи, бусы из жемчуга, 3D-модели. Где продавать handmade в интернете — HandySeller.",
  alternates: { canonical: "https://app.handyseller.ru" },
  openGraph: {
    title: "HandySeller — программа для продажи handmade на Wildberries и Ozon",
    description: "Как продать хенд мейд на Ozon и Wildberries? Свечи, бусы из жемчуга, 3D-модели. Где продавать handmade в интернете.",
    url: "https://app.handyseller.ru",
  },
}

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
}

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "HandySeller",
  url: "https://app.handyseller.ru",
  logo: "https://app.handyseller.ru/logo.png",
  description: "Сервис для продажи хендмейда и товаров ручной работы на маркетплейсах Wildberries, Ozon и Яндекс Маркет",
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    availableLanguage: "Russian",
  },
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
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
          <nav className="hidden md:flex items-center space-x-5">
            <a href="#features" className="text-sm font-medium hover:text-primary">
              Возможности
            </a>
            <a href="#for-who" className="text-sm font-medium hover:text-primary">
              Для кого
            </a>
            <a href="#how-it-works" className="text-sm font-medium hover:text-primary">
              Как это работает
            </a>
            <TrackedAnchor href="#pricing" goal="view_pricing" className="text-sm font-medium hover:text-primary">
              Тарифы
            </TrackedAnchor>
            <a href="#faq" className="text-sm font-medium hover:text-primary">
              Вопросы
            </a>
            {/* <a href="#contacts" className="text-sm font-medium hover:text-primary">
              Контакты
            </a> */}
          </nav>
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

      <main>
      {/* Каждый блок: min-h-screen — полный экран, контент у верхней границы (без justify-center), scroll-mt-20 под шапку */}
      <section id="hero" className="min-h-screen container py-12 md:py-16 scroll-mt-20">
        <div className="grid gap-8 lg:grid-cols-2 items-center">
          <div className="space-y-4">
            <Badge variant="secondary" className="text-sm">
              <Zap className="mr-1 h-3 w-3" />
              Просто как никогда
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
              Продавайте свой{" "}
              <span className="text-primary">хенд мейд</span> на всех
              маркетплейсах из одного окна
            </h1>
            <div className="space-y-2 text-lg text-muted-foreground max-w-[600px]">
              <p>Как продать хенд мейд в интернете? Свечи, бусы из жемчуга, 3D-модели, изделия ручной работы — HandySeller объединит всё в одном окне.</p>
              <p>Опишите изделие один раз — оно появится на Ozon и Wildberries с нужными полями. Где продавать handmade? У нас.</p>
              <p>Следите за остатками, заказами и статусами с телефона — даже если вы в мастерской, а не в офисе.</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button size="default" className="px-6" asChild>
                <TrackedLink href="/register" goal="click_start_free">
                  Начать бесплатно
                  <ArrowRight className="ml-2 h-5 w-5" />
                </TrackedLink>
              </Button>
              <Button size="default" variant="outline" className="px-6" asChild>
                <a href="#how-it-works">Как это работает</a>
              </Button>
            </div>
            <div className="flex items-center space-x-3 pt-2">
              <div className="flex -space-x-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-8 w-8 rounded-full border-2 border-background bg-muted"
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground">
                Более 1,000 мастеров уже продают с нами
              </p>
            </div>
          </div>
          <div className="relative">
            <div className="relative rounded-2xl p-4 bg-muted/50 border border-border/40 shadow-sm ring-1 ring-primary/[0.04]">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <div className="relative rounded-lg aspect-[3/4] min-h-28 overflow-hidden">
                  <Image src="/hero/beads.png" alt="Бусины ручной работы" fill className="object-cover" sizes="(max-width: 768px) 80px, 100px" />
                </div>
                <div className="relative rounded-lg aspect-[3/4] min-h-28 overflow-hidden">
                  <Image src="/hero/necklace.png" alt="Колье ручной работы" fill className="object-cover" sizes="(max-width: 768px) 80px, 100px" />
                </div>
                <div className="relative rounded-lg aspect-[3/4] min-h-28 overflow-hidden">
                  <Image src="/hero/printer.png" alt="3D принтер" fill className="object-cover" sizes="(max-width: 768px) 80px, 100px" />
                </div>
                <div className="relative rounded-lg aspect-[3/4] min-h-28 overflow-hidden">
                  <Image src="/hero/decor.png" alt="Домашний декор" fill className="object-cover" sizes="(max-width: 768px) 80px, 100px" />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Бусины ручной работы</p>
                    <p className="text-sm text-muted-foreground">24 шт.</p>
                  </div>
                  <Badge variant="secondary">Активно</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Колье ручной работы</p>
                    <p className="text-sm text-muted-foreground">8 шт.</p>
                  </div>
                  <Badge variant="secondary">Активно</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">3D принтер</p>
                    <p className="text-sm text-muted-foreground">12 шт.</p>
                  </div>
                  <Badge variant="secondary">Активно</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Домашний декор</p>
                    <p className="text-sm text-muted-foreground">5 шт.</p>
                  </div>
                  <Badge variant="secondary">Активно</Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="for-who" className="min-h-screen container py-12 md:py-16 bg-muted/30 scroll-mt-20">
        <div className="text-center mb-8">
          <Badge variant="secondary" className="mb-4">
            <Zap className="mr-1 h-3 w-3" />
            Для кого
          </Badge>
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            Любое ремесло — свой профиль
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            HandySeller создан для мастеров любого направления
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            { icon: Gem, title: "Бусы и бижутерия", text: "Бусы из жемчуга и натуральных камней — продавайте на Ozon и Wildberries без рутины" },
            { icon: Palette, title: "Свечи и декор", text: "Свечи ручной работы, домашний декор — выкладывайте в интернете за минуты" },
            { icon: Printer, title: "3D-модели", text: "Продать 3D-модели в интернете — фигурки, сувениры, учёт заказов с телефона" },
            { icon: Palette, title: "Вязание", text: "Пледы, игрушки, одежда — на Wildberries и Ozon из одного окна" },
            { icon: Scissors, title: "Кожевенное дело", text: "Ремни, кошельки, аксессуары — простое управление карточками" },
            { icon: Hand, title: "Любое handmade", text: "Где продавать handmade? Ozon, Wildberries — HandySeller подстроится под вас" },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
              <div className="mb-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              </div>
              <h3 className="text-lg font-bold mb-1">{title}</h3>
              <p className="text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="min-h-screen container py-12 md:py-16 scroll-mt-20">
        <div className="text-center mb-8">
          <Badge variant="secondary" className="mb-2">
            <Zap className="mr-1 h-3 w-3" />
            Возможности
          </Badge>
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            Всё что нужно для продаж
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Простые инструменты, созданные специально для ремесленников
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
            <div className="mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Palette className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-bold mb-1">Учёт материалов</h3>
            <p className="text-muted-foreground">
              Считайте себестоимость каждой партии. Учитывайте бисер, филамент, кожу, древесину — под ваше ремесло.
            </p>
            <Badge variant="secondary" className="mt-2 text-xs font-medium">
              В разработке
            </Badge>
          </div>

          <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
            <div className="mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-bold mb-1">Удобно со смартфона</h3>
            <p className="text-muted-foreground">
              Фотографируйте готовые изделия и выкладывайте на все площадки за 2 клика.
            </p>
          </div>

          <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
            <div className="mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-bold mb-1">Без ИП и ООО</h3>
            <p className="text-muted-foreground">
              Регистрируйтесь как самозанятый за 5 минут. Продавайте легально без бюрократии.
            </p>
          </div>

          <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
            <div className="mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-bold mb-1">Синхронизация</h3>
            <p className="text-muted-foreground">
              Автоматическая синхронизация остатков на Wildberries и Ozon. Никаких двойных продаж.
            </p>
          </div>

          <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
            <div className="mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-bold mb-1">Аналитика</h3>
            <p className="text-muted-foreground">
              Смотрите, где лучше продаются ваши изделия. Принимайте решения на основе данных.
            </p>
            <Badge variant="secondary" className="mt-2 text-xs font-medium">
              В разработке
            </Badge>
          </div>

          <div className="border rounded-lg p-4 hover:shadow-lg transition-shadow">
            <div className="mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Palette className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-bold mb-1">Шаблоны описаний</h3>
            <p className="text-muted-foreground">
              Готовые шаблоны для описаний изделий. Экономьте время на рутине.
            </p>
            <Badge variant="secondary" className="mt-2 text-xs font-medium">
              В разработке
            </Badge>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="min-h-screen container py-12 md:py-16 bg-muted/50 rounded-2xl scroll-mt-20">
        <div className="text-center mb-8">
          <Badge variant="secondary" className="mb-2">
            <Zap className="mr-1 h-3 w-3" />
            Как это работает
          </Badge>
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            Начните продавать за 3 шага
          </h2>
          <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
            Простая настройка без технических знаний
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center mx-auto text-primary-foreground font-bold text-lg">
              1
            </div>
            <h3 className="text-lg font-bold">Зарегистрируйтесь</h3>
            <p className="text-sm text-muted-foreground">
              Создайте аккаунт и станьте самозанятым за 5 минут через приложение
              «Мой налог»
            </p>
          </div>

          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center mx-auto text-primary-foreground font-bold text-lg">
              2
            </div>
            <h3 className="text-lg font-bold">Подключите маркетплейсы</h3>
            <p className="text-sm text-muted-foreground">
              Свяжите свои аккаунты на Wildberries, Ozon и других площадках
            </p>
          </div>

          <div className="text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center mx-auto text-primary-foreground font-bold text-lg">
              3
            </div>
            <h3 className="text-lg font-bold">Продавайте</h3>
            <p className="text-sm text-muted-foreground">
              Добавляйте товары в приложении — они автоматически появятся на
              всех площадках
            </p>
          </div>
        </div>

        <div className="text-center mt-8">
          <Button size="default" className="px-6" asChild>
            <Link href="/register">
              Начать бесплатно
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section id="pricing" className="min-h-screen container py-12 md:py-16 scroll-mt-20">
        <div className="text-center mb-8">
          <Badge variant="secondary" className="mb-2">
            💰 Тарифы
          </Badge>
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            Выберите подходящий тариф
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Платите только за результат — никаких скрытых платежей
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <div className="border rounded-lg p-6 hover:shadow-lg transition-shadow">
            <h3 className="text-xl font-bold mb-1">Бесплатный</h3>
            <p className="text-muted-foreground mb-4">
              Для тех, кто только начинает
            </p>
            <div className="mb-4">
              <span className="text-3xl font-bold">0 ₽</span>
              <span className="text-muted-foreground">/мес</span>
            </div>
            <ul className="space-y-2 mb-4 text-sm">
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                До 5 активных товаров
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                1 маркетплейс
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Базовая аналитика
              </li>
              <li className="flex items-center text-muted-foreground">
                <span className="mr-2">—</span>
                Учёт материалов
              </li>
              <li className="flex items-center text-muted-foreground">
                <span className="mr-2">—</span>
                Приоритетная поддержка
              </li>
            </ul>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/register">Начать бесплатно</Link>
            </Button>
          </div>

          <div className="border rounded-lg p-6 hover:shadow-lg transition-shadow relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge variant="secondary">Популярный</Badge>
            </div>
            <h3 className="text-xl font-bold mb-1">Любительский</h3>
            <p className="text-muted-foreground mb-4">
              Для активных продавцов
            </p>
            <div className="mb-4">
              <span className="text-3xl font-bold">490 ₽</span>
              <span className="text-muted-foreground">/мес</span>
            </div>
            <ul className="space-y-2 mb-4 text-sm">
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                До 20 активных товаров
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                До 2 маркетплейсов
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Расширенная аналитика
              </li>
              <li className="flex items-center text-muted-foreground">
                <span className="mr-2">—</span>
                Учёт материалов
              </li>
              <li className="flex items-center text-muted-foreground">
                <span className="mr-2">—</span>
                Приоритетная поддержка
              </li>
            </ul>
            <Button className="w-full" asChild>
              <Link href="/register">Попробовать бесплатно</Link>
            </Button>
          </div>

          <div className="border rounded-lg p-6 hover:shadow-lg transition-shadow">
            <h3 className="text-xl font-bold mb-1">Профессиональный</h3>
            <p className="text-muted-foreground mb-4">
              Для успешных мастеров
            </p>
            <div className="mb-4">
              <span className="text-3xl font-bold">1 490 ₽</span>
              <span className="text-muted-foreground">/мес</span>
            </div>
            <ul className="space-y-2 mb-4 text-sm">
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Безлимит товаров
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Все маркетплейсы
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Полная аналитика
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Учёт материалов
              </li>
              <li className="flex items-center">
                <span className="text-green-500 mr-2">✓</span>
                Приоритетная поддержка
              </li>
            </ul>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/register">Попробовать бесплатно</Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="faq" className="min-h-screen container py-12 md:py-16 bg-muted/30 scroll-mt-20">
        <div className="text-center mb-8">
          <Badge variant="secondary" className="mb-2">
            <Zap className="mr-1 h-3 w-3" />
            Вопросы
          </Badge>
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            Часто задаваемые вопросы
          </h2>
        </div>
        <div className="max-w-2xl mx-auto space-y-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="border rounded-lg p-3 group">
              <summary className="font-bold cursor-pointer list-none flex items-center justify-between">
                {q}
                <span className="text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <p className="text-muted-foreground mt-3 pl-0">{a}</p>
            </details>
          ))}
        </div>
        <div className="text-center mt-6">
          <Link href="/faq" className="text-primary hover:underline">
            Смотреть все вопросы →
          </Link>
        </div>
      </section>

      {/* Contacts section hidden — all communication via chat widget
      <section id="contacts" className="min-h-screen container py-12 md:py-16 scroll-mt-20">
        ...
      </section>
      */}
      </main>

      {/* CTA Section */}
      <section className="container py-10 md:py-12 text-center border-t">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Готовы начать продавать свои работы?
          </h2>
          <p className="text-lg text-muted-foreground mb-6">
            Присоединяйтесь к тысячам ремесленников, которые уже продают с
            нами
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Button size="default" className="px-6" asChild>
              <TrackedLink href="/register" goal="click_start_free">
                Начать бесплатно
                <ArrowRight className="ml-2 h-4 w-4" />
              </TrackedLink>
            </Button>
            <Button size="default" variant="outline" className="px-6" asChild>
              <TrackedLink href="/login" goal="click_login">Уже есть аккаунт</TrackedLink>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t py-8">
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
                Продавайте изделия ручной работы на всех маркетплейсах из одного
                окна
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-sm">Навигация</h4>
              <nav className="space-y-2">
                <a href="#features" className="text-muted-foreground hover:text-primary block">
                  Возможности
                </a>
                <a href="#for-who" className="text-muted-foreground hover:text-primary block">
                  Для кого
                </a>
                <a href="#how-it-works" className="text-muted-foreground hover:text-primary block">
                  Как это работает
                </a>
                <a href="#pricing" className="text-muted-foreground hover:text-primary block">
                  Тарифы
                </a>
                <a href="#faq" className="text-muted-foreground hover:text-primary block">
                  FAQ
                </a>
                {/* <a href="#contacts" className="text-muted-foreground hover:text-primary block">
                  Контакты
                </a> */}
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-sm">Ресурсы</h4>
              <nav className="space-y-2">
                <div><Link href="/kak-prodavat-hendmeid-na-marketpleysah" className="text-muted-foreground hover:text-primary">Хендмейд на маркетплейсах</Link></div>
                <div><Link href="/kak-prodavat-hendmeid-na-wildberries" className="text-muted-foreground hover:text-primary">Как продавать на WB</Link></div>
                <div><Link href="/kak-prodavat-hendmeid-na-ozon" className="text-muted-foreground hover:text-primary">Как продавать на Ozon</Link></div>
                <div><Link href="/kak-prodavat-hendmeid-na-yandex-markete" className="text-muted-foreground hover:text-primary">Как продавать на Яндекс Маркете</Link></div>
                <div><Link href="/blog" className="text-muted-foreground hover:text-primary">Блог</Link></div>
                <div><Link href="/faq" className="text-muted-foreground hover:text-primary">FAQ</Link></div>
                <div><Link href="/oferta" className="text-muted-foreground hover:text-primary">Оферта</Link></div>
                <div><Link href="/privacy" className="text-muted-foreground hover:text-primary">Политика конфиденциальности</Link></div>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-sm">Контакты</h4>
              <div className="space-y-2">
                <TelegramLink
                  username={CONTACTS.telegramUsername}
                  source="footer_main"
                  className="text-muted-foreground hover:text-primary block"
                >
                  Telegram
                </TelegramLink>
                <a href={`mailto:${CONTACTS.email}`} className="text-muted-foreground hover:text-primary block">
                  {CONTACTS.email}
                </a>
              </div>
            </div>
          </div>
          <div className="border-t mt-6 pt-6 text-center text-sm text-muted-foreground">
            <p>© 2026 HandySeller. Все права защищены.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
