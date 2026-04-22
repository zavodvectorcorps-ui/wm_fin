from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone


class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: Literal["owner", "accountant", "manager", "superadmin"] = "owner"


class UserLogin(BaseModel):
    email: str
    password: str


class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    role: str
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


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


class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    date: str
    type: Literal["income", "expense", "transfer"]
    amount: float
    amount_base: Optional[float] = None  # amount in source account's currency
    to_amount_base: Optional[float] = None  # amount in target account's currency (for transfers)
    currency: Literal["PLN", "EUR", "USD"] = "PLN"
    exchange_rate: Optional[float] = None  # rate used for conversion
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    direction_id: str
    direction_name: Optional[str] = None
    account_id: str
    account_name: Optional[str] = None
    to_account_id: Optional[str] = None
    to_account_name: Optional[str] = None
    contractor_id: Optional[str] = None
    contractor_name: Optional[str] = None
    project_id: Optional[str] = None
    source: Literal["manual", "import", "telegram_bot", "telegram_cash", "cash_import", "adesk_migration"] = "manual"
    description: Optional[str] = None
    status: Literal["fact", "plan"] = "fact"
    is_recurring: bool = False
    needs_review: bool = False
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


class BotTransactionRequest(BaseModel):
    text: str
    user_token: str
    date: Optional[str] = None


class Document(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    document_date: Optional[str] = None
    type: Literal["invoice", "bank_statement", "payment_order", "act", "contract", "receipt", "other"] = "other"
    file_name: str
    file_url: str
    file_size: int = 0
    mime_type: str = ""
    transaction_id: Optional[str] = None
    contractor_id: Optional[str] = None
    contractor_name: Optional[str] = None
    direction_id: Optional[str] = None
    direction_name: Optional[str] = None
    folder_id: Optional[str] = None
    period: Optional[str] = None
    status: Literal["linked", "pending", "processed"] = "pending"
    source: Literal["manual", "email", "telegram_bot"] = "manual"
    description: Optional[str] = None
    user_id: str = ""


class DocumentCreate(BaseModel):
    document_date: Optional[str] = None
    type: Literal["invoice", "bank_statement", "payment_order", "act", "contract", "receipt", "other"] = "other"
    transaction_id: Optional[str] = None
    contractor_id: Optional[str] = None
    direction_id: Optional[str] = None
    folder_id: Optional[str] = None
    period: Optional[str] = None
    description: Optional[str] = None


class DocumentFolder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    parent_id: Optional[str] = None
    color: str = "#6366f1"
    user_id: str = ""
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    type: Literal["overdue_payment", "low_balance", "uncategorized_import", "document_pending"] = "overdue_payment"
    title: str
    message: str
    is_read: bool = False
    link: Optional[str] = None
    user_id: str = ""


class AdeskMigrationDraft(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    adesk_id: str
    date: str
    type: Literal["income", "expense", "transfer"]
    amount: float
    currency: str = "PLN"
    category_adesk: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    project_adesk: Optional[str] = None
    direction_id: Optional[str] = None
    direction_name: Optional[str] = None
    contractor_adesk: Optional[str] = None
    contractor_id: Optional[str] = None
    contractor_name: Optional[str] = None
    account_adesk: Optional[str] = None
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    description: Optional[str] = None
    status: Literal["ready", "needs_review", "error", "imported"] = "needs_review"
    error_reason: Optional[str] = None
    user_id: str = ""
    batch_id: str = ""


class AdeskConnectionTest(BaseModel):
    api_token: str


class AdeskMigrationStart(BaseModel):
    api_token: str
    date_from: str
    date_to: str
    migrate_transactions: bool = True
    migrate_contractors: bool = True
    migrate_projects: bool = True
    migrate_accounts: bool = True
    migrate_planned: bool = False


class AdeskDraftUpdate(BaseModel):
    category_id: Optional[str] = None
    direction_id: Optional[str] = None
    contractor_id: Optional[str] = None
    account_id: Optional[str] = None
    description: Optional[str] = None


class AdeskBulkUpdate(BaseModel):
    draft_ids: List[str]
    category_id: Optional[str] = None
    direction_id: Optional[str] = None
    contractor_id: Optional[str] = None
    account_id: Optional[str] = None


class IntegrationSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str = ""
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_auto_summary: bool = False
    telegram_summary_schedule: Literal["daily", "weekly", "monday", "friday"] = "weekly"
    telegram_summary_time: str = "09:00"
    adesk_api_token: Optional[str] = None
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class TelegramSettingsUpdate(BaseModel):
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_auto_summary: Optional[bool] = None
    telegram_summary_schedule: Optional[Literal["daily", "weekly", "monday", "friday"]] = None
    telegram_summary_time: Optional[str] = None


class TelegramTestMessage(BaseModel):
    bot_token: Optional[str] = None
    chat_id: Optional[str] = None


class AdminUserCreate(BaseModel):
    email: str
    password: str
    name: str
    role: Literal["owner", "accountant", "manager"] = "owner"


class AdminUserUpdate(BaseModel):
    email: Optional[str] = None
    password: Optional[str] = None
    name: Optional[str] = None
    role: Optional[Literal["owner", "accountant", "manager"]] = None
