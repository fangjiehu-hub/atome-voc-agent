from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.models.taxonomy import TaxonomyCategory, TaxonomySubIssue

router = APIRouter(prefix="/api/taxonomy", tags=["taxonomy"])

# Default categories to seed when table is empty
DEFAULT_CATEGORIES = [
    {"key": "fraud", "label": "Fraud / Scam", "color": "#DC2626", "sort_order": 0},
    {"key": "transaction", "label": "Transaction", "color": "#F97316", "sort_order": 1},
    {"key": "refund", "label": "Refund", "color": "#F59E0B", "sort_order": 2},
    {"key": "spend_limit", "label": "Spend Limit", "color": "#EAB308", "sort_order": 3},
    {"key": "account", "label": "Account", "color": "#84CC16", "sort_order": 4},
    {"key": "security", "label": "Security", "color": "#EF4444", "sort_order": 5},
    {"key": "app_bug", "label": "App Bug", "color": "#8B5CF6", "sort_order": 6},
    {"key": "customer_service", "label": "Customer Service", "color": "#06B6D4", "sort_order": 7},
    {"key": "debt_collection", "label": "Debt Collection", "color": "#E11D48", "sort_order": 8},
    {"key": "interest_rate", "label": "Interest Rate", "color": "#F97316", "sort_order": 9},
    {"key": "not_negative", "label": "General Mentions", "color": "#9CA3AF", "sort_order": 10},
]

DEFAULT_SUB_ISSUES = [
    {"key": "duplicate_charge", "label": "Duplicate Charge", "category_key": "transaction"},
    {"key": "payment_declined", "label": "Payment Declined", "category_key": "transaction"},
    {"key": "gcash_issue", "label": "GCash Issue", "category_key": "transaction"},
    {"key": "bank_transfer_fail", "label": "Bank Transfer Fail", "category_key": "transaction"},
    {"key": "refund_delayed", "label": "Refund Delayed", "category_key": "refund"},
    {"key": "merchant_dispute", "label": "Merchant Dispute", "category_key": "refund"},
    {"key": "cancellation_denied", "label": "Cancellation Denied", "category_key": "refund"},
    {"key": "limit_too_low", "label": "Limit Too Low", "category_key": "spend_limit"},
    {"key": "limit_reduced", "label": "Limit Reduced", "category_key": "spend_limit"},
    {"key": "limit_increase_denied", "label": "Limit Increase Denied", "category_key": "spend_limit"},
    {"key": "account_locked", "label": "Account Locked", "category_key": "account"},
    {"key": "login_fail", "label": "Login Fail", "category_key": "account"},
    {"key": "kyc_rejected", "label": "KYC Rejected", "category_key": "account"},
    {"key": "app_crash", "label": "App Crash", "category_key": "app_bug"},
    {"key": "slow_loading", "label": "Slow Loading", "category_key": "app_bug"},
    {"key": "ui_confusing", "label": "UI Confusing", "category_key": "app_bug"},
    {"key": "long_wait", "label": "Long Wait", "category_key": "customer_service"},
    {"key": "unhelpful_agent", "label": "Unhelpful Agent", "category_key": "customer_service"},
    {"key": "no_response", "label": "No Response", "category_key": "customer_service"},
    {"key": "harassment", "label": "Harassment", "category_key": "debt_collection"},
    {"key": "threatening_calls", "label": "Threatening Calls", "category_key": "debt_collection"},
    {"key": "excessive_contact", "label": "Excessive Contact", "category_key": "debt_collection"},
    {"key": "hidden_fees", "label": "Hidden Fees", "category_key": "interest_rate"},
    {"key": "overcharged", "label": "Overcharged", "category_key": "interest_rate"},
    {"key": "late_fee_dispute", "label": "Late Fee Dispute", "category_key": "interest_rate"},
    {"key": "unauthorized_transaction", "label": "Unauthorized Transaction", "category_key": "fraud"},
    {"key": "phishing", "label": "Phishing", "category_key": "fraud"},
    {"key": "account_takeover", "label": "Account Takeover", "category_key": "fraud"},
]


# --- Category schemas ---
class CategoryCreate(BaseModel):
    key: str
    label: str
    description: str | None = None
    color: str | None = None
    sort_order: int = 0


class CategoryOut(BaseModel):
    id: int
    key: str
    label: str
    description: str | None
    color: str | None
    sort_order: int
    is_active: bool

    model_config = {"from_attributes": True}


class CategoryUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    color: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


# --- Sub-issue schemas ---
class SubIssueCreate(BaseModel):
    key: str
    label: str
    category_key: str | None = None
    description: str | None = None


class SubIssueOut(BaseModel):
    id: int
    key: str
    label: str
    category_key: str | None
    description: str | None
    is_active: bool

    model_config = {"from_attributes": True}


# --- Category endpoints ---
@router.get("/categories", response_model=list[CategoryOut])
async def list_categories(db: AsyncSession = Depends(get_db)):
    total = (await db.execute(select(func.count()).select_from(TaxonomyCategory))).scalar() or 0

    # Auto-seed defaults if table is empty
    if total == 0:
        for cat_data in DEFAULT_CATEGORIES:
            db.add(TaxonomyCategory(**cat_data))
        await db.commit()

    rows = (
        await db.execute(
            select(TaxonomyCategory).order_by(TaxonomyCategory.sort_order)
        )
    ).scalars().all()
    return [CategoryOut.model_validate(r) for r in rows]


@router.post("/categories", response_model=CategoryOut)
async def create_category(cat: CategoryCreate, db: AsyncSession = Depends(get_db)):
    record = TaxonomyCategory(**cat.model_dump())
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return CategoryOut.model_validate(record)


@router.patch("/categories/{cat_id}", response_model=CategoryOut)
async def update_category(
    cat_id: int, update: CategoryUpdate, db: AsyncSession = Depends(get_db)
):
    cat = (
        await db.execute(select(TaxonomyCategory).where(TaxonomyCategory.id == cat_id))
    ).scalar_one_or_none()
    if not cat:
        raise HTTPException(404, "Category not found")
    for field, value in update.model_dump(exclude_none=True).items():
        setattr(cat, field, value)
    await db.commit()
    await db.refresh(cat)
    return CategoryOut.model_validate(cat)


# --- Sub-issue endpoints ---
@router.get("/sub-issues", response_model=list[SubIssueOut])
async def list_sub_issues(db: AsyncSession = Depends(get_db)):
    total = (await db.execute(select(func.count()).select_from(TaxonomySubIssue))).scalar() or 0

    # Auto-seed defaults if table is empty
    if total == 0:
        for si_data in DEFAULT_SUB_ISSUES:
            db.add(TaxonomySubIssue(**si_data))
        await db.commit()

    rows = (await db.execute(select(TaxonomySubIssue))).scalars().all()
    return [SubIssueOut.model_validate(r) for r in rows]


@router.post("/sub-issues", response_model=SubIssueOut)
async def create_sub_issue(si: SubIssueCreate, db: AsyncSession = Depends(get_db)):
    record = TaxonomySubIssue(**si.model_dump())
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return SubIssueOut.model_validate(record)
