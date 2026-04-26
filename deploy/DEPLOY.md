# WM Finance — Деплой на VPS

## Структура на сервере

```
/root/wm-finance/
├── docker-compose.yml
├── backend.Dockerfile
├── frontend.Dockerfile
├── nginx-spa.conf
├── backend/           ← код бэкенда
│   ├── server.py
│   ├── requirements.txt
│   ├── .env
│   └── ...
├── frontend/          ← код фронтенда
│   ├── package.json
│   ├── src/
│   └── ...
└── mongo-init/        ← (пустая, для init скриптов)
```

---

## Шаг 1: Подготовка домена

```bash
# DNS: A-запись wm-finance.by → IP вашего VPS

# SSL сертификат
sudo certbot certonly --nginx -d wm-finance.by -d www.wm-finance.by
```

---

## Шаг 2: Скопировать проект на VPS

**Вариант A — через GitHub (рекомендуется):**
```bash
# На VPS:
cd /root
git clone <ваш-репозиторий> wm-finance
cd wm-finance
```

**Вариант B — через scp:**
```bash
# На локальной машине (или из Emergent — "Save to GitHub" → clone):
scp -r /path/to/project root@<VPS_IP>:/root/wm-finance
```

---

## Шаг 3: Скопировать файлы деплоя

```bash
cd /root/wm-finance

# Скопировать Dockerfile и docker-compose в корень проекта
cp deploy/backend.Dockerfile .
cp deploy/frontend.Dockerfile .
cp deploy/nginx-spa.conf .
cp deploy/docker-compose.yml .

# Создать .env для бэкенда
cp deploy/backend.env.example backend/.env

# Создать папку для mongo init
mkdir -p mongo-init
```

---

## Шаг 4: Настроить .env

Отредактируйте `backend/.env`:

```bash
nano backend/.env
```

```env
MONGO_URL=mongodb://wmfinance-mongo:27017
DB_NAME=wmfinance
CORS_ORIGINS=https://wm-finance.by,https://www.wm-finance.by
EMERGENT_LLM_KEY=sk-emergent-62940379d4dCa73EeE
JWT_SECRET=wmfinance_jwt_secret_key_2026_secure
SUPERADMIN_LOGIN=admin
SUPERADMIN_PASSWORD=220066mm
SUPERADMIN_ID=superadmin-wmfinance-001
```

---

## Шаг 5: Настроить домен в docker-compose.yml

Откройте `docker-compose.yml` и проверьте строку:
```yaml
REACT_APP_BACKEND_URL: https://wm-finance.by
```
Замените `wm-finance.by` на ваш реальный домен, если отличается.

---

## Шаг 6: Nginx конфиг

```bash
# Скопировать конфиг в nginx
sudo cp deploy/nginx-wm-finance.conf /etc/nginx/sites-available/wm-finance.conf
sudo ln -sf /etc/nginx/sites-available/wm-finance.conf /etc/nginx/sites-enabled/

# Если nginx в Docker — скопировать в volume/конфиг контейнера
# Путь зависит от вашей конфигурации nginx

# Проверить конфиг
sudo nginx -t

# Перезагрузить
sudo nginx -s reload
```

**Важно:** Если nginx запущен в Docker-контейнере, убедитесь что контейнер nginx подключён к сети `wmfinance-net`. Добавьте в его `docker-compose.yml`:
```yaml
networks:
  - wmfinance-net

# И в секцию networks:
networks:
  wmfinance-net:
    external: true
```

Или используйте `network_mode: host` / общую Docker-сеть.

---

## Шаг 7: Собрать и запустить

```bash
cd /root/wm-finance

# Создать сеть (если nginx в отдельном compose)
docker network create wmfinance-net 2>/dev/null || true

# Собрать и запустить
docker compose up -d --build

# Проверить логи
docker compose logs -f wmfinance-backend
docker compose logs -f wmfinance-frontend
```

---

## Шаг 8: Перенос базы данных

### На текущем сервере (Emergent / продакшен):

```bash
# Экспорт всех коллекций
bash deploy/export-db.sh

# Скачать архив
# Из Emergent: используйте "Download" или scp
scp /tmp/wmfinance-db-export.tar.gz root@<VPS_IP>:/root/wm-finance/
```

### На VPS:

```bash
cd /root/wm-finance

# Распаковать
tar xzf wmfinance-db-export.tar.gz

# Импортировать в MongoDB контейнер
for f in wmfinance-db-export/*.json; do
  col=$(basename "$f" .json)
  echo "Importing $col..."
  docker compose exec -T wmfinance-mongo mongoimport \
    --db=wmfinance \
    --collection="$col" \
    --file="/tmp/$col.json" \
    --jsonArray \
    --drop
done
```

**Или через docker cp:**
```bash
# Скопировать файлы в контейнер
docker cp wmfinance-db-export/ wmfinance-mongo:/tmp/

# Импорт
docker exec wmfinance-mongo bash -c '
  for f in /tmp/wmfinance-db-export/*.json; do
    col=$(basename "$f" .json)
    echo "Importing $col..."
    mongoimport --db=wmfinance --collection="$col" --file="$f" --jsonArray --drop
  done
'
```

---

## Шаг 9: Проверка

```bash
# Backend API
curl -k https://wm-finance.by/api/health

# Frontend
curl -k https://wm-finance.by/ | head -1
# Должно вернуть: <!doctype html>
```

---

## Обновление в будущем (одной командой)

После первого деплоя достаточно запустить:

```bash
cd /root/wm-finance
./deploy.sh
```

Скрипт лежит в репозитории по пути `/app/deploy/deploy.sh` (на VPS — `/root/wm-finance/deploy/deploy.sh`).
Сделайте его исполняемым один раз после `git clone`:

```bash
chmod +x /root/wm-finance/deploy/deploy.sh
ln -sf /root/wm-finance/deploy/deploy.sh /root/wm-finance/deploy.sh
```

После этого обновление = `./deploy.sh` одной командой. Скрипт делает:
1. `git pull origin main`
2. `cp deploy/{docker-compose.yml,backend.Dockerfile,frontend.Dockerfile,nginx-spa.conf}` → корень проекта
3. `docker compose build wmfinance-backend wmfinance-frontend`
4. `docker compose up -d --force-recreate wmfinance-backend wmfinance-frontend`
5. Показывает статус

> **Сборка фронтенда не требует yarn / corepack локально на VPS.**  
> Образ собирается внутри Docker через `npm` (встроен в `node:20-alpine`).
> Если в репозитории нет `yarn.lock` или `package-lock.json` — Dockerfile сам выберет нужный путь:
> `npm ci` если есть lock-файл, иначе `npm install`.

### Если нужно вручную (без скрипта)

```bash
cd /root/wm-finance
git pull origin main
cp deploy/docker-compose.yml ./docker-compose.yml
cp deploy/backend.Dockerfile ./backend.Dockerfile
cp deploy/frontend.Dockerfile ./frontend.Dockerfile
cp deploy/nginx-spa.conf ./frontend/nginx-spa.conf
docker compose build wmfinance-backend wmfinance-frontend
docker compose up -d --force-recreate wmfinance-backend wmfinance-frontend
docker compose ps
```

---

## Полезные команды

```bash
# Статус контейнеров
docker compose ps

# Логи бэкенда
docker compose logs -f wmfinance-backend

# Перезапуск
docker compose restart wmfinance-backend

# Доступ в MongoDB
docker compose exec wmfinance-mongo mongosh wmfinance

# Бэкап БД
docker compose exec wmfinance-mongo mongodump --db=wmfinance --archive=/tmp/backup.gz --gzip
docker cp wmfinance-mongo:/tmp/backup.gz ./backup-$(date +%Y%m%d).gz
```
