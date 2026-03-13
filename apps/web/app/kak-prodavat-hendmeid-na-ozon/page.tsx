import Link from "next/link"
import type { Metadata } from "next"
import { Button, Badge } from "@handyseller/ui"
import { HomeLogoLink } from "@/components/home-logo-link"
import { Breadcrumb, generateBreadcrumbSchema } from "@/components/breadcrumb"
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
} from "lucide-react"

const CONTACTS = {
  telegram: "https://t.me/Handyseller_bot",
  email: "support@handyseller.ru",
}

const FAQ_OZON = [
  {
    q: "Можно ли продавать хендмейд на Ozon как самозанятый?",
    a: "Да, Ozon принимает самозанятых. Зарегистрируйтесь через приложение «Мой налог» и подключите статус в личном кабинете Ozon Seller. Лимит дохода для самозанятых — 2,4 млн рублей в год.",
  },
  {
    q: "Какая комиссия Ozon для хендмейда?",
    a: "Комиссия зависит от категории товара и составляет от 5% до 15%. Для украшений и декора обычно 10–15%. Также есть расходы на логистику, которые зависят от схемы (FBO или FBS).",
  },
  {
    q: "Что лучше для хендмейда: FBO или FBS?",
    a: "Для мастеров с небольшими партиями обычно удобнее FBS или RealFBS — вы храните товары у себя и сдаёте в ПВЗ по факту заказа. FBO подходит, если у вас большие объёмы и вы готовы отправлять партии на склад Ozon.",
  },
  {
    q: "Нужна ли сертификация для хендмейда на Ozon?",
    a: "Для большинства категорий хендмейда (украшения, декор, свечи, текстиль) сертификация не требуется. Но если вы делаете детские товары, косметику или товары, контактирующие с пищей — уточните требования для своей категории.",
  },
  {
    q: "Как HandySeller помогает продавать на Ozon?",
    a: "HandySeller позволяет управлять товарами и заказами на Ozon и Wildberries из одного окна. Вы описываете товар один раз — и он появляется на обеих площадках. Остатки синхронизируются автоматически.",
  },
]

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_OZON.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
}

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Как продавать хендмейд на Ozon — пошаговая инструкция для мастеров",
  description: "Пошаговый гайд, как начать продавать товары ручной работы и хендмейд на Ozon. Регистрация, схемы FBO/FBS, карточки товара и как упростить всё с HandySeller.",
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
  { name: "Как продавать хендмейд на Ozon", url: "https://app.handyseller.ru/kak-prodavat-hendmeid-na-ozon" },
])

export const metadata: Metadata = {
  title: "Как продавать хендмейд на Ozon — пошаговая инструкция для мастеров",
  description:
    "Пошаговый гайд, как начать продавать товары ручной работы и хендмейд на Ozon. Регистрация, схемы FBO/FBS, карточки товара и как упростить всё с HandySeller.",
  alternates: { canonical: "https://app.handyseller.ru/kak-prodavat-hendmeid-na-ozon" },
  openGraph: {
    title: "Как продавать хендмейд на Ozon — пошаговая инструкция",
    description:
      "Пошаговый гайд для мастеров: как начать продавать товары ручной работы на Ozon. Регистрация, FBO/FBS, карточки товара.",
    url: "https://app.handyseller.ru/kak-prodavat-hendmeid-na-ozon",
    type: "article",
  },
}

export default function HowToSellHandmadeOnOzon() {
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
              <Link href="/login">Войти</Link>
            </Button>
            <Button asChild>
              <Link href="/register">
                Начать бесплатно
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8 md:py-12">
        {/* Хлебная крошка */}
        <Breadcrumb items={[
          { label: "Главная", href: "/" },
          { label: "Как продавать хендмейд на Ozon" },
        ]} />

        <article className="max-w-3xl mx-auto">
          <Badge variant="secondary" className="mb-4">
            <Zap className="mr-1 h-3 w-3" />
            Гайд для мастеров
          </Badge>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
            Как продавать хендмейд на Ozon
          </h1>

          {/* Блок 1: Вступление */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                С чего начать продажу хендмейда на Ozon
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Вы делаете украшения, свечи или керамику и думаете, получится ли
                продавать их на Ozon? Ozon — один из крупнейших маркетплейсов России,
                где отлично заходят изделия ручной работы: бижутерия, декор для дома,
                авторский текстиль, подарки и сувениры.
              </p>
              <p>
                В этом гайде разберём путь мастера от идеи до первых продаж: какой
                статус выбрать, как зарегистрироваться, оформить карточки товара и не
                запутаться в заказах. А ещё покажем, как HandySeller помогает вести
                хендмейд сразу на Ozon и Wildberries, не тратя часы на рутину.
              </p>
            </div>

            <Button size="lg" className="mt-6" asChild>
              <Link href="/register">
                Попробовать HandySeller бесплатно
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </section>

          {/* Блок 2: Статус продавца */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Какой статус выбрать для продажи хендмейда на Ozon
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Для продажи хендмейда на Ozon подходят два варианта:{" "}
                <strong>самозанятый</strong> или <strong>ИП</strong>.
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
                    <li>✓ Доступ к FBO и маркировке</li>
                    <li>— Нужна регистрация в налоговой</li>
                    <li>— Обязательная отчётность</li>
                  </ul>
                </div>
              </div>

              <p>
                Для стартового мастера обычно достаточно самозанятости. Если
                планируете рост, маркировку или сертификацию — лучше сразу оформить ИП.
              </p>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>💡 HandySeller:</strong> вне зависимости от статуса помогает
                  вести учёт заказов и остатков по Ozon и другим маркетплейсам в одном
                  месте.
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
                Регистрация кабинета продавца на Ozon для мастера
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>Зарегистрироваться на Ozon можно за 15–20 минут:</p>
              <ol className="space-y-2">
                <li>
                  <strong>Перейдите на seller.ozon.ru</strong> — портал для продавцов.
                </li>
                <li>
                  <strong>Выберите статус</strong> — самозанятый, ИП или ООО.
                </li>
                <li>
                  <strong>Заполните форму</strong> — ИНН, паспортные данные, контакты,
                  реквизиты для выплат.
                </li>
                <li>
                  <strong>Дождитесь модерации</strong> — обычно 1–3 рабочих дня.
                </li>
                <li>
                  <strong>Получите доступ</strong> — после одобрения откроется личный
                  кабинет селлера.
                </li>
              </ol>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>🔗 После регистрации:</strong> подключите аккаунт Ozon к
                  HandySeller и управляйте товарами и заказами вместе с Wildberries из
                  одного приложения.
                </p>
              </div>
            </div>
          </section>

          {/* Блок 4: Схемы работы FBO/FBS */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Truck className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                По какой схеме выгоднее продавать хендмейд на Ozon
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>На Ozon есть несколько схем работы:</p>

              <ul className="space-y-2">
                <li>
                  <strong>FBO (Fulfillment by Ozon)</strong> — вы отправляете партию
                  товаров на склад Ozon, а они сами отгружают заказы. Подходит для
                  больших объёмов.
                </li>
                <li>
                  <strong>FBS (Fulfillment by Seller)</strong> — товары хранятся у вас,
                  вы сами привозите их в пункт приёма при заказе.
                </li>
                <li>
                  <strong>RealFBS</strong> — похоже на FBS, но курьер забирает посылку
                  у вас дома.
                </li>
              </ul>

              <p>
                Для мастеров с небольшими партиями обычно удобнее{" "}
                <strong>FBS или RealFBS</strong>: вы храните изделия в мастерской и
                отдаёте по факту заказа. Не нужно сразу отправлять партию на склад.
              </p>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>📦 HandySeller:</strong> помогает отслеживать остатки и
                  заказы, чтобы вы не запутались, что уже отправлено, а что ещё лежит в
                  мастерской.
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
                Как оформить карточки хендмейда на Ozon
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
                Фото и визуал
              </h3>
              <p>Качественные фото — главный продающий элемент:</p>
              <ul className="space-y-1">
                <li>Снимайте при хорошем освещении (естественный свет или лампа)</li>
                <li>Используйте нейтральный фон или lifestyle-фото в интерьере</li>
                <li>Покажите детали крупным планом: текстуру, застёжки, декор</li>
                <li>Добавьте фото в руках для масштаба</li>
                <li>Если возможно — короткое видео</li>
              </ul>

              <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
                Название, описание и ключевые слова
              </h3>
              <p>
                Название должно содержать ключевые слова: «украшение ручной работы»,
                «авторская работа», «подарок в коробке». В описании укажите:
              </p>
              <ul className="space-y-1">
                <li>Материалы (натуральные камни, латунь, соевый воск и т.д.)</li>
                <li>Размеры и вес</li>
                <li>Назначение и для кого подходит</li>
                <li>Особенности ухода</li>
              </ul>

              <h3 className="text-xl font-semibold text-foreground mt-6 mb-3">
                Цена и себестоимость
              </h3>
              <p>
                При формировании цены учитывайте: себестоимость материалов, время
                работы, комиссию Ozon (5–15%), упаковку, логистику и налоги. Не
                ориентируйтесь только на конкурентов — ваша ручная работа уникальна.
              </p>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>⚡ HandySeller:</strong> позволяет один раз описать товар,
                  использовать шаблоны описаний и выгрузить карточку сразу на Ozon и
                  Wildberries. Это сокращает время и снижает риск ошибок.
                </p>
              </div>
            </div>
          </section>

          {/* Блок 6: Логистика */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Упаковка и отправка ручной работы на Ozon
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>Требования к упаковке на Ozon:</p>
              <ul className="space-y-1">
                <li>Надёжная защита от повреждений при транспортировке</li>
                <li>Для хрупких изделий — пузырчатая плёнка или коробка с наполнителем</li>
                <li>Аккуратный внешний вид (особенно для подарков)</li>
                <li>Штрихкод на упаковке (печатается из личного кабинета)</li>
              </ul>

              <p>
                <strong>Совет:</strong> красивая фирменная упаковка и маленький бонус
                (открытка, пробник) повышают шанс на хороший отзыв.
              </p>

              <p>
                Важно отслеживать статусы заказов и не пропускать сроки отправки —
                иначе падает рейтинг продавца.
              </p>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>📊 HandySeller:</strong> показывает статусы заказов по
                  площадкам, что помогает вовремя упаковывать и сдавать посылки.
                </p>
              </div>
            </div>
          </section>

          {/* Блок 7: Продвижение */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Megaphone className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Как продвигать товары ручной работы на Ozon
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>Базовые способы продвижения на Ozon:</p>
              <ul className="space-y-1">
                <li>
                  <strong>Платная реклама</strong> — продвижение в поиске и категориях
                </li>
                <li>
                  <strong>Работа с отзывами</strong> — отвечайте на все отзывы, просите
                  покупателей оставить мнение
                </li>
                <li>
                  <strong>Улучшение карточки</strong> — качественные фото, видео,
                  рич-контент
                </li>
                <li>
                  <strong>Участие в акциях</strong> — скидки и распродажи поднимают
                  товар в выдаче
                </li>
              </ul>

              <p>
                <strong>Дополнительно:</strong> используйте соцсети (Telegram, VK,
                Instagram*) чтобы вести трафик к магазину на Ozon. Показывайте процесс
                создания — это привлекает аудиторию к хендмейду.
              </p>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>📈 HandySeller:</strong> даёт аналитику по продажам — какие
                  товары лучше идут на Ozon vs Wildberries. Это помогает принимать
                  решения, куда вкладываться в рекламу.
                </p>
              </div>
            </div>
          </section>

          {/* Блок 8: Сравнение WB vs Ozon */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Что выбрать для хендмейда: Wildberries или Ozon
              </h2>
            </div>

            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Многим мастерам выгодно быть{" "}
                <strong>сразу на двух площадках</strong>, а не выбирать одну.
              </p>

              <div className="overflow-x-auto my-6 not-prose">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3 font-bold">Критерий</th>
                      <th className="text-left p-3 font-bold">Wildberries</th>
                      <th className="text-left p-3 font-bold">Ozon</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b">
                      <td className="p-3">Аудитория</td>
                      <td className="p-3">Огромная, №1 в России</td>
                      <td className="p-3">Очень большая, №2 в России</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3">Конкуренция</td>
                      <td className="p-3">Высокая, сложнее попасть в топ</td>
                      <td className="p-3">Умеренная, проще выделиться</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3">Логистика</td>
                      <td className="p-3">Строгие требования</td>
                      <td className="p-3">Гибкие схемы FBS/RealFBS</td>
                    </tr>
                    <tr className="border-b">
                      <td className="p-3">Для малых партий</td>
                      <td className="p-3">Подходит (FBS)</td>
                      <td className="p-3">Отлично подходит</td>
                    </tr>
                    <tr>
                      <td className="p-3">Комиссия</td>
                      <td className="p-3">5–15%</td>
                      <td className="p-3">5–15%</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <p>
                <strong>Ключевой тезис:</strong> не обязательно выбирать.{" "}
                <Link
                  href="/kak-prodavat-hendmeid-na-wildberries"
                  className="text-primary hover:underline"
                >
                  HandySeller помогает вести хендмейд сразу на Ozon и Wildberries
                </Link>
                , не дублируя работу и не путая остатки.
              </p>

              <div className="bg-muted/50 rounded-lg p-4 border mt-4">
                <p className="text-sm mb-0">
                  <strong>📚 Читайте также:</strong>{" "}
                  <Link
                    href="/kak-prodavat-hendmeid-na-wildberries"
                    className="text-primary hover:underline"
                  >
                    Как продавать хендмейд на Wildberries — пошаговая инструкция
                  </Link>
                </p>
              </div>
            </div>
          </section>

          {/* FAQ */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">
                Частые вопросы про продажу хендмейда на Ozon
              </h2>
            </div>

            <div className="space-y-3">
              {FAQ_OZON.map(({ q, a }) => (
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
          </section>

          {/* Финальный CTA */}
          <section className="bg-muted/50 rounded-2xl p-8 text-center">
            <h2 className="text-2xl font-bold mb-4">
              Попробуйте HandySeller для Ozon и Wildberries
            </h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              HandySeller экономит время и снижает хаос, когда мастер выходит сразу на
              несколько маркетплейсов. Товары, заказы и остатки — в одном окне. Начните
              с бесплатного тарифа.
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
