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
  Truck,
  Camera,
  BarChart3,
  Store,
} from "lucide-react"

const CONTACTS = {
  telegram: "https://t.me/Handyseller_bot",
  email: "support@handyseller.ru",
}

const FAQ_YANDEX = [
  {
    q: "Можно ли продавать хендмейд на Яндекс Маркете как самозанятый?",
    a: "Да, Яндекс Маркет работает с самозанятыми. Зарегистрируйтесь через приложение «Мой налог» и подключите статус в личном кабинете Яндекс Маркета. Лимит дохода для самозанятых — 2,4 млн рублей в год.",
  },
  {
    q: "Чем Яндекс Маркет отличается от Ozon для мастеров?",
    a: "Яндекс Маркет интегрирован в экосистему Яндекса — товары показываются в Яндекс.Поиске, Алисе, на Картах. Конкуренция пока ниже, чем на WB и Ozon. Для мастеров это дополнительная аудитория, которая часто не пересекается с другими площадками.",
  },
  {
    q: "Как быстро начать продавать на Яндекс Маркете?",
    a: "Регистрация на partner.market.yandex.ru занимает 15–20 минут. Если у вас уже есть Яндекс ID — процесс ещё быстрее. После модерации (1–3 дня) можно загружать товары и начинать продажи.",
  },
  {
    q: "Какая комиссия Яндекс Маркета для хендмейда?",
    a: "Комиссия зависит от категории товара и составляет от 2% до 15%. Для большинства хендмейд-категорий (украшения, декор, подарки) комиссия обычно 8–12%. Точные цифры смотрите в личном кабинете для вашей категории.",
  },
  {
    q: "Как HandySeller помогает продавать на Яндекс Маркете?",
    a: "HandySeller позволяет управлять товарами и заказами на Яндекс Маркете, Ozon и Wildberries из одного окна. Вы описываете товар один раз — и он появляется на всех площадках. Остатки синхронизируются автоматически.",
  },
]

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_YANDEX.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
}

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Как продавать хендмейд на Яндекс Маркете — инструкция для мастеров",
  description: "Пошаговый гайд: как начать продавать товары ручной работы на Яндекс Маркете. Регистрация, карточки, схемы доставки и как управлять всем через HandySeller.",
  author: {
    "@type": "Organization",
    name: "HandySeller",
  },
  publisher: {
    "@type": "Organization",
    name: "HandySeller",
    url: "https://app.handyseller.ru",
  },
  datePublished: "2026-03-03",
  dateModified: new Date().toISOString().split("T")[0],
}

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "Главная", url: "https://app.handyseller.ru" },
  { name: "Как продавать хендмейд на Яндекс Маркете", url: "https://app.handyseller.ru/kak-prodavat-hendmeid-na-yandex-markete" },
])

export const metadata: Metadata = {
  title: "Как продавать хендмейд на Яндекс Маркете — инструкция для мастеров",
  description:
    "Пошаговый гайд: как начать продавать товары ручной работы на Яндекс Маркете. Регистрация, карточки, схемы доставки и как управлять всем через HandySeller.",
  alternates: { canonical: "https://app.handyseller.ru/kak-prodavat-hendmeid-na-yandex-markete" },
  openGraph: {
    title: "Как продавать хендмейд на Яндекс Маркете — инструкция для мастеров",
    description:
      "Пошаговый гайд для мастеров: как начать продавать товары ручной работы на Яндекс Маркете.",
    url: "https://app.handyseller.ru/kak-prodavat-hendmeid-na-yandex-markete",
    type: "article",
  },
}

export default function HowToSellHandmadeOnYandexMarket() {
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
        <ScrollTracker pageId="yandex-market" />
        {/* Хлебная крошка */}
        <Breadcrumb items={[
          { label: "Главная", href: "/" },
          { label: "Как продавать хендмейд на Яндекс Маркете" },
        ]} />

        <article className="max-w-3xl mx-auto">
          <Badge variant="secondary" className="mb-4">
            <Store className="mr-1 h-3 w-3" />
            Гайд для мастеров
          </Badge>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
            Как продавать хендмейд на Яндекс Маркете
          </h1>

          {/* Блок 1: Вступление */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Яндекс Маркет для мастеров: стоит ли выходить
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Яндекс Маркет — быстро растущая площадка с интеграцией в экосистему Яндекса. 
                Ваши товары могут показываться в Яндекс.Поиске, Алисе и на Яндекс.Картах. 
                Для мастеров это дополнительная аудитория, которая часто не пересекается 
                с Wildberries и Ozon.
              </p>
              <p>
                Яндекс Маркет активно привлекает новых продавцов, конкуренция пока ниже, 
                чем на WB. Это хороший момент для выхода на площадку — пока ниша не заполнена, 
                проще занять позиции в поиске и получить первых покупателей.
              </p>
            </div>

            <Button size="lg" className="mt-6" asChild>
              <TrackedLink href="/register" goal="click_start_free">
                Попробовать HandySeller бесплатно
                <ArrowRight className="ml-2 h-5 w-5" />
              </TrackedLink>
            </Button>
          </section>

          {/* Блок 2: Статус продавца */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Какой статус нужен для продажи на Яндекс Маркете
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Яндекс Маркет работает с <strong>самозанятыми</strong>, <strong>ИП</strong> и <strong>ООО</strong>.
              </p>

              <div className="grid md:grid-cols-2 gap-4 my-6 not-prose">
                <div className="border rounded-lg p-4">
                  <h3 className="font-bold mb-2 text-foreground">Самозанятый</h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>✓ Регистрация за 5 минут через «Мой налог»</li>
                    <li>✓ Налог 4–6% от дохода</li>
                    <li>✓ Нет отчётности и бухгалтерии</li>
                    <li>— Лимит 2,4 млн ₽/год</li>
                    <li>— Нельзя перепродавать чужие товары</li>
                  </ul>
                </div>
                <div className="border rounded-lg p-4">
                  <h3 className="font-bold mb-2 text-foreground">ИП</h3>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>✓ Нет лимита по доходу</li>
                    <li>✓ Можно масштабироваться</li>
                    <li>✓ Доступ к FBY и маркировке</li>
                    <li>— Нужна регистрация в налоговой</li>
                    <li>— Обязательная отчётность</li>
                  </ul>
                </div>
              </div>

              <p>
                Для хендмейда обычно достаточно самозанятости — это самый простой старт. 
                Если планируете рост выше 2,4 млн в год или хотите нанимать помощников — оформляйте ИП.
              </p>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>💡 HandySeller:</strong> вне зависимости от статуса помогает
                  вести учёт заказов и остатков по всем маркетплейсам в одном месте.
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
                Как зарегистрироваться продавцом на Яндекс Маркете
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>Зарегистрироваться можно за 15–20 минут:</p>
              <ol className="space-y-2">
                <li>
                  <strong>Перейдите на partner.market.yandex.ru</strong> — портал для продавцов.
                </li>
                <li>
                  <strong>Войдите через Яндекс ID</strong> — если уже пользуетесь почтой Яндекса, 
                  регистрация будет ещё быстрее.
                </li>
                <li>
                  <strong>Выберите статус</strong> — самозанятый, ИП или ООО.
                </li>
                <li>
                  <strong>Заполните данные</strong> — ИНН, контакты, реквизиты для выплат.
                </li>
                <li>
                  <strong>Дождитесь модерации</strong> — обычно 1–3 рабочих дня.
                </li>
              </ol>

              <p>
                <strong>Особенность Яндекс Маркета:</strong> удобная интеграция с Яндекс ID. 
                Если вы уже пользуетесь сервисами Яндекса — вход и настройка будут быстрыми.
              </p>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>🔗 После регистрации:</strong> подключите аккаунт к HandySeller и 
                  управляйте товарами вместе с Wildberries и Ozon из одного приложения.
                </p>
              </div>
            </div>
          </section>

          {/* Блок 4: Схемы работы */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Схемы продаж на Яндекс Маркете для мастеров: FBY, FBS, DBS
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>На Яндекс Маркете есть три основные схемы работы:</p>

              <ul className="space-y-3">
                <li>
                  <strong>FBY (Fulfillment by Yandex)</strong> — вы отправляете партию товаров 
                  на склад Яндекса, а они сами хранят и отгружают заказы. Подходит для 
                  серийного хендмейда с большими объёмами.
                </li>
                <li>
                  <strong>FBS (Fulfillment by Seller)</strong> — товары хранятся у вас, 
                  вы сами привозите их в пункт приёма при заказе. Хороший баланс контроля и удобства.
                </li>
                <li>
                  <strong>DBS (Delivery by Seller)</strong> — хранение и доставка полностью 
                  своими силами. Подходит для уникальных изделий и работы под заказ.
                </li>
              </ul>

              <p>
                <strong>Рекомендация для начинающих мастеров:</strong> начните с FBS или DBS — 
                меньше обязательств по объёмам, вы контролируете качество каждой посылки.
              </p>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>📦 HandySeller:</strong> помогает отслеживать заказы по всем схемам 
                  из одного окна — не запутаетесь, что уже отправлено.
                </p>
              </div>
            </div>
          </section>

          {/* Блок 5: Карточки товара */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Camera className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Как оформить карточки хендмейда на Яндекс Маркете
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
                Фото и описание
              </h3>
              <p>Требования к фото аналогичны WB и Ozon:</p>
              <ul className="space-y-1">
                <li>Белый или нейтральный фон для каталожных фото</li>
                <li>Несколько ракурсов — общий вид, детали, масштаб</li>
                <li>Хорошее освещение без жёстких теней</li>
                <li>Lifestyle-фото в интерьере — для атмосферы</li>
              </ul>

              <p className="mt-4">
                <strong>В описании используйте слова:</strong> «ручная работа», «авторское изделие», 
                «сделано вручную», «handmade». Это работает как в поиске Маркета, так и в Яндекс.Поиске — 
                ваши товары могут показываться в органической выдаче.
              </p>

              <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
                Цена и комиссия
              </h3>
              <p>
                Комиссия Яндекс Маркета варьируется по категориям — от 2% до 15%. 
                Для хендмейда обычно 8–12%. При расчёте цены учитывайте:
              </p>
              <ul className="space-y-1">
                <li>Себестоимость материалов</li>
                <li>Время работы</li>
                <li>Комиссию площадки</li>
                <li>Упаковку и логистику</li>
                <li>Налог (4–6% для самозанятых)</li>
              </ul>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>⚡ HandySeller:</strong> позволяет один раз описать товар и выгрузить 
                  карточку сразу на несколько площадок. Это сокращает время и снижает риск ошибок.
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
                Как продвигать товары ручной работы на Яндекс Маркете
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>Способы продвижения на Яндекс Маркете:</p>
              <ul className="space-y-2">
                <li>
                  <strong>Буст продаж</strong> — внутренняя реклама Маркета. Особенно 
                  эффективен для новых карточек — помогает быстрее набрать первые продажи и отзывы.
                </li>
                <li>
                  <strong>Работа с отзывами</strong> — отвечайте на все отзывы, благодарите 
                  за положительные, решайте проблемы в негативных. На старте это критически важно.
                </li>
                <li>
                  <strong>Качественный контент</strong> — хорошие фото, видео, подробное 
                  описание. Чем лучше карточка — тем выше в поиске.
                </li>
                <li>
                  <strong>Участие в акциях</strong> — скидки и распродажи поднимают товар в выдаче.
                </li>
              </ul>

              <p className="mt-4">
                <strong>Бонус Яндекс Маркета:</strong> товары иногда попадают в органическую 
                выдачу Яндекс.Поиска — это дополнительный бесплатный трафик, которого нет на WB и Ozon.
              </p>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>📈 HandySeller:</strong> даёт аналитику по продажам — какие товары 
                  лучше идут на каждой площадке. Это помогает понять, куда вкладываться в рекламу.
                </p>
              </div>
            </div>
          </section>

          {/* Блок 7: Сравнение площадок */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Wildberries, Ozon или Яндекс Маркет: где лучше продавать хендмейд
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <div className="overflow-x-auto my-6 not-prose">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-bold">Критерий</th>
                      <th className="text-left p-3 font-bold">Wildberries</th>
                      <th className="text-left p-3 font-bold">Ozon</th>
                      <th className="text-left p-3 font-bold">Яндекс Маркет</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="p-3">Аудитория</td>
                      <td className="p-3">Огромная</td>
                      <td className="p-3">Большая</td>
                      <td className="p-3">Растущая</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3">Конкуренция</td>
                      <td className="p-3">Высокая</td>
                      <td className="p-3">Средняя</td>
                      <td className="p-3">Ниже среднего</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3">Схемы для мастеров</td>
                      <td className="p-3">FBO/FBS</td>
                      <td className="p-3">FBO/FBS/RealFBS</td>
                      <td className="p-3">FBY/FBS/DBS</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3">Сложность старта</td>
                      <td className="p-3">Средняя</td>
                      <td className="p-3">Низкая</td>
                      <td className="p-3">Низкая</td>
                    </tr>
                    <tr>
                      <td className="p-3">Интеграция с Яндексом</td>
                      <td className="p-3">Нет</td>
                      <td className="p-3">Нет</td>
                      <td className="p-3">Да (Поиск, Алиса, Карты)</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p>
                <strong>Вывод:</strong> лучшая стратегия — выходить на все три площадки. 
                Каждая имеет свою аудиторию, и вместе они дают максимальный охват.
              </p>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>📚 Читайте также:</strong>{" "}
                  <Link
                    href="/kak-prodavat-hendmeid-na-wildberries"
                    className="text-primary hover:underline"
                  >
                    Как продавать на Wildberries
                  </Link>
                  {" • "}
                  <Link
                    href="/kak-prodavat-hendmeid-na-ozon"
                    className="text-primary hover:underline"
                  >
                    Как продавать на Ozon
                  </Link>
                </p>
              </div>
            </div>

            <Button size="lg" className="mt-6" asChild>
              <TrackedLink href="/register" goal="click_start_free">
                Попробовать HandySeller бесплатно
                <ArrowRight className="ml-2 h-5 w-5" />
              </TrackedLink>
            </Button>
          </section>

          {/* FAQ */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Частые вопросы про продажу хендмейда на Яндекс Маркете
              </h2>
            </div>

            <div className="space-y-3">
              {FAQ_YANDEX.map(({ q, a }) => (
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
              <Link href="/faq" className="text-primary hover:underline">
                общий FAQ — все вопросы о продаже хендмейда
              </Link>
              .
            </p>
          </section>

          {/* Финальный CTA */}
          <section className="bg-muted/50 rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">
              Попробуйте HandySeller для всех маркетплейсов
            </h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              HandySeller экономит время и снижает хаос, когда мастер выходит сразу на
              несколько маркетплейсов. Товары, заказы и остатки — в одном окне. 
              Начните с бесплатного тарифа.
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
                <Link
                  href="/kak-prodavat-hendmeid-na-yandex-markete"
                  className="text-muted-foreground hover:text-primary block"
                >
                  Как продавать на Яндекс Маркете
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
