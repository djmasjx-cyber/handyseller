import Link from "next/link"
import type { Metadata } from "next"
import { Button, Badge } from "@handyseller/ui"
import { HomeLogoLink } from "@/components/home-logo-link"
import { Breadcrumb, generateBreadcrumbSchema } from "@/components/breadcrumb"
import { TrackedLink } from "@/components/tracked-link"
import { ScrollTracker } from "@/components/scroll-tracker"
import { TelegramLink } from "@/components/telegram-link"
import {
  ArrowRight,
  Palette,
  HelpCircle,
  MessageCircle,
} from "lucide-react"

const CONTACTS = {
  telegramUsername: "Handyseller_bot",
  email: "support@handyseller.ru",
}

const FAQ_ITEMS = [
  {
    id: "bez-ip",
    question: "Можно ли продавать хендмейд на маркетплейсах без ИП?",
    answer: `Да, можно продавать как самозанятый. Это официальный статус, который позволяет легально продавать товары собственного производства на Wildberries, Ozon и других маркетплейсах.

Чтобы стать самозанятым, достаточно зарегистрироваться через приложение «Мой налог» или на сайте ФНС — это занимает 5–10 минут. После регистрации вы платите налог 4% (при продаже физлицам) или 6% (при продаже юрлицам).

Ограничения для самозанятых:
• Годовой доход — не более 2,4 млн рублей
• Нельзя перепродавать чужие товары — только своё производство
• Нельзя нанимать сотрудников по трудовому договору

Если планируете масштабироваться и превышать лимиты — лучше сразу оформить ИП.`,
    links: [{ text: "Подробнее в гайде по Ozon", href: "/kak-prodavat-hendmeid-na-ozon" }],
  },
  {
    id: "wb-ili-ozon",
    question: "Где лучше продавать товары ручной работы: Wildberries или Ozon?",
    answer: `Оба маркетплейса подходят для продажи хендмейда, но имеют свои особенности.

Wildberries:
• Самая большая аудитория в России
• Строгие требования к логистике и упаковке
• Высокая конкуренция — сложнее выделиться
• Подходит для серийного хендмейда с налаженным производством

Ozon:
• Вторая по размеру аудитория
• Гибкие схемы FBS/RealFBS — удобно для небольших партий
• Проще начать с минимальным количеством товара
• Хорошо заходят авторские и уникальные изделия

Наш совет: многие мастера успешно продают сразу на обеих площадках. Это увеличивает охват и снижает риски зависимости от одной площадки. HandySeller помогает управлять товарами на Wildberries и Ozon из одного окна — синхронизация остатков работает автоматически.`,
    links: [
      { text: "Гайд по Wildberries", href: "/kak-prodavat-hendmeid-na-wildberries" },
      { text: "Гайд по Ozon", href: "/kak-prodavat-hendmeid-na-ozon" },
    ],
  },
  {
    id: "sertifikat",
    question: "Нужен ли сертификат для продажи хендмейда на маркетплейсах?",
    answer: `Для большинства категорий хендмейда сертификация не требуется. Вы можете свободно продавать:

• Украшения и бижутерию
• Свечи и ароматы для дома
• Декор и интерьерные изделия
• Текстиль (кроме детского)
• 3D-печатные изделия и сувениры

Сертификация может потребоваться для:
• Детских товаров (игрушки, одежда для детей до 14 лет)
• Косметики и средств по уходу
• Товаров, контактирующих с пищей
• Электрических изделий

Важно: требования могут отличаться на разных площадках. Перед началом продаж проверьте раздел «Документы» в личном кабинете продавца — там указано, какие сертификаты нужны для вашей категории товара.

Если сомневаетесь — лучше уточнить в поддержке площадки до начала продаж.`,
    links: [],
  },
  {
    id: "foto",
    question: "Как правильно сфотографировать хендмейд для маркетплейса?",
    answer: `Качественные фото — главный продающий элемент карточки товара. Вот универсальные советы, которые работают на всех площадках:

Освещение:
• Снимайте при естественном свете (у окна) или используйте лампы
• Избегайте прямых солнечных лучей — они дают жёсткие тени
• Лучшее время для съёмки — утро или пасмурный день

Фон:
• Нейтральный (белый, бежевый, серый) — для каталожных фото
• Lifestyle-фон (интерьер, текстура дерева) — для атмосферных кадров
• Избегайте пёстрых фонов — они отвлекают от товара

Ракурсы (минимум 5 фото):
• Общий план — товар целиком
• Детали — текстура, застёжки, декор
• Масштаб — товар в руках или рядом с линейкой
• В использовании — украшение на теле, свеча в интерьере
• Упаковка — если она красивая, это плюс

Дополнительно:
• Если возможно, добавьте короткое видео
• Используйте инфографику для указания размеров
• Снимайте в одном стиле — это создаёт узнаваемость бренда`,
    links: [
      { text: "Гайд по карточкам на Wildberries", href: "/kak-prodavat-hendmeid-na-wildberries" },
      { text: "Гайд по карточкам на Ozon", href: "/kak-prodavat-hendmeid-na-ozon" },
    ],
  },
  {
    id: "zakazы",
    question: "Как не запутаться в заказах, если продаёшь на нескольких маркетплейсах?",
    answer: `Когда вы продаёте на 2–3 площадках одновременно, легко запутаться: где какой заказ, сколько осталось товара, что уже отправлено. Типичные проблемы:

• Продали один и тот же товар на WB и Ozon одновременно (пересорт)
• Забыли обновить остатки после продажи
• Пропустили срок отправки и получили штраф
• Запутались в статусах заказов

Решение — использовать единую систему учёта. HandySeller создан именно для этого:

✓ Все заказы с Wildberries и Ozon — в одном списке
✓ Остатки синхронизируются автоматически: продали на Ozon — остаток уменьшился и на WB
✓ Статусы заказов обновляются в реальном времени
✓ Можно работать с телефона — удобно, если вы в мастерской

Это экономит часы времени и избавляет от стресса «а вдруг я что-то забыл».`,
    links: [],
    cta: true,
  },
  {
    id: "zarabotok",
    question: "Сколько можно зарабатывать на хендмейде через маркетплейсы?",
    answer: `Честный ответ: зависит от ниши, цены, объёма и вашего времени. Мы не обещаем конкретных цифр, но можем поделиться реальными диапазонами:

Начинающий мастер (1–3 месяца):
• 10–30 продаж в месяц
• Доход: 10 000 – 50 000 ₽
• Фокус: тестирование ниши, сбор отзывов

Стабильный мастер (6–12 месяцев):
• 50–150 продаж в месяц
• Доход: 50 000 – 150 000 ₽
• Фокус: расширение ассортимента, выход на вторую площадку

Опытный мастер (1+ год):
• 200+ продаж в месяц
• Доход: от 150 000 ₽
• Фокус: масштабирование, автоматизация

Что влияет на доход:
• Ниша (украшения продаются чаще, но дешевле; декор — реже, но дороже)
• Качество фото и описаний
• Количество отзывов и рейтинг
• Участие в акциях площадок
• Наличие на нескольких площадках

Главное — начать. Даже если первые продажи будут небольшими, вы получите реальный опыт и понимание, как работает рынок.`,
    links: [{ text: "Полный гайд по маркетплейсам", href: "/kak-prodavat-hendmeid-na-marketpleysah" }],
  },
]

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer.replace(/\n/g, " ").replace(/•/g, "-") },
  })),
}

const breadcrumbSchema = generateBreadcrumbSchema([
  { name: "Главная", url: "https://app.handyseller.ru" },
  { name: "Частые вопросы", url: "https://app.handyseller.ru/faq" },
])

export const metadata: Metadata = {
  title: "Частые вопросы о продаже хендмейда на маркетплейсах — HandySeller",
  description:
    "Ответы на главные вопросы мастеров: как продавать хендмейд без ИП, что нужно для Wildberries и Ozon, как вести учёт и не запутаться в заказах.",
  alternates: { canonical: "https://app.handyseller.ru/faq" },
  openGraph: {
    title: "FAQ: продажа хендмейда на маркетплейсах",
    description: "Ответы на вопросы мастеров о продаже товаров ручной работы на Wildberries и Ozon.",
    url: "https://app.handyseller.ru/faq",
  },
}

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-background">
      <ScrollTracker pageId="faq" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
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
        <article className="max-w-3xl mx-auto">
          <Breadcrumb items={[
            { label: "Главная", href: "/" },
            { label: "Частые вопросы" },
          ]} />

          <Badge variant="secondary" className="mb-4">
            <HelpCircle className="mr-1 h-3 w-3" />
            FAQ
          </Badge>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Частые вопросы о продаже хендмейда на маркетплейсах
          </h1>

          <p className="text-lg text-muted-foreground mb-8">
            Собрали ответы на главные вопросы мастеров о продаже товаров ручной работы
            на Wildberries, Ozon и других площадках.
          </p>

          {/* Quick navigation */}
          <nav className="bg-muted/50 rounded-lg p-4 mb-12">
            <p className="text-sm font-medium mb-3">Быстрая навигация:</p>
            <ul className="space-y-1 text-sm">
              {FAQ_ITEMS.map(({ id, question }) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-primary hover:underline">
                    {question}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* FAQ Items */}
          <div className="space-y-12">
            {FAQ_ITEMS.map(({ id, question, answer, links, cta }) => (
              <section key={id} id={id} className="scroll-mt-20">
                <h2 className="text-xl md:text-2xl font-bold mb-4">{question}</h2>
                <div className="prose prose-lg max-w-none text-muted-foreground">
                  {answer.split("\n\n").map((paragraph, idx) => {
                    if (paragraph.startsWith("•") || paragraph.includes("\n•")) {
                      const items = paragraph.split("\n").filter((l) => l.trim());
                      return (
                        <ul key={idx} className="space-y-1">
                          {items.map((item, i) => (
                            <li key={i}>{item.replace(/^•\s*/, "")}</li>
                          ))}
                        </ul>
                      )
                    }
                    if (paragraph.startsWith("✓")) {
                      const items = paragraph.split("\n").filter((l) => l.trim());
                      return (
                        <ul key={idx} className="space-y-1">
                          {items.map((item, i) => (
                            <li key={i} className="text-green-600 dark:text-green-400">
                              {item}
                            </li>
                          ))}
                        </ul>
                      )
                    }
                    return <p key={idx}>{paragraph}</p>
                  })}
                </div>

                {links && links.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        className="text-sm text-primary hover:underline"
                      >
                        → {link.text}
                      </Link>
                    ))}
                  </div>
                )}

                {cta && (
                  <Button className="mt-6" asChild>
                    <TrackedLink href="/register" goal="click_start_free">
                      Попробовать HandySeller бесплатно
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </TrackedLink>
                  </Button>
                )}
              </section>
            ))}
          </div>

          {/* CTA */}
          <section className="bg-muted/50 rounded-2xl p-8 text-center mt-12">
            <h2 className="text-2xl font-bold mb-4">Остались вопросы?</h2>
            <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
              Напишите нам в Telegram — ответим быстро и поможем разобраться с любыми
              нюансами продажи хендмейда на маркетплейсах.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <TelegramLink
                username={CONTACTS.telegramUsername}
                source="faq"
                className="inline-flex items-center justify-center gap-2 rounded-md px-6 py-2.5 text-sm font-medium text-white shadow transition-colors hover:opacity-90 bg-[#0088cc]"
              >
                <MessageCircle className="h-4 w-4" />
                Написать в Telegram
              </TelegramLink>
              <Button variant="outline" asChild>
                <TrackedLink href="/register" goal="click_start_free">Попробовать HandySeller</TrackedLink>
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
                <TelegramLink
                  username={CONTACTS.telegramUsername}
                  source="footer_faq"
                  className="text-muted-foreground hover:text-primary block"
                >
                  Telegram
                </TelegramLink>
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
