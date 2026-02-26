# SSH-ключи в метаданных Yandex Cloud — как это работает

## Выводы из документации

### 1. Только ключ `ssh-keys` используется для SSH

В публичных образах Linux обрабатываются только определённые метаданные. Для SSH — **только** `ssh-keys`:

- `ssh-keys` — доставка публичного ключа в VM
- `serial-port-enable`, `enable-oslogin`, `user-data` — другие служебные ключи

**Отдельные пары** (например, `undefined`, `ssh-key-2` и т.п.) **не используются** для SSH. Образ их игнорирует.

### 2. Формат `ssh-keys`

```
username:ssh-ed25519 AAAAC3... comment
```

Пример: `ubuntu:ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA... handyseller-deploy`

### 3. Несколько ключей

По документации: *"If you specify multiple keys, only the first one will be used"* — при нескольких ключах используется только первый.

Для нескольких ключей нужно указывать их в **одном** значении `ssh-keys`, через перевод строки:

```
ubuntu:ssh-rsa AAAAB3... key1
ubuntu:ssh-ed25519 AAAAC3... key2
```

### 4. Команда `yc add-metadata`

`yc compute instance add-metadata` использует **upsert**: если ключ есть — обновляет, если нет — добавляет.

При вызове:

```bash
yc compute instance add-metadata handyseller-vm --metadata "ssh-keys=ubuntu:ssh-ed25519..."
```

происходит **обновление** существующей пары `ssh-keys`, а не создание новой. Старое значение заменяется новым.

### 5. Пара с `undefined`

Если в консоли есть пара с ключом `undefined` и значением с SSH-ключом — она **не влияет** на SSH. Образ обрабатывает только `ssh-keys`.

Её можно удалить или оставить — на подключение по SSH это не влияет.

## Рекомендация

Чтобы добавить новый SSH-ключ, не теряя старый:

1. Получить текущее значение: `yc compute instance get handyseller-vm --format json | jq -r '.metadata["ssh-keys"]'`
2. Добавить новую строку в том же формате `ubuntu:ключ`
3. Обновить метаданные с обоими ключами:

```bash
yc compute instance add-metadata handyseller-vm --metadata "ssh-keys=ubuntu:старый_ключ
ubuntu:новый_ключ"
```

(в одну строку с `\n`: `"ssh-keys=ubuntu:key1\nubuntu:key2"`)

4. Перезагрузить VM.

## Источники

- [Keys processed in public images](https://cloud.yandex.ru/docs/compute/concepts/metadata/public-image-keys)
- [yc compute instance add-metadata](https://cloud.yandex.ru/docs/cli/cli-ref/compute/cli-ref/instance/add-metadata)
- [UpdateMetadata API](https://cloud.yandex.ru/docs/compute/api-ref/Instance/updateMetadata)
