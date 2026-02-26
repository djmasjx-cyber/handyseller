# Миграция: Tilda + app.handyseller.ru

## Шаг 1. DNS для app (reg.ru)

1. Зайдите в [reg.ru](https://www.reg.ru) → Управление доменом handyseller.ru
2. DNS-серверы и управление зоной → **Изменить**
3. Добавьте A-запись:
   - **app** → `158.160.209.158`
4. Сохраните

Проверка (через 5–15 мин): `host app.handyseller.ru 8.8.8.8`

---

## Шаг 2. SSL и деплой — ✅ выполнено

- SSL для app.handyseller.ru получен
- Nginx обновлён
- Деплой выполнен

---

## Шаг 3. Tilda: создать лендинг

1. Войти: [tilda.cc](https://tilda.cc) — логин из .env.secrets (TILDA_EMAIL)
2. Создать новый сайт → «Пустая страница» или шаблон
3. Собрать страницы по [TILDA-LANDING-BRIEF.md](./TILDA-LANDING-BRIEF.md)
4. В настройках проекта → **Публикация** → подключить домен **handyseller.ru**
5. Tilda выдаст инструкции по DNS — изменить @ и www на их серверы

---

## Шаг 4. После подключения Tilda

- handyseller.ru, www → Tilda (лендинг)
- app.handyseller.ru → приложение HandySeller
- На лендинге кнопки «Войти» / «Регистрация» → `https://app.handyseller.ru/login`

---

## ⚠️ Важно: DNS на Tilda vs Reg.ru

Если вы указали NS Tilda (ns1.tildadns.com), то в Reg.ru нельзя добавить A-запись для `app`.  
**Решение:** [DNS-TILDA-REG-RU.md](./DNS-TILDA-REG-RU.md) — перевести DNS обратно на Reg.ru и задать все A-записи вручную.
