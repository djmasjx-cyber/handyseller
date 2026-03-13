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
  FileText,
  Package,
  Megaphone,
  HelpCircle,
  CheckCircle,
  MessageCircle,
} from "lucide-react"

const CONTACTS = {
  telegram: "https://t.me/Handyseller_bot",
  email: "support@handyseller.ru",
}

const FAQ_WB = [
  {
    q: "Можно ли продавать хендмейд на Wildberries без ИП?",
    a: "Да, можно. Wildberries принимает самозанятых. Оформиться самозанятым можно за 5 минут через приложение «Мой налог». После регистрации вы получаете доступ к личному кабинету продавца и можете начинать продавать.",
  },
  {
    q: "Подойдёт ли Wildberries для свечей, бус, вязания и 3D-моделей?",
    a: "Да, Wildberries — универсальная площадка. Здесь успешно продаются свечи ручной работы, бусы из натуральных камней и жемчуга, вязаные изделия, 3D-печатные модели и любой другой хендмейд. Главное — качественные фото и грамотное описание.",
  },
  {
    q: "Что делать, если заказов мало?",
    a: "Проверьте карточку товара: качество фото, полноту описания, ключевые слова в названии. Участвуйте в акциях Wildberries — это бесплатный способ поднять товар в выдаче. Работайте с отзывами: отвечайте покупателям, просите оставить отзыв после удачной покупки.",
  },
  {
    q: "Сколько стоит продавать на Wildberries?",
    a: "Размещение товаров бесплатное. Wildberries берёт комиссию с каждой продажи (от 5% до 15% в зависимости от категории). Также есть расходы на логистику и хранение, если вы используете склады WB.",
  },
  {
    q: "Как HandySeller помогает продавать на Wildberries?",
    a: "HandySeller позволяет управлять товарами, заказами и остатками из одного окна. Вы описываете изделие один раз — и оно появляется на Wildberries (и других маркетплейсах). Синхронизация остатков работает автоматически, поэтому вы не продадите то, чего уже нет.",
  },
]

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_WB.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
}

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Как продавать хендмейд на Wildberries — пошаговая инструкция для мастеров",
  description: "Пошаговый гайд, как начать продавать товары ручной работы и хендмейд на Wildberries. Регистрация, документы, карточки товара и как упростить всё с HandySeller.",
  author: {
    "@type": "Organization",
    name: "HandySeller",
  },
  publisher: {
    "@type": "Organization",
    name: "HandySeller",
    url: "https://app.handyseller.ru",
  },
  datePublished: "2026-03-01",
  dateModified: new Date().toISOString().split("T")[0],
}

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "Главная", url: "https://app.handyseller.ru" },
  { name: "Как продавать хендмейд на Wildberries", url: "https://app.handyseller.ru/kak-prodavat-hendmeid-na-wildberries" },
])

export const metadata: Metadata = {
  title: "Как продавать хендмейд на Wildberries — пошаговая инструкция для мастеров",
  description:
    "Пошаговый гайд, как начать продавать товары ручной работы и хендмейд на Wildberries. Регистрация, документы, карточки товара и как упростить всё с HandySeller.",
  alternates: { canonical: "https://app.handyseller.ru/kak-prodavat-hendmeid-na-wildberries" },
  openGraph: {
    title: "Как продавать хендмейд на Wildberries — пошаговая инструкция",
    description:
      "Пошаговый гайд для мастеров: как начать продавать товары ручной работы на Wildberries. Регистрация, документы, карточки товара.",
    url: "https://app.handyseller.ru/kak-prodavat-hendmeid-na-wildberries",
    type: "article",
  },
}

export default function HowToSellHandmadeOnWildberries() {
  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
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
        <ScrollTracker pageId="wildberries" />
        {/* Хлебная крошка */}
        <Breadcrumb items={[
          { label: "Главная", href: "/" },
          { label: "Как продавать хендмейд на Wildberries" },
        ]} />

        {/* Блок 1: Вступление */}
        <article className="max-w-3xl mx-auto">
          <Badge variant="secondary" className="mb-4">
            <Zap className="mr-1 h-3 w-3" />
            Гайд для мастеров
          </Badge>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
            Как продавать хендмейд на Wildberries
          </h1>

          <div className="prose prose-lg max-w-none text-muted-foreground mb-8">
            <p>
              Вы создаёте свечи, бусы из жемчуга, вяжете игрушки или печатаете 3D-модели?
              Хотите продавать свои работы на Wildberries, но не знаете, с чего начать?
              Эта статья — ваш пошаговый гайд.
            </p>
            <p>
              Без воды разберём, что нужно сделать для выхода на WB: какие документы
              подготовить, как оформить карточки товаров, упаковать изделия и начать
              получать заказы. А ещё расскажем, как автоматизировать рутину с HandySeller.
            </p>
          </div>

          <Button size="lg" className="mb-12" asChild>
            <TrackedLink href="/register" goal="click_start_free">
              Попробовать HandySeller бесплатно
              <ArrowRight className="ml-2 h-5 w-5" />
            </TrackedLink>
          </Button>

          {/* Блок 2: ИП и документы */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Нужны ли ИП и документы, чтобы продавать хендмейд на Wildberries
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Хорошая новость: чтобы продавать на Wildberries, вам <strong>не нужен ИП</strong>.
                Можно работать как <strong>самозанятый</strong> (плательщик налога на профессиональный доход).
              </p>
              <p>
                Зарегистрироваться самозанятым можно за 5 минут через приложение{" "}
                <strong>«Мой налог»</strong> или на сайте ФНС. После этого вы получаете доступ
                к личному кабинету Wildberries как продавец.
              </p>
              <p>
                Для большинства категорий хендмейда (свечи, бижутерия, декор, 3D-модели)
                сертификаты не требуются. Но если вы делаете детские товары или косметику —
                уточните требования для своей категории.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>💡 HandySeller и учёт:</strong> если вы самозанятый, HandySeller
                  не заменяет «Мой налог», но помогает вести учёт заказов и остатков,
                  чтобы вы не путались в продажах.
                </p>
              </div>
            </div>
          </section>

          {/* Блок 3: Регистрация */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Регистрация кабинета продавца хендмейда на Wildberries
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>Процесс регистрации на Wildberries простой:</p>
              <ol className="space-y-2">
                <li>
                  <strong>Зайдите на seller.wildberries.ru</strong> — портал для продавцов.
                </li>
                <li>
                  <strong>Укажите статус</strong> — самозанятый, ИП или ООО.
                </li>
                <li>
                  <strong>Подтвердите данные</strong> — загрузите скан паспорта и справку
                  о постановке на учёт как самозанятый.
                </li>
                <li>
                  <strong>Выберите схему работы</strong> — FBS (храните товары у себя)
                  или FBO (отправляете на склад WB).
                </li>
                <li>
                  <strong>Подпишите договор</strong> — это происходит онлайн.
                </li>
              </ol>
              <p>
                После одобрения (обычно 1–3 дня) вы получите доступ к личному кабинету
                и сможете добавлять товары.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>🔗 HandySeller подключается к вашему кабинету WB</strong> и
                  помогает управлять товарами и заказами из одного окна. Вам не нужно
                  постоянно переключаться между вкладками.
                </p>
              </div>
            </div>
          </section>

          {/* Блок 4: Подготовка товаров */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Palette className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Как подготовить товары ручной работы к продаже
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
                Фото и описание хендмейда для Wildberries
              </h3>
              <p>
                Фотографии — главный продающий элемент. Советы для качественных фото:
              </p>
              <ul className="space-y-1">
                <li>Снимайте при хорошем освещении (естественный свет или лампа)</li>
                <li>Используйте нейтральный фон (белый, бежевый, текстура дерева)</li>
                <li>Делайте несколько ракурсов: общий план, детали, в руках</li>
                <li>Покажите масштаб (рядом с линейкой или в интерьере)</li>
              </ul>
              <p>
                <strong>Описание</strong> пишите простым языком. Укажите материалы,
                размеры, способ ухода. Подчеркните, что это ручная работа — покупатели
                это ценят.
              </p>

              <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
                Цены и остатки
              </h3>
              <p>
                Установите конкурентную цену. Посмотрите, сколько стоят похожие товары
                на WB, и учтите комиссию площадки (5–15%). Следите за остатками —
                если товар закончился, а заказы приходят, вы получите штраф.
              </p>
              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>⚡ HandySeller синхронизирует остатки</strong> на всех
                  маркетплейсах автоматически. Продали свечу на Ozon — остаток
                  уменьшится и на Wildberries. Никаких двойных продаж.
                </p>
              </div>
            </div>
          </section>

          {/* Блок 5: Логистика */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Упаковка, доставка и возвраты для мастеров
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Wildberries предъявляет требования к упаковке. Базовые правила:
              </p>
              <ul className="space-y-1">
                <li>Товар должен быть надёжно защищён от повреждений при транспортировке</li>
                <li>На упаковке должен быть штрихкод (его можно распечатать из ЛК WB)</li>
                <li>Для хрупких изделий — дополнительная защита (пузырчатая плёнка, коробка)</li>
              </ul>
              <p>
                <strong>Схемы поставок:</strong>
              </p>
              <ul className="space-y-1">
                <li>
                  <strong>FBS (Fulfillment by Seller)</strong> — вы храните товары дома
                  и сами привозите на пункт приёма при заказе. Подходит для начала.
                </li>
                <li>
                  <strong>FBO (Fulfillment by Operator)</strong> — вы отправляете партию
                  на склад WB, а они сами отгружают заказы. Удобно при большом объёме.
                </li>
              </ul>
              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>📦 HandySeller отслеживает статусы заказов</strong> — вы видите,
                  какие заказы нужно собрать и отгрузить. Ничего не потеряется.
                </p>
              </div>
            </div>
          </section>

          {/* Блок 6: Продвижение */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Как продвигать хендмейд на Wildberries, если вы только начинаете
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Продвижение начинается с качественной карточки товара:
              </p>
              <ul className="space-y-1">
                <li>
                  <strong>Ключевые слова в названии</strong> — «бусы из жемчуга ручной работы»,
                  а не просто «бусы»
                </li>
                <li>
                  <strong>Полное описание</strong> — материалы, размеры, особенности
                </li>
                <li>
                  <strong>Качественные фото</strong> — 5+ изображений с разных ракурсов
                </li>
              </ul>
              <p>
                <strong>Бесплатные способы продвижения:</strong>
              </p>
              <ul className="space-y-1">
                <li>Участвуйте в акциях Wildberries — это поднимает товар в выдаче</li>
                <li>Работайте с отзывами — отвечайте на все, благодарите за положительные</li>
                <li>Просите покупателей оставить отзыв (вежливо, в упаковке)</li>
              </ul>
              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>📊 HandySeller даёт аналитику</strong> — вы видите, какие товары
                  продаются лучше, и можете сфокусироваться на них.
                </p>
              </div>
            </div>

            <Button size="lg" className="mt-6" asChild>
              <Link href="/register">
                Попробовать HandySeller бесплатно
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </section>

          {/* Блок 7: FAQ */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Частые вопросы про продажу хендмейда на Wildberries
              </h2>
            </div>

            <div className="space-y-3">
              {FAQ_WB.map(({ q, a }) => (
                <details key={q} className="border rounded-lg p-4 group">
                  <summary className="font-bold cursor-pointer list-none flex items-center justify-between">
                    {q}
                    <span className="text-muted-foreground group-open:rotate-180 transition-transform">
                      ▼
                    </span>
                  </summary>
                  <p className="text-muted-foreground mt-3 pl-0">{a}</p>
                </details>
              ))}
            </div>

            <p className="text-muted-foreground mt-4">
              Ещё вопросы? Загляните в наш{" "}
              <Link href="/#faq" className="text-primary hover:underline">
                общий FAQ
              </Link>{" "}
              или напишите в поддержку.
            </p>

            <div className="bg-muted/50 rounded-lg p-4 border mt-4">
              <p className="text-sm mb-2">
                <strong>📚 Читайте также:</strong>
              </p>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>
                  <Link
                    href="/kak-prodavat-hendmeid-na-ozon"
                    className="text-primary hover:underline"
                  >
                    Как продавать хендмейд на Ozon — пошаговая инструкция
                  </Link>
                </li>
                <li>
                  <Link
                    href="/kak-prodavat-hendmeid-na-yandex-markete"
                    className="text-primary hover:underline"
                  >
                    Как продавать хендмейд на Яндекс Маркете
                  </Link>
                </li>
              </ul>
            </div>
          </section>

          {/* Блок 8: Финальный призыв */}
          <section className="bg-muted/50 rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">
              Готовы продавать свой хендмейд на Wildberries?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              HandySeller помогает мастерам управлять товарами, заказами и остатками
              на Wildberries и других маркетплейсах из одного окна. Начните с бесплатного
              тарифа и проверьте, как это работает в вашей мастерской.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Button size="lg" asChild>
                <Link href="/register">
                  Начать бесплатно
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/login">Уже есть аккаунт</Link>
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
                <Link href="/#faq" className="text-muted-foreground hover:text-primary block">
                  FAQ
                </Link>
                <Link href="/oferta" className="text-muted-foreground hover:text-primary block">
                  Оферта
                </Link>
                <Link href="/privacy" className="text-muted-foreground hover:text-primary block">
                  Политика конфиденциальности
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
