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
  Camera,
  Sun,
  Square,
  RotateCcw,
  Smartphone,
  CheckCircle,
  XCircle,
} from "lucide-react"

const CONTACTS = {
  telegram: "https://t.me/Handyseller_bot",
  email: "support@handyseller.ru",
}

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Как сфотографировать хендмейд для маркетплейсов: простой гайд",
  description: "Пошаговый гайд по съёмке товаров ручной работы на телефон: свет, фон, ракурсы, типичные ошибки. Советы по инфографике для карточек.",
  author: { "@type": "Organization", name: "HandySeller" },
  publisher: { "@type": "Organization", name: "HandySeller", url: "https://app.handyseller.ru" },
  datePublished: "2026-03-01",
  dateModified: new Date().toISOString().split("T")[0],
}

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "Главная", url: "https://app.handyseller.ru" },
  { name: "Блог", url: "https://app.handyseller.ru/blog" },
  { name: "Фото для маркетплейсов", url: "https://app.handyseller.ru/blog/kak-sdelat-foto-hendmeida-dlya-marketpleysov" },
])

export const metadata: Metadata = {
  title: "Как сфотографировать хендмейд для маркетплейсов: простой гайд",
  description:
    "Пошаговый гайд по съёмке на телефон: свет, фон, ракурсы, типичные ошибки. Советы по инфографике для карточек товаров Wildberries и Ozon.",
  keywords: ["как фотографировать хендмейд", "фото для маркетплейса", "съёмка товаров ручной работы"],
  alternates: { canonical: "https://app.handyseller.ru/blog/kak-sdelat-foto-hendmeida-dlya-marketpleysov" },
  openGraph: {
    title: "Как сфотографировать хендмейд для маркетплейсов",
    description: "Простой гайд по съёмке товаров ручной работы на телефон.",
    url: "https://app.handyseller.ru/blog/kak-sdelat-foto-hendmeida-dlya-marketpleysov",
    type: "article",
  },
}

export default function PhotoGuidePage() {
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
        <ScrollTracker pageId="blog-photo" />
        <article className="max-w-4xl mx-auto">
          <Breadcrumb items={[
            { label: "Главная", href: "/" },
            { label: "Блог", href: "/blog" },
            { label: "Фото для маркетплейсов" },
          ]} />

          <Badge variant="secondary" className="mb-4">
            <Camera className="mr-1 h-3 w-3" />
            Фотография
          </Badge>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-6">
            Как сфотографировать хендмейд для Wildberries и Ozon
          </h1>

          {/* Вступление */}
          <section className="mb-12">
            <div className="prose prose-lg max-w-none text-muted-foreground">
              <p>
                Качественное фото — это 80% успеха карточки товара. Покупатель не может 
                потрогать изделие, поэтому решение о покупке принимает по картинке. 
                Хорошая новость: для хороших фото не нужна дорогая камера или студия.
              </p>
              <p>
                В этом гайде покажем, как сделать продающие фото хендмейда на обычный 
                смартфон. Всё, что нужно — правильный свет, фон и немного практики.
              </p>
            </div>
          </section>

          {/* Оборудование */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">Что понадобится</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-3">Минимальный набор (0 ₽):</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Смартфон с камерой от 12 Мп</li>
                  <li>• Окно с дневным светом</li>
                  <li>• Белый ватман или ткань</li>
                  <li>• Стопка книг (вместо штатива)</li>
                </ul>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-3">Улучшенный набор (2–5 тыс. ₽):</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Кольцевая лампа или софтбокс</li>
                  <li>• Мини-штатив для телефона</li>
                  <li>• Фотофон (белый, серый, деревянный)</li>
                  <li>• Отражатель из пенопласта</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Свет */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Sun className="h-5 w-5 text-yellow-500" />
              </div>
              <h2 className="text-2xl font-bold">Свет — главный секрет</h2>
            </div>

            <div className="space-y-4 text-muted-foreground">
              <p>
                <strong>Дневной свет у окна</strong> — лучший и бесплатный источник. 
                Поставьте стол у окна так, чтобы свет падал сбоку (не сверху и не сзади). 
                Идеальное время — утро или день, когда солнце не бьёт прямо в окно.
              </p>
              <p>
                <strong>Рассеивайте жёсткий свет.</strong> Если солнце яркое — завесьте 
                окно тюлем или белой тканью. Жёсткие тени портят фото, а мягкий 
                рассеянный свет делает изделие объёмным и привлекательным.
              </p>
              <p>
                <strong>Используйте отражатель.</strong> Белый лист бумаги или пенопласт 
                напротив окна отражает свет и убирает тени с теневой стороны изделия. 
                Это простой приём, который сразу улучшает качество фото.
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 mt-4">
              <p className="text-sm">
                <strong>Совет:</strong> Никогда не используйте вспышку телефона — она 
                даёт плоский, неестественный свет и убивает объём изделия.
              </p>
            </div>
          </section>

          {/* Фон */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-gray-500/10 flex items-center justify-center">
                <Square className="h-5 w-5 text-gray-500" />
              </div>
              <h2 className="text-2xl font-bold">Выбор фона</h2>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Белый фон</h3>
                <p className="text-sm text-muted-foreground">
                  Универсальный выбор для маркетплейсов. Подходит для любых товаров, 
                  соответствует требованиям площадок.
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Серый/бежевый</h3>
                <p className="text-sm text-muted-foreground">
                  Для белых или светлых изделий, которые теряются на белом фоне. 
                  Создаёт мягкий контраст.
                </p>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Текстурный (дерево)</h3>
                <p className="text-sm text-muted-foreground">
                  Для lifestyle-фото. Добавляет уют и показывает изделие в интерьере. 
                  Не для главного фото.
                </p>
              </div>
            </div>

            <div className="border-l-4 border-primary/50 pl-4 py-2">
              <p className="text-muted-foreground text-sm">
                <strong>Требования Wildberries:</strong> главное фото должно быть на 
                белом или светлом однотонном фоне. Wildberries может отклонить карточку 
                с пёстрым или тёмным фоном.
              </p>
            </div>
          </section>

          {/* Ракурсы */}
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <RotateCcw className="h-5 w-5 text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold">Обязательные ракурсы</h2>
            </div>

            <p className="text-muted-foreground mb-4">
              Для карточки товара нужно минимум 5–7 фото. Каждое должно показывать 
              изделие с новой стороны или давать дополнительную информацию.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="border rounded-lg p-3">
                  <h3 className="font-bold text-sm">1. Главное фото</h3>
                  <p className="text-xs text-muted-foreground">
                    Изделие целиком, фронтально, на белом фоне. Это лицо карточки.
                  </p>
                </div>
                <div className="border rounded-lg p-3">
                  <h3 className="font-bold text-sm">2. Вид сзади / сбоку</h3>
                  <p className="text-xs text-muted-foreground">
                    Покажите изделие с другого ракурса. Особенно важно для одежды и сумок.
                  </p>
                </div>
                <div className="border rounded-lg p-3">
                  <h3 className="font-bold text-sm">3. Детали крупным планом</h3>
                  <p className="text-xs text-muted-foreground">
                    Фактура, застёжка, швы, фурнитура. Покажите качество работы.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="border rounded-lg p-3">
                  <h3 className="font-bold text-sm">4. Масштаб / в руке</h3>
                  <p className="text-xs text-muted-foreground">
                    Покажите реальный размер изделия. Для украшений — на модели или в руке.
                  </p>
                </div>
                <div className="border rounded-lg p-3">
                  <h3 className="font-bold text-sm">5. В использовании</h3>
                  <p className="text-xs text-muted-foreground">
                    Lifestyle-фото: свеча горит, украшение на человеке, сумка на плече.
                  </p>
                </div>
                <div className="border rounded-lg p-3">
                  <h3 className="font-bold text-sm">6. Инфографика</h3>
                  <p className="text-xs text-muted-foreground">
                    Фото с текстом: размеры, состав, преимущества. Делается в Canva.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Хорошо vs Плохо */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Хорошее фото vs плохое</h2>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="border border-green-500/30 rounded-lg p-4 bg-green-500/5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <h3 className="font-bold text-green-700">Хорошее фото</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✓ Чистый светлый фон без посторонних предметов</li>
                  <li>✓ Мягкий рассеянный свет, нет жёстких теней</li>
                  <li>✓ Изделие в фокусе, резкое по всей площади</li>
                  <li>✓ Видны детали и фактура материала</li>
                  <li>✓ Правильный баланс белого (нет желтизны)</li>
                  <li>✓ Изделие занимает 70–80% кадра</li>
                </ul>
              </div>
              <div className="border border-red-500/30 rounded-lg p-4 bg-red-500/5">
                <div className="flex items-center gap-2 mb-3">
                  <XCircle className="h-5 w-5 text-red-500" />
                  <h3 className="font-bold text-red-700">Плохое фото</h3>
                </div>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>✗ Пёстрый фон, виден интерьер квартиры</li>
                  <li>✗ Тёмное фото, снято вечером при лампе</li>
                  <li>✗ Размытое изображение, не видно деталей</li>
                  <li>✗ Жёсткие тени от вспышки</li>
                  <li>✗ Жёлтый или синий оттенок</li>
                  <li>✗ Изделие мелкое, много пустого пространства</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Инфографика */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-4">Инфографика для карточек</h2>
            <p className="text-muted-foreground mb-4">
              Инфографика — это фото с наложенным текстом и графикой. Она помогает 
              выделиться в выдаче и донести ключевую информацию до покупателя.
            </p>

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Что выносить на инфографику:</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Размеры изделия</li>
                  <li>• Состав и материалы</li>
                  <li>• Ключевые преимущества</li>
                  <li>• Сравнение с конкурентами</li>
                  <li>• Отзыв покупателя</li>
                </ul>
              </div>
              <div className="border rounded-lg p-4">
                <h3 className="font-bold mb-2">Где делать инфографику:</h3>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Canva (бесплатно, много шаблонов)</li>
                  <li>• Figma (бесплатно, гибкий редактор)</li>
                  <li>• VistaCreate (аналог Canva)</li>
                  <li>• Photoshop / Illustrator (для профи)</li>
                </ul>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Совет:</strong> Не перегружайте инфографику текстом. 3–5 
                коротких тезисов работают лучше, чем простыня текста. Используйте 
                крупный шрифт — фото просматривают с телефона.
              </p>
            </div>
          </section>

          {/* Связка с HandySeller */}
          <section className="bg-primary/5 border border-primary/20 rounded-2xl p-8 mb-12">
            <h2 className="text-2xl font-bold mb-4">Загрузка фото через HandySeller</h2>
            <p className="text-muted-foreground mb-4">
              С HandySeller вы можете загрузить фото один раз и выгрузить карточку 
              сразу на Wildberries, Ozon и Яндекс Маркет. Не нужно загружать одни 
              и те же фото три раза в разные кабинеты.
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
                <Link href="/blog/kak-rasschitat-tsenu-hendmeida" className="text-primary hover:underline">
                  Как правильно рассчитать цену на хендмейд
                </Link>
              </li>
              <li>
                <Link href="/kak-prodavat-hendmeid-na-ozon" className="text-primary hover:underline">
                  Как продавать хендмейд на Ozon
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
