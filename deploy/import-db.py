#!/usr/bin/env python3
"""
WM Finance — Импорт базы данных на новый сервер.

Запустите на VPS после распаковки архива:
  tar xzf wmfinance-db-export.tar.gz
  python3 import-db.py
"""

import json
import os
from bson import ObjectId
from datetime import datetime

MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
DB_NAME = os.environ.get('DB_NAME', 'wmfinance')
IMPORT_DIR = './wmfinance-db-export'


def restore_types(obj):
    """Restore MongoDB types from JSON export."""
    if isinstance(obj, dict):
        if '$oid' in obj:
            return ObjectId(obj['$oid'])
        if '$date' in obj:
            try:
                return datetime.fromisoformat(obj['$date'].replace('Z', '+00:00'))
            except:
                return obj['$date']
        return {k: restore_types(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [restore_types(item) for item in obj]
    return obj


def main():
    from pymongo import MongoClient
    
    client = MongoClient(MONGO_URL)
    db = client[DB_NAME]
    
    if not os.path.isdir(IMPORT_DIR):
        print(f"Папка {IMPORT_DIR} не найдена!")
        print(f"Распакуйте архив: tar xzf wmfinance-db-export.tar.gz")
        return
    
    files = sorted([f for f in os.listdir(IMPORT_DIR) if f.endswith('.json')])
    print(f"Импорт в базу: {DB_NAME}")
    print(f"Файлов: {len(files)}")
    print(f"{'='*50}")
    
    total = 0
    for fname in files:
        col_name = fname.replace('.json', '')
        path = os.path.join(IMPORT_DIR, fname)
        
        with open(path, 'r', encoding='utf-8') as f:
            docs = json.load(f)
        
        if not docs:
            print(f"  {col_name}: пусто, пропускаю")
            continue
        
        # Restore BSON types
        docs = [restore_types(d) for d in docs]
        
        # Drop and re-insert
        db[col_name].drop()
        db[col_name].insert_many(docs)
        total += len(docs)
        print(f"  {col_name}: {len(docs)} документов ✓")
    
    print(f"{'='*50}")
    print(f"Импортировано: {total} документов")
    print(f"Готово!")


if __name__ == '__main__':
    main()
