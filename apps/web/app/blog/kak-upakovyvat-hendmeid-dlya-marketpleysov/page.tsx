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
  Package,
  AlertTriangle,
  Star,
  Shield,
} from "lucide-react"

const CONTACTS = {
  telegram: "https://t.me/Handyseller_bot",
  email: "support@handyseller.ru",
}

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Как упаковать хендмейд для отправки на маркетплейс: требования и советы",
  description: "Требования к упаковке на Wildberries, Ozon, Яндекс Маркет. Защита хрупких изделий и как красивая упаковка влияет на отзывы.",
  author: { "@type": "Organization", name: "HandySeller" },
  publisher: { "@type": "Organization", name: "HandySeller", url: "https://app.handyseller.ru" },
  datePublished: "2026-03-01",
  dateModified: new Date().toISOString().split("T")[0],
}

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "Главная", url: "https://app.handyseller.ru" },
  { name: "Блог", url: "https://app.handyseller.ru/blog" },
  { name: "Упаковка для маркетплейсов", url: "https://app.handyseller.ru/blog/kak-upakovyvat-hendmeid-dlya-marketpleysov" },
])

export const metadata: Metadata = {
  title: "Как упаковать хендмейд для отправки на маркетплейс: требования и советы",
  description:
    "Требования к упаковке на Wildberries, Ozon, Яндекс Маркет. Защита хрупких изделий и как красивая упаковка влияет на отзывы.",
  keywords: ["упаковка хендмейда для маркетплейса", "как упаковать изделие ручной работы", "требования к упаковке wildberries"],
  alternates: { canonical: "https://app.handyseller.ru/blog/kak-upakovyvat-hendmeid-dlya-marketpleysov" },
  openGraph: {
    title: "Как упаковать хендмейд для маркетплейсов",
    description: "Требования к упаковке и советы по защите хрупких изделий.",
    url: "https://app.handyseller.ru/blog/kak-upakovyvat-hendmeid-dlya-marketpleysov",
    type: "article",
  },
}

export default function PackagingGuidePage() {
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
        <ScrollTracker pageId="blog-packaging" />
        <article className="max-w-4xl mx-auto">
          <Breadcrumb items={[
            { label: "Главная", href: "/" },
            { label: "Блог", href: "/blog" },
            { label: "Упаковка для маркетплейсов" },
          ]} />

          <Badge variant="secondary" className="mb-4">
            <Package className="mr-1 h-3 w-3" />
            Логистика
          </Badge>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
            Как упаковать хендмейд для маркетплейсов: Wildberries, Ozon, Яндекс Маркет
          </h1>

          {/* Вступление */}
          <section className="mb-12">
            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Упаковка — это последний шанс произвести впечатление на покупателя. 
                Изделие может быть идеальным, но если оно приедет мятым, поцарапанным 
                или в грязном пакете — отзыв будет плохим.
              </p>
              <p>
                У каждого маркетплейса свои требования к упаковке. Несоблюдение — это 
                штрафы, возвраты и отказы в приёмке. В этом гайде разберём требования 
                всех площадок и дадим практические советы.
              </p>
            </div>
          </section>

          {/* Общие правила */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Общие правила упаковки хендмейда</h2>

            <div className="grid md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-3">Обязательно:</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✓ Индивидуальная упаковка для каждого товара</li>
                  <li>✓ Защита от повреждений при транспортировке</li>
                  <li>✓ Штрихкод на каждой единице</li>
                  <li>✓ Чистая, целая упаковка без дефектов</li>
                  <li>✓ Соответствие размера упаковки товару</li>
                </ul>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-3">Запрещено:</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✗ Отправлять без упаковки</li>
                  <li>✗ Использовать грязную/мятую упаковку</li>
                  <li>✗ Заклеивать штрихкод скотчем</li>
                  <li>✗ Упаковывать несколько товаров вместе (если это не комплект)</li>
                  <li>✗ Использовать упаковку с чужими логотипами</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Требования площадок */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Требования к упаковке по площадкам</h2>

            <div className="space-y-6">
              {/* Wildberries */}
              <div className="border rounded-xl p-6">
                <h3 className="text-xl font-bold mb-4 text-purple-600">Wildberries</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Основные требования:</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• Прозрачный полиэтиленовый пакет (для большинства товаров)</li>
                      <li>• Штрихкод приклеивается на пакет снаружи</li>
                      <li>• Для хрупких товаров — жёсткая упаковка + пузырчатая плёнка</li>
                      <li>• Размер штрихкода: 58×40 мм или 58×30 мм</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Особенности для хендмейда:</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• Украшения — в зип-пакетах или на подложке</li>
                      <li>• Свечи — в коробках, защита от механических повреждений</li>
                      <li>• Керамика — пузырчатая плёнка + картонная коробка</li>
                    </ul>
                  </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-3 mt-4">
                  <p className="text-sm">
                    <strong>Штраф за нарушение:</strong> от 50 ₽ за единицу. При систематических 
                    нарушениях — блокировка поставок.
                  </p>
                </div>
              </div>

              {/* Ozon */}
              <div className="border rounded-xl p-6">
                <h3 className="text-xl font-bold mb-4 text-blue-600">Ozon</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Основные требования:</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• Индивидуальная упаковка с этикеткой</li>
                      <li>• Штрихкод можно печатать на обычной бумаге и клеить</li>
                      <li>• Для FBS — внешняя упаковка для курьера</li>
                      <li>• Размер этикетки: 75×120 мм (рекомендуемый)</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Особенности для хендмейда:</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• Ozon лояльнее к упаковке, чем WB</li>
                      <li>• Можно использовать крафт-бумагу и картон</li>
                      <li>• Для FBS — двойная упаковка (внутренняя + внешняя)</li>
                    </ul>
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-3 mt-4">
                  <p className="text-sm">
                    <strong>Важно:</strong> При FBS товар упаковывается дважды — внутренняя 
                    упаковка для покупателя, внешняя — для логистики.
                  </p>
                </div>
              </div>

              {/* Яндекс Маркет */}
              <div className="border rounded-xl p-6">
                <h3 className="text-xl font-bold mb-4 text-yellow-600">Яндекс Маркет</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Основные требования:</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• Упаковка должна защищать товар при транспортировке</li>
                      <li>• Этикетка Маркета на каждом товаре</li>
                      <li>• Для FBY — штрихкод на прозрачном пакете</li>
                      <li>• Для DBS — упаковка на усмотрение продавца</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">Особенности для хендмейда:</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• Самые мягкие требования из всех площадок</li>
                      <li>• DBS — полный контроль над упаковкой</li>
                      <li>• Можно вкладывать визитки и благодарственные письма</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Защита хрупких товаров */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Shield className="h-5 w-5 text-orange-500" />
              </div>
              <h2 className="text-2xl font-bold">Как защитить хрупкие изделия</h2>
            </div>

            <p className="text-muted-foreground mb-4">
              Хендмейд часто — это хрупкие вещи: керамика, стекло, свечи, украшения 
              с камнями. Вот как защитить их при транспортировке:
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-3">Материалы для защиты:</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><strong>Пузырчатая плёнка</strong> — основа защиты, оборачивайте в 2–3 слоя</li>
                  <li><strong>Картонные коробки</strong> — жёсткий каркас для защиты от ударов</li>
                  <li><strong>Наполнитель</strong> — крафт-бумага, стружка, пенопласт</li>
                  <li><strong>Картонные уголки</strong> — для защиты краёв</li>
                </ul>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-3">Правила упаковки хрупкого:</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Товар не должен болтаться в коробке</li>
                  <li>• Между товаром и стенками — минимум 2 см наполнителя</li>
                  <li>• Если несколько предметов — каждый отдельно в пузырчатку</li>
                  <li>• Наклейка «Хрупкое» / «Fragile» на коробку</li>
                </ul>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 mt-4">
              <p className="text-sm text-muted-foreground">
                <strong>Тест «подбросьте коробку»:</strong> Если вы можете уронить 
                упакованную коробку с высоты 1 метра и товар не пострадает — упаковка 
                хорошая. Если есть сомнения — добавьте ещё слой защиты.
              </p>
            </div>
          </section>

          {/* Упаковка как маркетинг */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Star className="h-5 w-5 text-yellow-500" />
              </div>
              <h2 className="text-2xl font-bold">Упаковка как инструмент маркетинга</h2>
            </div>

            <p className="text-muted-foreground mb-4">
              Красивая упаковка — это wow-эффект при распаковке. Покупатели снимают 
              unboxing-видео, пишут отзывы про «приятную упаковку» и возвращаются снова.
            </p>

            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Визитка / благодарственная карточка</h3>
                <p className="text-sm text-muted-foreground">
                  «Спасибо за покупку! Буду рада вашему отзыву ⭐» + контакты. 
                  Работает на повторные покупки и отзывы.
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Брендированная упаковка</h3>
                <p className="text-sm text-muted-foreground">
                  Коробка с логотипом, фирменный скотч, наклейки. Создаёт 
                  ощущение премиума даже для недорогих товаров.
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Маленький подарок</h3>
                <p className="text-sm text-muted-foreground">
                  Пробник, мини-версия, открытка. Неожиданный бонус — верный 
                  способ получить хороший отзыв.
                </p>
              </div>
            </div>

            <div className="border-l-4 border-yellow-500/50 pl-4 py-2">
              <p className="text-muted-foreground text-sm">
                <strong>Важно:</strong> На Wildberries вложения в упаковку (визитки, 
                подарки) могут быть запрещены в некоторых категориях. Проверяйте 
                правила площадки перед отправкой.
              </p>
            </div>
          </section>

          {/* Что будет если плохо упаковать */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold">Что будет, если упаковать плохо</h2>
            </div>

            <div className="space-y-3">
              <div className="border-l-4 border-red-500/50 pl-4 py-2">
                <h3 className="font-bold mb-1">Отказ в приёмке на складе</h3>
                <p className="text-muted-foreground text-sm">
                  Товар вернут обратно, вы оплатите доставку в обе стороны. Плюс 
                  время на переупаковку и повторную отправку.
                </p>
              </div>
              <div className="border-l-4 border-red-500/50 pl-4 py-2">
                <h3 className="font-bold mb-1">Штрафы от маркетплейса</h3>
                <p className="text-muted-foreground text-sm">
                  Wildberries штрафует от 50 ₽ за единицу с неправильной упаковкой. 
                  При большой партии сумма ощутимая.
                </p>
              </div>
              <div className="border-l-4 border-red-500/50 pl-4 py-2">
                <h3 className="font-bold mb-1">Повреждённый товар = плохой отзыв</h3>
                <p className="text-muted-foreground text-sm">
                  Даже если товар отличный, повреждение при доставке — это одна 
                  звезда и негативный отзыв. Рейтинг падает, продажи снижаются.
                </p>
              </div>
              <div className="border-l-4 border-red-500/50 pl-4 py-2">
                <h3 className="font-bold mb-1">Возврат от покупателя</h3>
                <p className="text-muted-foreground text-sm">
                  Покупатель вернёт повреждённый товар. Вы потеряете и товар, и 
                  комиссию, и время. Хуже того — товар может быть уже непригоден 
                  для повторной продажи.
                </p>
              </div>
            </div>
          </section>

          {/* Чек-лист */}
          <section className="bg-muted/50 rounded-2xl p-8 mb-12">
            <h2 className="text-2xl font-bold mb-4">Чек-лист упаковки</h2>
            <div className="space-y-2">
              <label className="flex items-center gap-3 text-muted-foreground">
                <input type="checkbox" className="h-5 w-5 rounded border-gray-300" />
                <span>Товар в индивидуальной упаковке</span>
              </label>
              <label className="flex items-center gap-3 text-muted-foreground">
                <input type="checkbox" className="h-5 w-5 rounded border-gray-300" />
                <span>Штрихкод наклеен и хорошо читается</span>
              </label>
              <label className="flex items-center gap-3 text-muted-foreground">
                <input type="checkbox" className="h-5 w-5 rounded border-gray-300" />
                <span>Хрупкие изделия защищены пузырчатой плёнкой</span>
              </label>
              <label className="flex items-center gap-3 text-muted-foreground">
                <input type="checkbox" className="h-5 w-5 rounded border-gray-300" />
                <span>Товар не болтается в коробке</span>
              </label>
              <label className="flex items-center gap-3 text-muted-foreground">
                <input type="checkbox" className="h-5 w-5 rounded border-gray-300" />
                <span>Упаковка чистая, без дефектов</span>
              </label>
              <label className="flex items-center gap-3 text-muted-foreground">
                <input type="checkbox" className="h-5 w-5 rounded border-gray-300" />
                <span>Вложена визитка или благодарственная карточка</span>
              </label>
              <label className="flex items-center gap-3 text-muted-foreground">
                <input type="checkbox" className="h-5 w-5 rounded border-gray-300" />
                <span>Пройден тест «подбросьте коробку»</span>
              </label>
            </div>
          </section>

          {/* CTA */}
          <section className="bg-primary/5 border border-primary/20 rounded-2xl p-8 mb-12">
            <h2 className="text-2xl font-bold mb-4">Управляйте поставками через HandySeller</h2>
            <p className="text-muted-foreground mb-4">
              HandySeller помогает отслеживать поставки на все маркетплейсы, 
              контролировать остатки и планировать отгрузки. Меньше хаоса — 
              больше времени на творчество.
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
                <Link href="/blog/kak-sdelat-foto-hendmeida-dlya-marketpleysov" className="text-primary hover:underline">
                  Как сфотографировать хендмейд для маркетплейсов
                </Link>
              </li>
              <li>
                <Link href="/blog/kak-rasschitat-tsenu-hendmeida" className="text-primary hover:underline">
                  Как правильно рассчитать цену на хендмейд
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
