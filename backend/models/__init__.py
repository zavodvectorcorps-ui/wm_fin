"""
WM Finance - Pydantic Models
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Literal, List
import uuid
from datetime import datetime, timezone

# Superadmin credentials
SUPERADMIN_LOGIN = "admin"
SUPERADMIN_PASSWORD = "220066mm"
SUPERADMIN_ID = "superadmin-wmfinance-001"

# ============== USER MODELS ==============

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: Literal["owner", "accountant", "manager", "superadmin"] = "owner"

class UserLogin(BaseModel):
    email: str  # Can be email or login for superadmin
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    role: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AdminUserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: Literal["owner", "accountant", "manager"] = "owner"

class AdminUserUpdate(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    role: Optional[Literal["owner", "accountant", "manager"]] = None
    password: Optional[str] = None

# ============== ACCOUNT MODELS ==============

class Account(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: Literal["checking", "cash", "card", "savings"]
    currency: Literal["PLN", "EUR", "USD"] = "PLN"
    bank: Optional[str] = None
    initial_balance: float = 0
    current_balance: float = 0
    is_active: bool = True
    user_id: str = ""

class AccountCreate(BaseModel):
    name: str
    type: Literal["checking", "cash", "card", "savings"]
    currency: Literal["PLN", "EUR", "USD"] = "PLN"
    bank: Optional[str] = None
    initial_balance: float = 0

# ============== CATEGORY MODELS ==============

class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: Literal["income", "expense"]
    group: str
    default_direction: Optional[str] = None
    is_active: bool = True
    user_id: str = ""

class CategoryCreate(BaseModel):
    name: str
    type: Literal["income", "expense"]
    group: str
    default_direction: Optional[str] = None

# ============== DIRECTION MODELS ==============

class BusinessDirection(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str
    description: Optional[str] = None
    is_active: bool = True
    user_id: str = ""

class DirectionCreate(BaseModel):
    name: str
    color: str
    description: Optional[str] = None

# ============== CONTRACTOR MODELS ==============

class Contractor(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: Literal["client", "supplier", "employee", "other"]
    group: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    comment: Optional[str] = None
    is_active: bool = True
    user_id: str = ""

class ContractorCreate(BaseModel):
    name: str
    type: Literal["client", "supplier", "employee", "other"]
    group: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    comment: Optional[str] = None

# ============== TRANSACTION MODELS ==============

class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    date: str
    type: Literal["income", "expense", "transfer"]
    amount: float
    currency: Literal["PLN", "EUR", "USD"] = "PLN"
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    direction_id: str
    direction_name: Optional[str] = None
    account_id: str
    account_name: Optional[str] = None
    to_account_id: Optional[str] = None
    contractor_id: Optional[str] = None
    contractor_name: Optional[str] = None
    project_id: Optional[str] = None
    source: Literal["manual", "import", "telegram_bot"] = "manual"
    description: Optional[str] = None
    status: Literal["fact", "plan"] = "fact"
    is_recurring: bool = False
    balance_after: float = 0
    user_id: str = ""

class TransactionCreate(BaseModel):
    date: str
    type: Literal["income", "expense", "transfer"]
    amount: float
    currency: Literal["PLN", "EUR", "USD"] = "PLN"
    category_id: Optional[str] = None
    direction_id: str
    account_id: str
    to_account_id: Optional[str] = None
    contractor_id: Optional[str] = None
    project_id: Optional[str] = None
    description: Optional[str] = None
    status: Literal["fact", "plan"] = "fact"
    is_recurring: bool = False

# ============== PLANNED PAYMENT MODELS ==============

class PlannedPayment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    type: Literal["income", "expense"]
    amount: float
    currency: Literal["PLN", "EUR", "USD"] = "PLN"
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    contractor_id: Optional[str] = None
    contractor_name: Optional[str] = None
    direction_id: str
    direction_name: Optional[str] = None
    account_id: str
    account_name: Optional[str] = None
    status: Literal["pending", "paid", "overdue", "postponed", "cancelled"] = "pending"
    recurrence: Literal["none", "weekly", "monthly", "quarterly"] = "none"
    comment: Optional[str] = None
    linked_transaction_id: Optional[str] = None
    user_id: str = ""

class PlannedPaymentCreate(BaseModel):
    date: str
    type: Literal["income", "expense"]
    amount: float
    currency: Literal["PLN", "EUR", "USD"] = "PLN"
    category_id: Optional[str] = None
    contractor_id: Optional[str] = None
    direction_id: str
    account_id: str
    recurrence: Literal["none", "weekly", "monthly", "quarterly"] = "none"
    comment: Optional[str] = None

# ============== PROJECT MODELS ==============

class Project(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    direction_id: str
    direction_name: Optional[str] = None
    contractor_id: Optional[str] = None
    contractor_name: Optional[str] = None
    planned_amount: float = 0
    actual_amount: float = 0
    status: Literal["active", "completed", "cancelled"] = "active"
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    comment: Optional[str] = None
    user_id: str = ""

class ProjectCreate(BaseModel):
    name: str
    direction_id: str
    contractor_id: Optional[str] = None
    planned_amount: float = 0
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    comment: Optional[str] = None

# ============== AUTO RULE MODELS ==============

class AutoRule(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    pattern: str
    category_id: Optional[str] = None
    direction_id: Optional[str] = None
    contractor_id: Optional[str] = None
    is_active: bool = True
    user_id: str = ""

class AutoRuleCreate(BaseModel):
    pattern: str
    category_id: Optional[str] = None
    direction_id: Optional[str] = None
    contractor_id: Optional[str] = None

# ============== BOT MODELS ==============

class BotTransactionRequest(BaseModel):
    text: str
    user_token: str
    date: Optional[str] = None

# ============== DOCUMENT MODELS ==============

class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    filename: str
    original_filename: str
    path: str
    size: int
    mime_type: str
    transaction_id: Optional[str] = None
    uploaded_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    user_id: str = ""

class DocumentLinkRequest(BaseModel):
    document_id: str

# ============== ADESK MIGRATION MODELS ==============

class AdeskConnectionTest(BaseModel):
    api_token: str

class AdeskMigrationStart(BaseModel):
    api_token: str
    date_from: Optional[str] = None
    date_to: Optional[str] = None

class AdeskDraftUpdate(BaseModel):
    direction_id: Optional[str] = None
    category_id: Optional[str] = None
    contractor_id: Optional[str] = None
    account_id: Optional[str] = None
    status: Optional[Literal["pending", "ready", "conflict", "duplicate", "imported"]] = None

class AdeskBulkUpdate(BaseModel):
    draft_ids: List[str]
    updates: AdeskDraftUpdate

# ============== INTEGRATION SETTINGS MODELS ==============

class IntegrationSettingsUpdate(BaseModel):
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_auto_summary: Optional[bool] = None
    telegram_summary_schedule: Optional[Literal["daily", "weekly", "monday", "friday"]] = None
    telegram_summary_time: Optional[str] = None
    adesk_api_token: Optional[str] = None

class TelegramTestRequest(BaseModel):
    bot_token: str
    chat_id: str

# ============== NOTIFICATION MODEL ==============

class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str
    message: str
    is_read: bool = False
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    user_id: str = ""
