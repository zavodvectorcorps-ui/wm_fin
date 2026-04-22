#!/bin/bash
set -e

echo "=== WM Finance: Экспорт базы данных ==="

# Export from current MongoDB
DB_NAME="test_database"
EXPORT_DIR="/tmp/wmfinance-db-export"

rm -rf "$EXPORT_DIR"
mkdir -p "$EXPORT_DIR"

echo "Экспортирую коллекции..."

# List of all collections
COLLECTIONS=(
  "users"
  "accounts"
  "transactions"
  "directions"
  "categories"
  "contractors"
  "projects"
  "auto_rules"
  "documents"
  "document_folders"
  "planned_payments"
  "integrations"
  "notifications"
  "settings"
)

for col in "${COLLECTIONS[@]}"; do
  echo "  -> $col"
  mongoexport --db="$DB_NAME" --collection="$col" --out="$EXPORT_DIR/$col.json" --jsonArray 2>/dev/null || true
done

# Create archive
cd /tmp
tar czf wmfinance-db-export.tar.gz wmfinance-db-export/
echo ""
echo "=== Архив готов: /tmp/wmfinance-db-export.tar.gz ==="
echo "Размер: $(du -h /tmp/wmfinance-db-export.tar.gz | cut -f1)"
echo ""
echo "Скачайте и перенесите на VPS, затем импортируйте:"
echo "  tar xzf wmfinance-db-export.tar.gz"
echo "  for f in wmfinance-db-export/*.json; do"
echo '    col=$(basename "$f" .json)'
echo '    mongoimport --db=wmfinance --collection="$col" --file="$f" --jsonArray --drop'
echo "  done"
