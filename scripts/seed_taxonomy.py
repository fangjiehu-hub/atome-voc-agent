"""Seed the taxonomy_categories and taxonomy_sub_issues tables."""

import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select
from backend.database import async_session
from backend.models.taxonomy import TaxonomyCategory, TaxonomySubIssue

CATEGORIES = [
    {"key": "fraud", "label": "Fraud / Scam", "description": "Scam allegations, unauthorized transactions, account takeover", "color": "#DC2626", "sort_order": 0},
    {"key": "transaction", "label": "Transaction", "description": "Payment processing failures, GCash/bank transfer issues, declined transactions", "color": "#F97316", "sort_order": 1},
    {"key": "refund", "label": "Refund", "description": "Refund requests, cancellation disputes, merchant refund problems", "color": "#F59E0B", "sort_order": 2},
    {"key": "spend_limit", "label": "Spend Limit", "description": "Credit limit complaints, spending limit too low/high, limit changes", "color": "#EAB308", "sort_order": 3},
    {"key": "account", "label": "Account", "description": "Account access, login issues, KYC verification, account locked", "color": "#84CC16", "sort_order": 4},
    {"key": "security", "label": "Security", "description": "Security concerns, data privacy, 2FA issues", "color": "#EF4444", "sort_order": 5},
    {"key": "app_bug", "label": "App Bug", "description": "App crashes, glitches, performance issues, UX problems", "color": "#8B5CF6", "sort_order": 6},
    {"key": "customer_service", "label": "Customer Service", "description": "CS response quality, wait times, unhelpful agents", "color": "#06B6D4", "sort_order": 7},
    {"key": "debt_collection", "label": "Debt Collection", "description": "Collection harassment, aggressive tone, threats, unfair practices", "color": "#E11D48", "sort_order": 8},
    {"key": "interest_rate", "label": "Interest Rate", "description": "Interest/fee complaints, hidden charges, late fees, billing disputes", "color": "#F97316", "sort_order": 9},
    {"key": "not_negative", "label": "General Mentions", "description": "Positive, neutral, or irrelevant mention", "color": "#9CA3AF", "sort_order": 10},
]

SUB_ISSUES = [
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


async def seed():
    async with async_session() as db:
        # Seed categories
        for cat in CATEGORIES:
            existing = (
                await db.execute(
                    select(TaxonomyCategory).where(TaxonomyCategory.key == cat["key"])
                )
            ).scalar_one_or_none()
            if not existing:
                db.add(TaxonomyCategory(**cat))
                print(f"  + Category: {cat['key']}")

        # Seed sub-issues
        for si in SUB_ISSUES:
            existing = (
                await db.execute(
                    select(TaxonomySubIssue).where(TaxonomySubIssue.key == si["key"])
                )
            ).scalar_one_or_none()
            if not existing:
                db.add(TaxonomySubIssue(**si))
                print(f"  + Sub-issue: {si['key']}")

        await db.commit()
        print("Taxonomy seeding complete.")


if __name__ == "__main__":
    asyncio.run(seed())
