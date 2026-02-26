# Настройка домена handyseller.ru в Yandex Cloud

Пошаговая инструкция для подключения домена к VM HandySeller.

---

## 1. Узнать IP адрес VM

```bash
yc compute instance list --format json | jq -r '.[] | select(.name=="handyseller-vm") | .network_interfaces[0].primary_v4_address.one_to_one_nat.address'
```

Или в консоли: [Yandex Cloud](https://console.cloud.yandex.ru) → Compute Cloud → Виртуальные машины → handyseller-vm → Публичный IPv4.

**Сохраните IP** (например `158.160.209.158`).

---

## 2. Настроить DNS

Где вы купили домен?

### Вариант A: Домен в [pdd.yandex.ru](https://pdd.yandex.ru) (Яндекс 360)

1. Войдите в [pdd.yandex.ru](https://pdd.yandex.ru)
2. Выберите домен handyseller.ru
3. DNS-записи → Добавить запись
4. Создайте записи:

| Тип | Имя | Значение | TTL |
|-----|-----|----------|-----|
| A | @ | `ВАШ_IP_VM` | 3600 |
| A | www | `ВАШ_IP_VM` | 3600 |

### Вариант B: Домен в другом регистраторе (Reg.ru, Nic.ru и т.д.)

1. Зайдите в панель управления доменом
2. Откройте раздел DNS / Управление зоной
3. Добавьте A-записи:

| Запись | Тип | Значение |
|-------|-----|----------|
| @ | A | `ВАШ_IP_VM` |
| www | A | `ВАШ_IP_VM` |

### Вариант C: Yandex Cloud DNS (если делегируете зону в Yandex Cloud)

1. Создайте зону DNS в [Yandex Cloud Console](https://console.cloud.yandex.ru) → Network → DNS
2. Добавьте A-запись: имя `@`, значение = IP VM
3. В регистраторе домена укажите NS-серверы Yandex Cloud

---

## 3. Открыть порты 80 и 443 в Yandex Cloud

По умолчанию VM может не принимать входящий трафик на 80/443.

1. [Yandex Cloud Console](https://console.cloud.yandex.ru) → VPC → Группы безопасности
2. Найдите группу, привязанную к подсети VM (или Default Security Group)
3. Добавьте правила **Входящий трафик**:

| Порт | Протокол | Источник |
|------|----------|----------|
| 80 | TCP | 0.0.0.0/0 |
| 443 | TCP | 0.0.0.0/0 |

---

## 4. Установить SSL и настроить Nginx на VM

Подключитесь по SSH и выполните скрипт:

```bash
# С вашего компьютера
ssh -i ~/.ssh/yandex_vm ubuntu@ВАШ_IP_VM
```

На VM:

```bash
# Запустить скрипт настройки домена (см. scripts/setup-domain-ssl.sh)
# Или вручную:
sudo apt-get update && sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d handyseller.ru -d www.handyseller.ru
```

Скрипт `scripts/setup-domain-ssl.sh` автоматизирует установку certbot и обновление nginx.

---

## 5. CORS и переменные окружения

В `.env.secrets` добавьте (если ещё нет):

```
CORS_ORIGIN=https://handyseller.ru,https://www.handyseller.ru
```

Деплой подхватит это и передаст в API.

---

## 6. Проверка

После распространения DNS (5–60 минут, до 24 часов):

- **HTTP:** http://handyseller.ru (редирект на HTTPS после установки SSL)
- **HTTPS:** https://handyseller.ru
- **Приложение:** https://handyseller.ru/login, https://handyseller.ru/register

---

## Порядок действий (кратко)

1. Узнать IP VM
2. Добавить A-записи @ и www в DNS
3. Открыть порты 80, 443 в группе безопасности
4. Выполнить `./scripts/setup-domain-ssl.sh` на VM (или certbot вручную)
5. Передеплоить с `CORS_ORIGIN=https://handyseller.ru,https://www.handyseller.ru`
