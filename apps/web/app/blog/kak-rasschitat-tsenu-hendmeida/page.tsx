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
  Calculator,
  AlertTriangle,
} from "lucide-react"

const CONTACTS = {
  telegram: "https://t.me/Handyseller_bot",
  email: "support@handyseller.ru",
}

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Как правильно рассчитать цену на хендмейд для маркетплейсов",
  description: "Формула расчёта цены на изделия ручной работы: себестоимость, время, упаковка, комиссия маркетплейса, налог, прибыль. Примеры расчёта.",
  author: { "@type": "Organization", name: "HandySeller" },
  publisher: { "@type": "Organization", name: "HandySeller", url: "https://app.handyseller.ru" },
  datePublished: "2026-03-01",
  dateModified: new Date().toISOString().split("T")[0],
}

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "Главная", url: "https://app.handyseller.ru" },
  { name: "Блог", url: "https://app.handyseller.ru/blog" },
  { name: "Расчёт цены", url: "https://app.handyseller.ru/blog/kak-rasschitat-tsenu-hendmeida" },
])

export const metadata: Metadata = {
  title: "Как правильно рассчитать цену на хендмейд для маркетплейсов",
  description:
    "Формула расчёта цены: себестоимость материалов + время + упаковка + комиссия + налог + прибыль. Примеры расчёта и типичные ошибки мастеров.",
  keywords: ["как рассчитать цену на хендмейд", "цена на изделия ручной работы", "ценообразование хендмейд"],
  alternates: { canonical: "https://app.handyseller.ru/blog/kak-rasschitat-tsenu-hendmeida" },
  openGraph: {
    title: "Как рассчитать цену на хендмейд для маркетплейсов",
    description: "Формула расчёта цены на изделия ручной работы с примерами.",
    url: "https://app.handyseller.ru/blog/kak-rasschitat-tsenu-hendmeida",
    type: "article",
  },
}

const EXAMPLES = [
  {
    name: "Ароматическая свеча",
    materials: 150,
    time: 0.5,
    hourlyRate: 500,
    packaging: 50,
    commission: 0.20,
    tax: 0.06,
    margin: 0.30,
  },
  {
    name: "Серьги из полимерной глины",
    materials: 80,
    time: 1,
    hourlyRate: 500,
    packaging: 30,
    commission: 0.20,
    tax: 0.06,
    margin: 0.30,
  },
  {
    name: "Вязаная шапка",
    materials: 300,
    time: 4,
    hourlyRate: 400,
    packaging: 40,
    commission: 0.15,
    tax: 0.06,
    margin: 0.25,
  },
]

function calculatePrice(example: typeof EXAMPLES[0]) {
  const laborCost = example.time * example.hourlyRate
  const baseCost = example.materials + laborCost + example.packaging
  const priceBeforeMargin = baseCost / (1 - example.commission - example.tax)
  const finalPrice = priceBeforeMargin / (1 - example.margin)
  return {
    laborCost,
    baseCost,
    finalPrice: Math.ceil(finalPrice / 10) * 10,
  }
}

export default function PricingGuidePage() {
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
        <ScrollTracker pageId="blog-pricing" />
        <article className="max-w-4xl mx-auto">
          <Breadcrumb items={[
            { label: "Главная", href: "/" },
            { label: "Блог", href: "/blog" },
            { label: "Расчёт цены" },
          ]} />

          <Badge variant="secondary" className="mb-4">
            <Calculator className="mr-1 h-3 w-3" />
            Ценообразование
          </Badge>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
            Как рассчитать цену на хендмейд для продажи на маркетплейсах
          </h1>

          {/* Вступление */}
          <section className="mb-12">
            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Главная ошибка начинающих мастеров — продавать по цене материалов 
                или «как у конкурентов». Такой подход либо не приносит прибыли, 
                либо ведёт к выгоранию, когда вы работаете за копейки.
              </p>
              <p>
                Правильная цена учитывает все расходы: материалы, ваше время, 
                упаковку, комиссию маркетплейса, налоги и желаемую прибыль. 
                Разберём формулу пошагово.
              </p>
            </div>
          </section>

          {/* Формула */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Формула расчёта цены</h2>
            
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-6 mb-6">
              <p className="text-lg font-mono text-center mb-4">
                Цена = (Материалы + Время × Ставка + Упаковка) ÷ (1 − Комиссия − Налог) ÷ (1 − Маржа)
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-3">Что входит в расчёт:</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><strong>Материалы</strong> — все расходники: ткань, пряжа, фурнитура, воск, краски</li>
                  <li><strong>Время × Ставка</strong> — сколько часов × желаемая оплата за час</li>
                  <li><strong>Упаковка</strong> — коробки, пакеты, наполнитель, бирки</li>
                  <li><strong>Комиссия</strong> — Wildberries 15–25%, Ozon 10–20%, Яндекс 5–15%</li>
                  <li><strong>Налог</strong> — самозанятый 4–6%, ИП на УСН 6%</li>
                  <li><strong>Маржа</strong> — желаемая прибыль (обычно 20–40%)</li>
                </ul>
              </div>
              <div className="bg-muted/50 rounded-lg p-4">
                <h3 className="font-bold mb-3">Как определить ставку за час:</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Подумайте, сколько вы хотите зарабатывать в месяц, и разделите на 
                  количество рабочих часов. Например:
                </p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• 60 000 ₽ ÷ 160 часов = 375 ₽/час</li>
                  <li>• 100 000 ₽ ÷ 160 часов = 625 ₽/час</li>
                </ul>
                <p className="text-sm text-muted-foreground mt-3">
                  Для старта можно взять 400–500 ₽/час — это честная ставка для 
                  квалифицированного ручного труда.
                </p>
              </div>
            </div>
          </section>

          {/* Примеры расчёта */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Примеры расчёта</h2>
            
            <div className="space-y-6">
              {EXAMPLES.map((example) => {
                const calc = calculatePrice(example)
                return (
                  <div key={example.name} className="border rounded-xl p-6">
                    <h3 className="text-xl font-bold mb-4">{example.name}</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium mb-2 text-sm text-muted-foreground">Исходные данные:</h4>
                        <ul className="space-y-1 text-sm">
                          <li>Материалы: {example.materials} ₽</li>
                          <li>Время изготовления: {example.time} ч</li>
                          <li>Ставка за час: {example.hourlyRate} ₽</li>
                          <li>Упаковка: {example.packaging} ₽</li>
                          <li>Комиссия маркетплейса: {example.commission * 100}%</li>
                          <li>Налог: {example.tax * 100}%</li>
                          <li>Желаемая маржа: {example.margin * 100}%</li>
                        </ul>
                      </div>
                      <div className="bg-muted/50 rounded-lg p-4">
                        <h4 className="font-medium mb-2 text-sm text-muted-foreground">Расчёт:</h4>
                        <ul className="space-y-1 text-sm">
                          <li>Оплата труда: {calc.laborCost} ₽</li>
                          <li>Базовая себестоимость: {calc.baseCost} ₽</li>
                          <li className="pt-2 border-t mt-2">
                            <strong className="text-lg">Итого цена: {calc.finalPrice} ₽</strong>
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Типичные ошибки */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <h2 className="text-2xl font-bold">Типичные ошибки при ценообразовании</h2>
            </div>

            <div className="space-y-4">
              <div className="border-l-4 border-destructive/50 pl-4 py-2">
                <h3 className="font-bold mb-1">❌ Не учитывать своё время</h3>
                <p className="text-muted-foreground text-sm">
                  «Это же хобби, мне и так нравится». Но если вы продаёте — это работа. 
                  Не оценивая своё время, вы обесцениваете свой труд и со временем выгорите.
                </p>
              </div>
              <div className="border-l-4 border-destructive/50 pl-4 py-2">
                <h3 className="font-bold mb-1">❌ Копировать цены конкурентов</h3>
                <p className="text-muted-foreground text-sm">
                  У конкурента может быть другая себестоимость, другие объёмы, другие цели. 
                  Цена конкурента — это ориентир, но не основа для вашего расчёта.
                </p>
              </div>
              <div className="border-l-4 border-destructive/50 pl-4 py-2">
                <h3 className="font-bold mb-1">❌ Забывать про комиссии и налоги</h3>
                <p className="text-muted-foreground text-sm">
                  Комиссия Wildberries может съесть до 25% от цены. Если не заложить её 
                  в расчёт, вы будете продавать в минус и удивляться, почему нет прибыли.
                </p>
              </div>
              <div className="border-l-4 border-destructive/50 pl-4 py-2">
                <h3 className="font-bold mb-1">❌ Бояться высокой цены</h3>
                <p className="text-muted-foreground text-sm">
                  Хендмейд — это не масс-маркет. Покупатели готовы платить за уникальность. 
                  Если ваш товар качественный и красиво оформлен — цена оправдана.
                </p>
              </div>
            </div>
          </section>

          {/* Советы */}
          <section className="bg-muted/50 rounded-2xl p-8 mb-12">
            <h2 className="text-2xl font-bold mb-4">Практические советы</h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                <strong>1. Ведите учёт расходов.</strong> Записывайте все траты на материалы, 
                упаковку, инструменты. Без этого невозможно точно рассчитать себестоимость.
              </p>
              <p>
                <strong>2. Тестируйте цены.</strong> Начните с расчётной цены, а потом 
                смотрите на продажи. Если берут быстро — можно поднять. Если не берут — 
                проверьте качество карточки, а не снижайте цену.
              </p>
              <p>
                <strong>3. Закладывайте скидки.</strong> Маркетплейсы часто требуют участия 
                в акциях. Если ваша цена на грани рентабельности — скидка съест прибыль. 
                Лучше сразу заложить запас 10–15%.
              </p>
              <p>
                <strong>4. Пересматривайте цены.</strong> Материалы дорожают, комиссии 
                меняются. Раз в квартал проверяйте актуальность своих цен.
              </p>
            </div>
          </section>

          {/* Связка с HandySeller */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Учёт себестоимости в HandySeller</h2>
            <p className="text-muted-foreground mb-4">
              HandySeller помогает вести учёт себестоимости и рассчитывать реальную 
              прибыль с каждого заказа. Вы вносите расходы на материалы, а система 
              автоматически учитывает комиссии маркетплейсов и показывает маржу.
            </p>
            <Button size="lg" asChild>
              <TrackedLink href="/register" goal="click_start_free">
                Попробовать бесплатно
                <ArrowRight className="ml-2 h-5 w-5" />
              </TrackedLink>
            </Button>
          </section>

          {/* Читайте также */}
          <section className="bg-muted/50 rounded-lg p-6 border">
            <h3 className="font-bold mb-4">📚 Читайте также:</h3>
            <ul className="space-y-2">
              <li>
                <Link href="/blog/chto-mozhno-sdelat-svoimi-rukami-dlya-prodazhi" className="text-primary hover:underline">
                  30 идей хендмейда для продажи на маркетплейсах
                </Link>
              </li>
              <li>
                <Link href="/blog/kak-stat-samozanyatym-i-nachat-prodavat" className="text-primary hover:underline">
                  Как стать самозанятым и начать продавать
                </Link>
              </li>
              <li>
                <Link href="/kak-prodavat-hendmeid-na-wildberries" className="text-primary hover:underline">
                  Как продавать хендмейд на Wildberries
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
