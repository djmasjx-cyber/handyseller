import Link from "next/link"
import type { Metadata } from "next"
import { Button, Badge } from "@handyseller/ui"
import { HomeLogoLink } from "@/components/home-logo-link"
import { Breadcrumb, generateBreadcrumbSchema } from "@/components/breadcrumb"
import { TrackedLink } from "@/components/tracked-link"
import { ScrollTracker } from "@/components/scroll-tracker"
import {
  ArrowRight,
  Zap,
  Palette,
  ShoppingBag,
  FileText,
  Camera,
  ChevronRight,
  MessageCircle,
  ExternalLink,
} from "lucide-react"

const CONTACTS = {
  telegram: "https://t.me/Handyseller_bot",
  email: "support@handyseller.ru",
}

const MARKETPLACES = [
  {
    name: "Wildberries",
    description: "Большая аудитория, строгая логистика, подходит для серийного хендмейда",
    forWhom: "Мастера с налаженным производством и готовностью к строгим требованиям",
    link: "/kak-prodavat-hendmeid-na-wildberries",
    available: true,
  },
  {
    name: "Ozon",
    description: "Гибкие схемы FBS, удобно для небольших партий, хорошо заходит авторский декор",
    forWhom: "Мастера с небольшими партиями и уникальными изделиями",
    link: "/kak-prodavat-hendmeid-na-ozon",
    available: true,
  },
  {
    name: "Яндекс Маркет",
    description: "Растущая платформа, интеграция с Яндекс.Поиском и Алисой, низкая конкуренция",
    forWhom: "Мастера, ищущие новые каналы продаж с дополнительной аудиторией",
    link: "/kak-prodavat-hendmeid-na-yandex-markete",
    available: true,
  },
]

const STEPS = [
  { num: 1, title: "Выбрать статус", desc: "Самозанятый или ИП — зависит от ваших планов и объёмов" },
  { num: 2, title: "Зарегистрироваться", desc: "Создать аккаунт продавца на выбранной площадке" },
  { num: 3, title: "Подготовить товары", desc: "Фото, описания, цены с учётом комиссий" },
  { num: 4, title: "Выбрать схему доставки", desc: "FBO (склад маркетплейса) или FBS (своё хранение)" },
  { num: 5, title: "Первые продажи", desc: "Запустить карточки и собрать первые отзывы" },
  { num: 6, title: "Масштабироваться", desc: "Добавить площадки и автоматизировать учёт с HandySeller" },
]

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Как продавать хендмейд на маркетплейсах — полный гайд для мастеров",
  description: "Где и как продавать товары ручной работы на маркетплейсах: Wildberries, Ozon, Яндекс Маркет. Пошаговый гайд для мастеров и самозанятых.",
  author: { "@type": "Organization", name: "HandySeller" },
  publisher: { "@type": "Organization", name: "HandySeller", url: "https://app.handyseller.ru" },
  datePublished: "2026-03-01",
  dateModified: new Date().toISOString().split("T")[0],
}

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "Главная", url: "https://app.handyseller.ru" },
  { name: "Хендмейд на маркетплейсах", url: "https://app.handyseller.ru/kak-prodavat-hendmeid-na-marketpleysah" },
])

export const metadata: Metadata = {
  title: "Как продавать хендмейд на маркетплейсах — полный гайд для мастеров",
  description:
    "Где и как продавать товары ручной работы на маркетплейсах: Wildberries, Ozon, Яндекс Маркет. Пошаговый гайд для мастеров и самозанятых. Начните с HandySeller.",
  alternates: { canonical: "https://app.handyseller.ru/kak-prodavat-hendmeid-na-marketpleysah" },
  openGraph: {
    title: "Как продавать хендмейд на маркетплейсах — полный гайд",
    description: "Пошаговый гайд для мастеров: Wildberries, Ozon, Яндекс Маркет. Где и как продавать товары ручной работы.",
    url: "https://app.handyseller.ru/kak-prodavat-hendmeid-na-marketpleysah",
    type: "article",
  },
}

export default function HowToSellHandmadeOnMarketplaces() {
  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
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
        <ScrollTracker pageId="marketplaces" />
        <article className="max-w-4xl mx-auto">
          <Breadcrumb items={[
            { label: "Главная", href: "/" },
            { label: "Хендмейд на маркетплейсах" },
          ]} />

          <Badge variant="secondary" className="mb-4">
            <Zap className="mr-1 h-3 w-3" />
            Полный гайд
          </Badge>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
            Как продавать хендмейд на маркетплейсах
          </h1>

          {/* Блок 1: Вступление */}
          <section className="mb-12">
            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Маркетплейсы — это реальный и доступный канал продаж для мастера,
                даже если вы раньше никогда не продавали онлайн. Wildberries, Ozon,
                Яндекс Маркет ежедневно посещают миллионы покупателей, которые ищут
                уникальные товары ручной работы.
              </p>
              <p>
                Если вы делаете свечи, украшения, вязаные изделия, керамику или
                декор — эта страница поможет вам разобраться, с чего начать и какую
                площадку выбрать. А HandySeller возьмёт на себя рутину: синхронизацию
                остатков, управление заказами и выгрузку карточек.
              </p>
            </div>

            <Button size="lg" className="mt-6" asChild>
              <TrackedLink href="/register" goal="click_start_free">
                Попробовать HandySeller бесплатно
                <ArrowRight className="ml-2 h-5 w-5" />
              </TrackedLink>
            </Button>
          </section>

          {/* Блок 2: Какой маркетплейс выбрать */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShoppingBag className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                На каком маркетплейсе лучше продавать хендмейд
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {MARKETPLACES.map((mp) => (
                <div
                  key={mp.name}
                  className={`border rounded-lg p-5 ${mp.available ? "hover:shadow-lg transition-shadow" : "opacity-60"}`}
                >
                  <h3 className="text-lg font-bold mb-2">{mp.name}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{mp.description}</p>
                  <p className="text-xs text-muted-foreground mb-4">
                    <strong>Для кого:</strong> {mp.forWhom}
                  </p>
                  {mp.available ? (
                    <Link
                      href={mp.link}
                      className="inline-flex items-center text-sm text-primary hover:underline"
                    >
                      Читать гайд
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">Скоро</span>
                  )}
                </div>
              ))}
            </div>

            <div className="bg-muted/50 rounded-lg p-4 border">
              <p className="text-sm mb-0">
                <strong>💡 Совет:</strong> многие мастера успешно работают сразу на 2–3
                площадках. HandySeller помогает управлять всеми из одного окна — без
                дублирования работы и путаницы в остатках.
              </p>
            </div>
          </section>

          {/* Блок 3: Общие шаги */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                С чего начать продажу хендмейда на маркетплейсах
              </h2>
            </div>

            <div className="space-y-4">
              {STEPS.map((step) => (
                <div key={step.num} className="flex gap-4 items-start">
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm flex-shrink-0">
                    {step.num}
                  </div>
                  <div>
                    <h3 className="font-bold">{step.title}</h3>
                    <p className="text-sm text-muted-foreground">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-muted/50 rounded-lg p-4 border mt-6">
              <p className="text-sm mb-0">
                <strong>🚀 На шаге 6:</strong> именно здесь HandySeller берёт рутину на
                себя — синхронизация остатков, единый список заказов, выгрузка на все
                площадки.
              </p>
            </div>
          </section>

          {/* Блок 4: Статус */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Самозанятый или ИП: что выбрать для продажи хендмейда
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Для продажи на маркетплейсах нужен официальный статус.
                Большинство мастеров выбирают один из двух вариантов:
              </p>

              <div className="grid md:grid-cols-2 gap-4 my-6 not-prose">
                <div className="border rounded-lg p-4">
                  <h3 className="font-bold mb-2 text-foreground">Самозанятый</h3>
                  <p className="text-sm text-muted-foreground">
                    Регистрация за 5 минут, налог 4–6%, лимит 2,4 млн ₽/год.
                    Идеально для старта.
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <h3 className="font-bold mb-2 text-foreground">ИП</h3>
                  <p className="text-sm text-muted-foreground">
                    Без лимита по доходу, можно масштабироваться, но нужна отчётность.
                  </p>
                </div>
              </div>

              <p>
                Подробнее о выборе статуса и нюансах для каждой площадки —{" "}
                <Link href="/faq" className="text-primary hover:underline">
                  в нашем FAQ
                </Link>
                .
              </p>
            </div>
          </section>

          {/* Блок 5: Карточки товара */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Camera className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Как оформить карточку хендмейда на любом маркетплейсе
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>Универсальные советы, которые работают на всех площадках:</p>
              <ul className="space-y-1">
                <li>
                  <strong>Фото:</strong> 5+ снимков при хорошем свете, детали крупным
                  планом, фото в руках для масштаба
                </li>
                <li>
                  <strong>Название:</strong> включите ключевые слова — «ручная работа»,
                  «авторская», название материала
                </li>
                <li>
                  <strong>Описание:</strong> материалы, размеры, назначение, уход
                </li>
                <li>
                  <strong>Цена:</strong> себестоимость + комиссия площадки + логистика +
                  налог + ваша прибыль
                </li>
              </ul>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>⚡ HandySeller:</strong> описываете товар один раз — и выгружаете
                  на все площадки. Шаблоны описаний экономят время на рутине.
                </p>
              </div>
            </div>
          </section>

          {/* Блок 6: Навигационные карточки */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <ExternalLink className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">Гайды по маркетплейсам для мастеров</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <Link
                href="/kak-prodavat-hendmeid-na-wildberries"
                className="border rounded-lg p-5 hover:shadow-lg transition-shadow group"
              >
                <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">
                  Как продавать на Wildberries
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Пошаговая инструкция для мастеров: регистрация, карточки, логистика
                </p>
                <span className="inline-flex items-center text-sm text-primary">
                  Читать
                  <ChevronRight className="h-4 w-4 ml-1" />
                </span>
              </Link>

              <Link
                href="/kak-prodavat-hendmeid-na-ozon"
                className="border rounded-lg p-5 hover:shadow-lg transition-shadow group"
              >
                <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">
                  Как продавать на Ozon
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  FBO/FBS, карточки, сравнение с Wildberries
                </p>
                <span className="inline-flex items-center text-sm text-primary">
                  Читать
                  <ChevronRight className="h-4 w-4 ml-1" />
                </span>
              </Link>

              <Link
                href="/faq"
                className="border rounded-lg p-5 hover:shadow-lg transition-shadow group"
              >
                <h3 className="text-lg font-bold mb-2 group-hover:text-primary transition-colors">
                  Частые вопросы мастеров
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  ИП или самозанятый? Нужен ли сертификат? Как не запутаться в заказах?
                </p>
                <span className="inline-flex items-center text-sm text-primary">
                  Читать
                  <ChevronRight className="h-4 w-4 ml-1" />
                </span>
              </Link>
            </div>
          </section>

          {/* Блок 7: Финальный CTA */}
          <section className="bg-muted/50 rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">
              Продавайте хендмейд на всех маркетплейсах из одного окна
            </h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              HandySeller синхронизирует остатки на Wildberries и Ozon, помогает
              выгружать карточки и отслеживать заказы. Работает с телефона — даже
              если вы в мастерской, а не за компьютером.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/register">
                  Начать бесплатно
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Уже продаю</Link>
              </Button>
            </div>
          </section>
        </article>
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
                <Link href="/#pricing" className="text-muted-foreground hover:text-primary block">
                  Тарифы
                </Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-sm">Гайды</h4>
              <nav className="space-y-2">
                <Link
                  href="/kak-prodavat-hendmeid-na-marketpleysah"
                  className="text-muted-foreground hover:text-primary block"
                >
                  Хендмейд на маркетплейсах
                </Link>
                <Link
                  href="/kak-prodavat-hendmeid-na-wildberries"
                  className="text-muted-foreground hover:text-primary block"
                >
                  Как продавать на WB
                </Link>
                <Link
                  href="/kak-prodavat-hendmeid-na-ozon"
                  className="text-muted-foreground hover:text-primary block"
                >
                  Как продавать на Ozon
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
          <div className="border-t mt-6 pt-6 text-center text-sm text-muted-foreground">
            <p>© 2026 HandySeller. Все права защищены.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
