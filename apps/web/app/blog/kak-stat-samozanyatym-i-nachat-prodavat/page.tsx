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
  FileCheck,
  Smartphone,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Receipt,
} from "lucide-react"

const CONTACTS = {
  telegram: "https://t.me/Handyseller_bot",
  email: "support@handyseller.ru",
}

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Как стать самозанятым и начать продавать хендмейд: пошаговая инструкция",
  description: "Регистрация через «Мой налог», что можно и нельзя продавать как самозанятый, лимиты дохода, как выставлять чеки при продаже через маркетплейс.",
  author: { "@type": "Organization", name: "HandySeller" },
  publisher: { "@type": "Organization", name: "HandySeller", url: "https://app.handyseller.ru" },
  datePublished: "2026-03-01",
  dateModified: new Date().toISOString().split("T")[0],
}

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "Главная", url: "https://app.handyseller.ru" },
  { name: "Блог", url: "https://app.handyseller.ru/blog" },
  { name: "Самозанятость", url: "https://app.handyseller.ru/blog/kak-stat-samozanyatym-i-nachat-prodavat" },
])

export const metadata: Metadata = {
  title: "Как стать самозанятым и начать продавать хендмейд: пошаговая инструкция",
  description:
    "Регистрация через «Мой налог», лимиты дохода, как выставлять чеки при продаже через маркетплейс. Реальные примеры мастеров.",
  keywords: ["как стать самозанятым для продажи хендмейда", "самозанятый маркетплейс хендмейд", "продавать хендмейд без ИП"],
  alternates: { canonical: "https://app.handyseller.ru/blog/kak-stat-samozanyatym-i-nachat-prodavat" },
  openGraph: {
    title: "Как стать самозанятым и продавать хендмейд",
    description: "Пошаговая инструкция по регистрации самозанятости для мастеров.",
    url: "https://app.handyseller.ru/blog/kak-stat-samozanyatym-i-nachat-prodavat",
    type: "article",
  },
}

export default function SelfEmployedGuidePage() {
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
        <ScrollTracker pageId="blog-selfemployed" />
        <article className="max-w-4xl mx-auto">
          <Breadcrumb items={[
            { label: "Главная", href: "/" },
            { label: "Блог", href: "/blog" },
            { label: "Самозанятость" },
          ]} />

          <Badge variant="secondary" className="mb-4">
            <FileCheck className="mr-1 h-3 w-3" />
            Юридические вопросы
          </Badge>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
            Как стать самозанятым и начать продавать хендмейд на маркетплейсах
          </h1>

          {/* Вступление */}
          <section className="mb-12">
            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Самозанятость — самый простой способ легально продавать хендмейд. 
                Не нужно открывать ИП, вести бухгалтерию и сдавать отчёты. 
                Налог всего 4–6%, а регистрация занимает 5 минут через приложение.
              </p>
              <p>
                Wildberries, Ozon и Яндекс Маркет работают с самозанятыми напрямую. 
                В этом гайде расскажем, как зарегистрироваться, что можно продавать 
                и как правильно работать с маркетплейсами.
              </p>
            </div>
          </section>

          {/* Регистрация */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">Как зарегистрироваться самозанятым</h2>
            </div>

            <p className="text-muted-foreground mb-4">
              Регистрация занимает 5 минут через приложение «Мой налог» или личный 
              кабинет на сайте ФНС. Вот пошаговая инструкция:
            </p>

            <div className="space-y-4 mb-6">
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Шаг 1. Скачайте приложение «Мой налог»</h3>
                <p className="text-sm text-muted-foreground">
                  Приложение есть в App Store и Google Play. Это официальное приложение 
                  ФНС для самозанятых. Можно также зарегистрироваться через сайт 
                  lknpd.nalog.ru или через банк (Сбер, Тинькофф и др.).
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Шаг 2. Авторизуйтесь</h3>
                <p className="text-sm text-muted-foreground">
                  Войти можно через Госуслуги, по ИНН или сканированием паспорта. 
                  Если есть аккаунт на Госуслугах — используйте его, это быстрее всего.
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Шаг 3. Укажите регион и вид деятельности</h3>
                <p className="text-sm text-muted-foreground">
                  Выберите регион, где будете вести деятельность (обычно по прописке). 
                  Вид деятельности можно указать общий — «Производство и продажа 
                  товаров собственного изготовления».
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Шаг 4. Готово!</h3>
                <p className="text-sm text-muted-foreground">
                  После подтверждения данных вы становитесь самозанятым. Теперь можно 
                  выставлять чеки и подключаться к маркетплейсам.
                </p>
              </div>
            </div>
          </section>

          {/* Что можно/нельзя */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Что можно и нельзя продавать как самозанятый</h2>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-green-500/30 rounded-lg p-4 bg-green-500/5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <h3 className="font-bold text-green-700">Можно продавать</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✓ Украшения и бижутерия ручной работы</li>
                  <li>✓ Свечи, декор, предметы интерьера</li>
                  <li>✓ Вязаные и текстильные изделия</li>
                  <li>✓ Игрушки ручной работы</li>
                  <li>✓ Изделия из дерева, керамики, эпоксидки</li>
                  <li>✓ Открытки, блокноты, канцелярия</li>
                </ul>
              </div>
              <div className="border border-red-500/30 rounded-lg p-4 bg-red-500/5">
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <h3 className="font-bold text-red-700">Нельзя продавать</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✗ Товары, требующие маркировки (одежда, обувь)</li>
                  <li>✗ Подакцизные товары (алкоголь, табак)</li>
                  <li>✗ Товары для перепродажи (не своего производства)</li>
                  <li>✗ Косметика без сертификации</li>
                  <li>✗ Продукты питания (нужны разрешения)</li>
                </ul>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 mt-4">
              <p className="text-sm text-muted-foreground">
                <strong>Важно:</strong> Самозанятый может продавать только товары 
                собственного изготовления. Если вы покупаете готовые изделия и 
                перепродаёте — это уже ИП с другим налоговым режимом.
              </p>
            </div>
          </section>

          {/* Лимиты */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
              </div>
              <h2 className="text-2xl font-bold">Лимиты и ограничения</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Лимит дохода — 2,4 млн ₽ в год</h3>
                <p className="text-sm text-muted-foreground">
                  Это примерно 200 000 ₽ в месяц. Если превысите — автоматически 
                  слетите с самозанятости. Придётся регистрировать ИП.
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Нельзя нанимать сотрудников</h3>
                <p className="text-sm text-muted-foreground">
                  Самозанятый работает только сам. Если нужны помощники — это уже ИП. 
                  Но можно привлекать подрядчиков по договору.
                </p>
              </div>
            </div>

            <div className="border rounded-lg p-4 mt-4">
              <h3 className="font-bold mb-2">Налоговые ставки</h3>
              <div className="grid md:grid-cols-2 gap-4 mt-3">
                <div className="text-sm text-muted-foreground">
                  <strong>4%</strong> — при продаже физическим лицам. Маркетплейсы 
                  продают конечным покупателям, поэтому ставка обычно 4%.
                </div>
                <div className="text-sm text-muted-foreground">
                  <strong>6%</strong> — при продаже юридическим лицам и ИП. 
                  Применяется при работе с оптовиками.
                </div>
              </div>
            </div>
          </section>

          {/* Чеки */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold">Как выставлять чеки при продаже через маркетплейс</h2>
            </div>

            <p className="text-muted-foreground mb-4">
              При работе с маркетплейсами чеки выставляются особым образом — 
              не на каждую продажу, а на сумму выплаты от площадки.
            </p>

            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Wildberries</h3>
                <p className="text-sm text-muted-foreground">
                  WB сам формирует акты и отчёты. Вы выставляете чек в «Мой налог» 
                  на сумму выплаты от Wildberries (после вычета комиссии). 
                  Покупатель — «Вайлдберриз» (юрлицо), ставка 6%.
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Ozon</h3>
                <p className="text-sm text-muted-foreground">
                  Ozon может работать по агентской схеме (чек выставляете вы) или 
                  комиссионной (Ozon выставляет чек покупателю). Уточните схему 
                  в личном кабинете. При агентской — чек на сумму выплаты.
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Яндекс Маркет</h3>
                <p className="text-sm text-muted-foreground">
                  Яндекс Маркет работает по агентской схеме. Вы выставляете чек 
                  на сумму выплаты. Покупатель в чеке — юрлицо Яндекс.Маркета.
                </p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 mt-4">
              <p className="text-sm text-muted-foreground">
                <strong>Когда выставлять чек:</strong> В день поступления денег на ваш 
                счёт или банковскую карту. Не на каждую продажу, а на каждую выплату 
                от маркетплейса.
              </p>
            </div>
          </section>

          {/* Подключение к маркетплейсам */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Как подключиться к маркетплейсам как самозанятый</h2>

            <p className="text-muted-foreground mb-4">
              Все три крупных маркетплейса работают с самозанятыми. При регистрации 
              выбираете статус «Самозанятый» и указываете ИНН. Площадка сама проверяет 
              вашу регистрацию через ФНС.
            </p>

            <div className="grid md:grid-cols-3 gap-4">
              <Link
                href="/kak-prodavat-hendmeid-na-wildberries"
                className="border rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <h3 className="font-bold mb-2">Wildberries</h3>
                <p className="text-sm text-muted-foreground">
                  Регистрация на seller.wildberries.ru, выбор «Самозанятый», 
                  подтверждение через СМС.
                </p>
              </Link>
              <Link
                href="/kak-prodavat-hendmeid-na-ozon"
                className="border rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <h3 className="font-bold mb-2">Ozon</h3>
                <p className="text-sm text-muted-foreground">
                  Регистрация на seller.ozon.ru, загрузка справки о самозанятости, 
                  подключение к площадке.
                </p>
              </Link>
              <Link
                href="/kak-prodavat-hendmeid-na-yandex-markete"
                className="border rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <h3 className="font-bold mb-2">Яндекс Маркет</h3>
                <p className="text-sm text-muted-foreground">
                  Регистрация на partner.market.yandex.ru через Яндекс ID, 
                  выбор статуса «Самозанятый».
                </p>
              </Link>
            </div>
          </section>

          {/* CTA */}
          <section className="bg-primary/5 border border-primary/20 rounded-2xl p-8 mb-12">
            <h2 className="text-2xl font-bold mb-4">Управляйте продажами из одного окна</h2>
            <p className="text-muted-foreground mb-4">
              Когда вы выйдете на несколько маркетплейсов, станет сложно следить 
              за остатками и заказами. HandySeller объединяет всё в одном интерфейсе: 
              товары, заказы, аналитика — без переключения между кабинетами.
            </p>
            <Button size="lg" asChild>
              <TrackedLink href="/register" goal="click_start_free">
                Начать бесплатно
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
                <Link href="/blog/chto-mozhno-sdelat-svoimi-rukami-dlya-prodazhi" className="text-primary hover:underline">
                  30 идей хендмейда для продажи
                </Link>
              </li>
              <li>
                <Link href="/kak-prodavat-hendmeid-na-marketpleysah" className="text-primary hover:underline">
                  Полный гайд по продаже на маркетплейсах
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
