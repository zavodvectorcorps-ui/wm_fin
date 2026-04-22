#!/usr/bin/env python3
"""
WM Finance — Экспорт продакшн базы данных.

Запустите этот скрипт на сервере, где работает продакшн MongoDB.
Результат: /tmp/wmfinance-db-export.tar.gz — архив со всеми коллекциями.
"""

import json
import os
import tarfile
from datetime import datetime
from bson import ObjectId

# ========== НАСТРОЙКИ ==========
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'test_database')
EXPORT_DIR = '/tmp/wmfinance-db-export'
ARCHIVE_PATH = '/tmp/wmfinance-db-export.tar.gz'
# ===============================

class MongoEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return {"$oid": str(obj)}
        if isinstance(obj, datetime):
            return {"$date": obj.isoformat()}
        return super().default(obj)


def main():
    from pymongo import MongoClient
    
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    
    # Clean previous export
    os.makedirs(EXPORT_DIR, exist_ok=True)
    for f in os.listdir(EXPORT_DIR):
        os.remove(os.path.join(EXPORT_DIR, f))
    
    collections = db.list_collection_names()
    print(f"База: {DB_NAME}")
    print(f"Коллекции: {len(collections)}")
    print(f"{'='*50}")
    
    total_docs = 0
    for col_name in sorted(collections):
        docs = list(db[col_name].find())
        count = len(docs)
        total_docs += count
        
        path = os.path.join(EXPORT_DIR, f'{col_name}.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(docs, f, cls=MongoEncoder, ensure_ascii=False)
        
        print(f"  {col_name}: {count} документов")
    
    print(f"{'='*50}")
    print(f"Всего: {total_docs} документов")
    
    # Create tar.gz archive
    with tarfile.open(ARCHIVE_PATH, 'w:gz') as tar:
        tar.add(EXPORT_DIR, arcname='wmfinance-db-export')
    
    size = os.path.getsize(ARCHIVE_PATH)
    print(f"\nАрхив: {ARCHIVE_PATH}")
    print(f"Размер: {size / 1024:.1f} KB")
    print(f"\nСкачайте архив и перенесите на VPS.")


if __name__ == '__main__':
    main()
