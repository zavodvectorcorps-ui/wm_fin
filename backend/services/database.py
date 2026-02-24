"""
WM Finance - Database Service
"""
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
db_name = os.environ.get('DB_NAME', 'wmfinance')

client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

# Collections
users_collection = db.users
accounts_collection = db.accounts
categories_collection = db.categories
directions_collection = db.directions
contractors_collection = db.contractors
transactions_collection = db.transactions
planned_payments_collection = db.planned_payments
projects_collection = db.projects
auto_rules_collection = db.auto_rules
documents_collection = db.documents
notifications_collection = db.notifications
integration_settings_collection = db.integration_settings
adesk_drafts_collection = db.adesk_migration_drafts
