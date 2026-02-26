#!/usr/bin/env bash
# Запуск деплоя одной командой из корня проекта.
# Выполнить в терминале:  bash scripts/run-deploy.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export DOCKER_BUILDKIT=0
[ -z "$DEPLOY_SSH_KEY" ] && [ -f "$HOME/.ssh/yandex_vm" ] && export DEPLOY_SSH_KEY="$HOME/.ssh/yandex_vm"
echo "==> Деплой из $ROOT"
exec bash "$ROOT/scripts/full-deploy.sh"
