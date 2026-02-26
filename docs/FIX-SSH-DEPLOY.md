# Исправление SSH-ошибки деплоя

## Типичные ошибки

| Ошибка | Причина |
|--------|---------|
| `ssh.ParsePrivateKey: ssh: no key found` | Секрет VM_SSH_KEY пустой, обрезан или скопирован с ошибкой |
| `ssh: unable to authenticate, attempted methods [none]` | Публичный ключ не добавлен на VM или не совпадает с приватным |

## Причина
GitHub Actions не может подключиться к VM — неверный или отсутствующий SSH-ключ.

## Решение

### 1. Проверить ключ на VM

На своей машине (где есть доступ к VM):

```bash
# Тест подключения
ssh -i ~/.ssh/handyseller-deploy ubuntu@51.250.119.224 "echo OK"
```

Если `OK` — ключ рабочий. Если ошибка — ключ не подходит к VM.

### 2. Добавить ключ в GitHub Secrets

**Важно:** `VM_SSH_KEY` должен содержать ключ в **base64** (из‑за потери переводов строк в GitHub Secrets):

```bash
# На Mac/Linux — скопировать в буфер
cat ~/.ssh/yandex_vm | base64 | pbcopy   # Mac
cat ~/.ssh/yandex_vm | base64 | xclip     # Linux
```

Вставьте результат в GitHub Secrets → VM_SSH_KEY (одна длинная строка).

### 3. Настройка в GitHub

1. Откройте: https://github.com/djmasjx-cyber/handyseller/settings/secrets/actions
2. Проверьте/создайте секреты:
   - **VM_HOST** = `51.250.119.224` — только IP, без пробелов и переносов
   - **VM_SSH_KEY** = содержимое приватного ключа (полный текст, с BEGIN/END)
   - **VM_USER** = `ubuntu` (опционально)

   **Важно для VM_HOST:** если ошибка "no such host" — удалите секрет и создайте заново, вставив только IP.

### 4. Частые ошибки

| Ошибка | Решение |
|--------|---------|
| Лишние пробелы/переносы | Копировать ключ целиком, без лишних символов |
| Пароль на ключе | Используйте ключ без пароля или создайте новый |
| Ключ не на VM | Добавьте `yandex_vm.pub` в `~/.ssh/authorized_keys` на VM |

### 5. Добавить публичный ключ на VM

Если ключ новый или VM переустановлена:

```bash
# С локальной машины
ssh-copy-id -i ~/.ssh/handyseller-deploy.pub ubuntu@51.250.119.224
```

Или вручную:
```bash
# На VM
echo "содержимое_публичного_ключа" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 6. Перезапустить workflow

После исправления секретов: Actions → Build and Deploy → Re-run jobs

---

## Замена ключа (если «no key found» или ключ утерян)

Если `VM_SSH_KEY` не парсится или ключ не подходит — сгенерируйте новую пару и замените публичный ключ на VM:

```bash
bash scripts/generate-deploy-key.sh
```

Скрипт выведет:
1. **Публичный ключ** — добавьте в метаданные VM (Yandex Cloud → VM → Метаданные → ssh-keys: `ubuntu:ssh-ed25519 AAAA...`)
2. **Приватный ключ** — вставьте в GitHub Secrets → VM_SSH_KEY (полностью, с BEGIN/END)

**Важно для VM_SSH_KEY:** копируйте ключ без лишних пробелов в начале/конце, с переводом строки после `-----END OPENSSH PRIVATE KEY-----`.
