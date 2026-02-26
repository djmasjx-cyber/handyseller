#!/bin/bash
# Подготовка проекта к push в GitHub и настройка CI
# Запуск: bash scripts/setup-github.sh
#
# Перед запуском: создайте репозиторий на GitHub (github.com/new)
# Или используйте gh: gh auth login && gh repo create

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Проверка .gitignore (секреты не должны попасть в репо)..."
if git check-ignore -q .env.secrets 2>/dev/null; then
  echo "    .env.secrets в .gitignore — OK"
else
  echo "    ВНИМАНИЕ: .env.secrets не в .gitignore!"
  exit 1
fi

echo "==> Добавление файлов..."
git add -A
git reset HEAD .env.secrets 2>/dev/null || true
git status

echo ""
echo "==> Коммит..."
if git diff --cached --quiet 2>/dev/null; then
  echo "    Нет изменений для коммита."
else
  git commit -m "feat: CI/CD via GitHub Actions, Docker Compose prod, Managed PostgreSQL"
fi

echo ""
echo "==> GitHub remote..."
if git remote get-url origin 2>/dev/null; then
  echo "    Remote origin уже задан."
else
  echo "    Remote origin не задан. Добавьте вручную:"
  echo "    git remote add origin https://github.com/YOUR_USER/handyseller.git"
  echo "    или"
  echo "    gh repo create --source=. --remote=origin --push"
fi

echo ""
echo "==> Если репозиторий уже создан на GitHub — push:"
echo "    git push -u origin main"
echo ""
echo "==> Секреты в GitHub (Settings → Secrets → Actions):"
echo "    VM_HOST     = IP вашей VM"
echo "    VM_SSH_KEY  = содержимое ~/.ssh/yandex_vm"
echo "    VM_USER     = ubuntu"
echo ""
echo "Готово."
