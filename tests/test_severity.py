"""Tests for the severity calculator."""

from backend.services.severity_calculator import apply_severity_overrides


def test_viral_content_is_critical():
    result = apply_severity_overrides(
        llm_severity="medium",
        category="transaction",
        engagement_likes=1500,
    )
    assert result == "critical"


def test_high_risk_category_floor():
    result = apply_severity_overrides(
        llm_severity="low",
        category="debt_collection",
    )
    assert result == "medium"


def test_fraud_category_floor():
    result = apply_severity_overrides(
        llm_severity="none",
        category="fraud",
    )
    assert result == "medium"


def test_medium_risk_category_floor():
    result = apply_severity_overrides(
        llm_severity="none",
        category="interest_rate",
    )
    assert result == "low"


def test_cluster_recurrence_override():
    result = apply_severity_overrides(
        llm_severity="low",
        category="app_bug",
        cluster_post_count=15,
    )
    assert result == "high"


def test_high_engagement_floor():
    result = apply_severity_overrides(
        llm_severity="low",
        category="customer_service",
        engagement_likes=600,
    )
    assert result == "high"


def test_no_override_needed():
    result = apply_severity_overrides(
        llm_severity="medium",
        category="app_bug",
        engagement_likes=10,
    )
    assert result == "medium"


def test_llm_severity_preserved_when_higher():
    result = apply_severity_overrides(
        llm_severity="critical",
        category="not_negative",
    )
    assert result == "critical"
