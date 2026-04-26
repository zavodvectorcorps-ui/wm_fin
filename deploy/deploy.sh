#!/bin/bash
# WM Finance — деплой/обновление на VPS одной командой.
#
# Использование:
#   cd /root/wm-finance && ./deploy.sh
#
# Что делает:
#   1. Подтягивает свежий код из GitHub (git pull)
#   2. Копирует Dockerfile/compose из deploy/ в корень (где их ждёт docker compose)
#   3. Пересобирает backend и frontend образы
#   4. Перезапускает контейнеры с force-recreate
#   5. Показывает статус
#
# Скрипт идемпотентен: можно запускать сколько угодно раз.

set -e

PROJECT_DIR="/root/wm-finance"
cd "$PROJECT_DIR"

echo "==> [1/5] git pull origin main"
git pull origin main

echo "==> [2/5] copying Dockerfiles & compose"
cp deploy/docker-compose.yml ./docker-compose.yml
cp deploy/backend.Dockerfile ./backend.Dockerfile
cp deploy/frontend.Dockerfile ./frontend.Dockerfile
cp deploy/nginx-spa.conf ./frontend/nginx-spa.conf 2>/dev/null || cp deploy/nginx-spa.conf ./nginx-spa.conf

echo "==> [3/5] docker compose build"
docker compose build wmfinance-backend wmfinance-frontend

echo "==> [4/5] docker compose up -d --force-recreate"
docker compose up -d --force-recreate wmfinance-backend wmfinance-frontend

echo "==> [5/5] status"
docker compose ps

echo ""
echo "✅ Deploy complete."
echo "   Логи бэкенда:  docker compose logs -f wmfinance-backend"
echo "   Логи фронта:   docker compose logs -f wmfinance-frontend"
