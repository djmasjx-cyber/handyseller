#!/bin/bash
# Устанавливает pre-commit hook для блокировки dist/
# Запуск: bash scripts/install-git-hooks.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
HOOK_SRC="$SCRIPT_DIR/git-hooks/pre-commit"
HOOK_DST="$REPO_DIR/.git/hooks/pre-commit"

cp "$HOOK_SRC" "$HOOK_DST"
chmod +x "$HOOK_DST"
echo "✅ Pre-commit hook установлен: $HOOK_DST"
