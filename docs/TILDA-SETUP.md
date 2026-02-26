# Подключение Tilda: handyseller.ru

## Шаг 1. Вход

1. Откройте [tilda.cc](https://tilda.cc)
2. Войдите: **TILDA_EMAIL** и **TILDA_PASSWORD** из `.env.secrets`

## Шаг 2. Создать сайт

1. «Создать сайт» → «Пустая страница» или выберите шаблон
2. Соберите страницы по [TILDA-LANDING-BRIEF.md](./TILDA-LANDING-BRIEF.md)
3. Сохраните и опубликуйте

## Шаг 3. Подключить домен

1. Настройки проекта → **Публикация** → **Свой домен**
2. Укажите **handyseller.ru**
3. Tilda выдаст инструкции по DNS (A-записи или CNAME)
4. В [reg.ru](https://www.reg.ru) измените DNS для @ и www согласно инструкциям Tilda
5. После распространения DNS (5–60 мин) handyseller.ru будет показывать лендинг Tilda

## Шаг 4. Ссылки на приложение

Все кнопки «Войти», «Регистрация», «Открыть приложение» должны вести на:

- `https://app.handyseller.ru/login`
- `https://app.handyseller.ru/register`
- `https://app.handyseller.ru`

## Итог

| Домен | Содержимое |
|-------|------------|
| handyseller.ru, www | Лендинг Tilda |
| app.handyseller.ru | Приложение HandySeller |
