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
  Lightbulb,
  Gem,
  Home,
  Shirt,
  Sparkles,
  Gamepad2,
  Printer,
} from "lucide-react"

const CONTACTS = {
  telegram: "https://t.me/Handyseller_bot",
  email: "support@handyseller.ru",
}

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Что можно сделать своими руками для продажи на маркетплейсах — 30 идей",
  description: "Список 30 идей хендмейда для продажи на Wildberries, Ozon и Яндекс Маркете. Украшения, декор, текстиль, косметика, игрушки, 3D-печать.",
  author: { "@type": "Organization", name: "HandySeller" },
  publisher: { "@type": "Organization", name: "HandySeller", url: "https://app.handyseller.ru" },
  datePublished: "2026-03-01",
  dateModified: new Date().toISOString().split("T")[0],
}

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "Главная", url: "https://app.handyseller.ru" },
  { name: "Блог", url: "https://app.handyseller.ru/blog" },
  { name: "30 идей для продажи", url: "https://app.handyseller.ru/blog/chto-mozhno-sdelat-svoimi-rukami-dlya-prodazhi" },
])

export const metadata: Metadata = {
  title: "Что можно сделать своими руками для продажи на маркетплейсах — 30 идей",
  description:
    "Список 30 идей хендмейда для продажи: украшения, декор, текстиль, косметика, игрушки, 3D-печать. Что реально продаётся на Wildberries и Ozon.",
  keywords: ["что можно сделать своими руками для продажи", "что продавать хендмейд", "идеи для продажи на маркетплейсах"],
  alternates: { canonical: "https://app.handyseller.ru/blog/chto-mozhno-sdelat-svoimi-rukami-dlya-prodazhi" },
  openGraph: {
    title: "30 идей хендмейда для продажи на маркетплейсах",
    description: "Что можно сделать своими руками и продать на Wildberries, Ozon, Яндекс Маркете.",
    url: "https://app.handyseller.ru/blog/chto-mozhno-sdelat-svoimi-rukami-dlya-prodazhi",
    type: "article",
  },
}

const CATEGORIES = [
  {
    name: "Украшения и бижутерия",
    icon: Gem,
    color: "text-pink-500",
    ideas: [
      "Серьги из полимерной глины",
      "Браслеты с натуральными камнями",
      "Кулоны из эпоксидной смолы",
      "Броши ручной вышивки",
      "Заколки и резинки для волос",
    ],
    why: "Украшения — один из самых востребованных сегментов хендмейда. Низкая себестоимость, небольшой вес (дешёвая доставка), высокая маржинальность. На маркетплейсах покупатели ищут уникальные изделия, которых нет в масс-маркете.",
  },
  {
    name: "Декор для дома",
    icon: Home,
    color: "text-amber-500",
    ideas: [
      "Свечи ароматические и декоративные",
      "Вазы и кашпо из гипса или бетона",
      "Панно и картины из сухоцветов",
      "Подсвечники из дерева или керамики",
      "Интерьерные игрушки (тильды, мишки)",
    ],
    why: "Декор для дома хорошо продаётся круглый год, а перед праздниками — особенно. Покупатели ищут авторские вещи, которые добавят уюта. Свечи — отдельный хит: низкий порог входа и постоянный спрос.",
  },
  {
    name: "Текстиль и вязание",
    icon: Shirt,
    color: "text-blue-500",
    ideas: [
      "Вязаные шапки и шарфы",
      "Пледы и покрывала ручной работы",
      "Детские комплекты (пинетки, шапочки)",
      "Сумки-шопперы из ткани",
      "Фартуки и прихватки с авторским принтом",
    ],
    why: "Текстиль — сезонный товар с хорошими пиками осенью и зимой. Вязаные изделия ценятся за уникальность: покупатель получает вещь, которой больше ни у кого нет. Детские товары особенно популярны — родители охотно покупают качественный хендмейд.",
  },
  {
    name: "Косметика и уход",
    icon: Sparkles,
    color: "text-purple-500",
    ideas: [
      "Мыло ручной работы",
      "Бомбочки для ванны",
      "Бальзамы для губ",
      "Скрабы и масла для тела",
      "Твёрдые шампуни",
    ],
    why: "Натуральная косметика в тренде: покупатели устали от химии и ищут «чистые» составы. Мыло и бомбочки — идеальный подарок, а значит, стабильный спрос перед праздниками. Важно: нужна сертификация для продажи косметики на маркетплейсах.",
  },
  {
    name: "Игрушки и детские товары",
    icon: Gamepad2,
    color: "text-green-500",
    ideas: [
      "Вязаные игрушки амигуруми",
      "Развивающие бизиборды",
      "Мягкие игрушки из плюша",
      "Деревянные погремушки и грызунки",
      "Мобили в кроватку",
    ],
    why: "Родители готовы платить за безопасные и качественные игрушки. Деревянные и вязаные игрушки воспринимаются как экологичные и безопасные. Бизиборды — отдельный хит: высокий средний чек и низкая конкуренция.",
  },
  {
    name: "3D-печать и лазерная резка",
    icon: Printer,
    color: "text-cyan-500",
    ideas: [
      "Держатели для телефонов и планшетов",
      "Органайзеры и подставки",
      "Фигурки и миниатюры",
      "Таблички и номерки на дверь",
      "Персонализированные подарки",
    ],
    why: "3D-печать позволяет создавать уникальные товары с минимальными затратами на материалы. Высокая маржа на персонализированных изделиях. Лазерная резка дерева — отдельная ниша с постоянным спросом на таблички, ключницы, подставки.",
  },
]

export default function HandmadeIdeasPage() {
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
        <ScrollTracker pageId="blog-ideas" />
        <article className="max-w-4xl mx-auto">
          <Breadcrumb items={[
            { label: "Главная", href: "/" },
            { label: "Блог", href: "/blog" },
            { label: "30 идей для продажи" },
          ]} />

          <Badge variant="secondary" className="mb-4">
            <Lightbulb className="mr-1 h-3 w-3" />
            Идеи для бизнеса
          </Badge>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
            Что можно сделать своими руками для продажи на маркетплейсах
          </h1>

          {/* Вступление */}
          <section className="mb-12">
            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Если вы умеете создавать красивые вещи своими руками — это уже готовый 
                бизнес. Маркетплейсы Wildberries, Ozon и Яндекс Маркет открывают доступ 
                к миллионам покупателей, которые ищут уникальные товары ручной работы.
              </p>
              <p>
                Мы собрали 30 идей хендмейда, которые реально продаются на маркетплейсах. 
                Каждая категория — это проверенная ниша с устойчивым спросом. Выбирайте то, 
                что умеете делать лучше всего, и начинайте продавать.
              </p>
            </div>
          </section>

          {/* Категории */}
          {CATEGORIES.map((category, index) => {
            const Icon = category.icon
            return (
              <section key={category.name} className="mb-12">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`h-10 w-10 rounded-lg bg-muted flex items-center justify-center ${category.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-2xl font-bold">
                    {index + 1}. {category.name}
                  </h2>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="border rounded-lg p-4">
                    <h3 className="font-bold mb-3">Идеи товаров:</h3>
                    <ul className="space-y-2">
                      {category.ideas.map((idea) => (
                        <li key={idea} className="flex items-start gap-2">
                          <span className="text-primary mt-1">•</span>
                          <span>{idea}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-4">
                    <h3 className="font-bold mb-3">Почему это продаётся:</h3>
                    <p className="text-muted-foreground text-sm">{category.why}</p>
                  </div>
                </div>
              </section>
            )
          })}

          {/* Как выбрать нишу */}
          <section className="bg-muted/50 rounded-2xl p-8 mb-12">
            <h2 className="text-2xl font-bold mb-4">Как выбрать свою нишу</h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                <strong>1. Начните с того, что умеете.</strong> Если вы уже делаете 
                что-то для себя или на подарки — это и есть ваша ниша. Не нужно учиться 
                новому ремеслу ради маркетплейсов.
              </p>
              <p>
                <strong>2. Проверьте спрос.</strong> Зайдите на Wildberries или Ozon, 
                найдите похожие товары и посмотрите количество отзывов. Если отзывов много — 
                товар продаётся.
              </p>
              <p>
                <strong>3. Посчитайте экономику.</strong> Учтите себестоимость материалов, 
                время на изготовление, комиссию маркетплейса (15–25%), налог самозанятого (4–6%), 
                упаковку и доставку. Если после всех расходов остаётся прибыль — ниша рабочая.
              </p>
              <p>
                <strong>4. Начните с малого.</strong> Не нужно сразу делать 100 товаров. 
                Выложите 5–10 позиций, соберите первые отзывы, поймите, что нравится покупателям.
              </p>
            </div>
          </section>

          {/* Связка с HandySeller */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Как HandySeller помогает мастерам</h2>
            <p className="text-muted-foreground mb-4">
              Когда вы начнёте продавать на нескольких площадках одновременно, появится 
              проблема: нужно следить за остатками, обрабатывать заказы, обновлять карточки. 
              HandySeller автоматизирует эту рутину:
            </p>
            <ul className="space-y-2 text-muted-foreground mb-6">
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span>Синхронизация остатков между WB, Ozon и Яндекс Маркетом</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span>Единый список заказов со всех площадок</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span>Выгрузка карточек товаров на несколько маркетплейсов сразу</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-primary mt-1">✓</span>
                <span>Учёт себестоимости и расчёт прибыли</span>
              </li>
            </ul>

            <Button size="lg" asChild>
              <TrackedLink href="/register" goal="click_start_free">
                Попробовать HandySeller бесплатно
                <ArrowRight className="ml-2 h-5 w-5" />
              </TrackedLink>
            </Button>
          </section>

          {/* Читайте также */}
          <section className="bg-muted/50 rounded-lg p-6 border">
            <h3 className="font-bold mb-4">📚 Читайте также:</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/blog/kak-rasschitat-tsenu-hendmeida" className="text-primary hover:underline">
                  Как правильно рассчитать цену на хендмейд
                </Link>
              </li>
              <li>
                <Link href="/blog/kak-sdelat-foto-hendmeida-dlya-marketpleysov" className="text-primary hover:underline">
                  Как сфотографировать хендмейд для маркетплейсов
                </Link>
              </li>
              <li>
                <Link href="/kak-prodavat-hendmeid-na-marketpleysah" className="text-primary hover:underline">
                  Полный гайд: как продавать хендмейд на маркетплейсах
                </Link>
              </li>
            </ul>
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
                <Link href="/#features" className="text-muted-foreground hover:text-primary block">Возможности</Link>
                <Link href="/#pricing" className="text-muted-foreground hover:text-primary block">Тарифы</Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-sm">Ресурсы</h4>
              <nav className="space-y-2">
                <Link href="/blog" className="text-muted-foreground hover:text-primary block">Блог</Link>
                <Link href="/kak-prodavat-hendmeid-na-marketpleysah" className="text-muted-foreground hover:text-primary block">Гайды по маркетплейсам</Link>
                <Link href="/faq" className="text-muted-foreground hover:text-primary block">FAQ</Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-bold text-sm">Контакты</h4>
              <div className="space-y-2">
                <a href={CONTACTS.telegram} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary block">Telegram</a>
                <a href={`mailto:${CONTACTS.email}`} className="text-muted-foreground hover:text-primary block">{CONTACTS.email}</a>
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
