#!/bin/bash
# WM Finance — деплой/обновление на VPS одной командой.
#
# Использование:
#   cd /root/wm-finance && ./deploy.sh
#
# Что делает:
#   1. Подтягивает свежий код из GitHub
#   2. Копирует Dockerfile/compose в корень
#   3. Пересобирает образы
#   4. Перезапускает контейнеры
#   5. Восстанавливает совместный nginx.conf (для menu_rest2-nginx)
#      и делает reload — на случай если nginx.conf был перезаписан
#      деплоем второго проекта.

set -e

PROJECT_DIR="/root/wm-finance"
MENU_REST2_NGINX_CONF="/root/Menu_rest2/nginx/nginx.conf"
COMBINED_NGINX_CONF="$PROJECT_DIR/deploy/menu_rest2-nginx-combined.conf"

cd "$PROJECT_DIR"

echo "==> [1/6] git pull origin main"
git pull origin main

echo "==> [2/6] copying Dockerfiles & compose"
cp deploy/docker-compose.yml ./docker-compose.yml
cp deploy/backend.Dockerfile ./backend.Dockerfile
cp deploy/frontend.Dockerfile ./frontend.Dockerfile
cp deploy/nginx-spa.conf ./frontend/nginx-spa.conf 2>/dev/null || cp deploy/nginx-spa.conf ./nginx-spa.conf

echo "==> [3/6] docker compose build"
docker compose build wmfinance-backend wmfinance-frontend

echo "==> [4/6] docker compose up -d --force-recreate"
docker compose up -d --force-recreate wmfinance-backend wmfinance-frontend

echo "==> [5/6] sync shared nginx config (menu_rest2 + wm-finance)"
if [ -f "$MENU_REST2_NGINX_CONF" ] && [ -f "$COMBINED_NGINX_CONF" ]; then
    if ! diff -q "$MENU_REST2_NGINX_CONF" "$COMBINED_NGINX_CONF" >/dev/null 2>&1; then
        echo "    nginx config differs — restoring combined version"
        cp "$COMBINED_NGINX_CONF" "$MENU_REST2_NGINX_CONF"
        if docker exec menu_rest2-nginx-1 nginx -t >/dev/null 2>&1; then
            docker exec menu_rest2-nginx-1 nginx -s reload
            echo "    nginx reloaded"
        else
            echo "    ⚠️  nginx config test failed — оставлен старый"
        fi
    else
        echo "    nginx config already up to date"
    fi
else
    echo "    skipped (Menu_rest2 nginx not found)"
fi

echo "==> [6/6] status"
docker compose ps

echo ""
echo "✅ Deploy complete."
echo "   Логи бэкенда:  docker compose logs -f wmfinance-backend"
echo "   Логи фронта:   docker compose logs -f wmfinance-frontend"
