"""Unit tests for backend.services.engagement_calculator (pure functions, no DB)."""

import pytest

from backend.services.engagement_calculator import (
    LEVEL_HIGH,
    LEVEL_LOW,
    LEVEL_MEDIUM,
    engagement_level,
    engagement_score,
    is_sensitive_text,
    legacy_severity,
    routing_for,
    should_escalate,
)


# ── engagement_score ─────────────────────────────────────────────────────


def test_engagement_score_sums_all_four():
    assert engagement_score(likes=10, replies=5, reposts=3, comments=2) == 20


def test_engagement_score_handles_none():
    # Real-world: some fields nullable in DB → engagement_score must not crash
    assert engagement_score(likes=None, replies=None, reposts=None, comments=None) == 0
    assert engagement_score(likes=10) == 10  # missing args default to 0


def test_engagement_score_zero():
    assert engagement_score() == 0


# ── engagement_level ─────────────────────────────────────────────────────


def test_engagement_level_default_thresholds():
    """Default lowMax=20, mediumMax=100."""
    assert engagement_level(0) == LEVEL_LOW
    assert engagement_level(20) == LEVEL_LOW
    assert engagement_level(21) == LEVEL_MEDIUM
    assert engagement_level(100) == LEVEL_MEDIUM
    assert engagement_level(101) == LEVEL_HIGH
    assert engagement_level(10_000) == LEVEL_HIGH


def test_engagement_level_custom_thresholds():
    t = {"lowMax": 5, "mediumMax": 50}
    assert engagement_level(5, t) == LEVEL_LOW
    assert engagement_level(6, t) == LEVEL_MEDIUM
    assert engagement_level(50, t) == LEVEL_MEDIUM
    assert engagement_level(51, t) == LEVEL_HIGH


def test_engagement_level_missing_threshold_keys():
    """Empty/partial dicts shouldn't crash — fall back to defaults."""
    assert engagement_level(50, {}) in (LEVEL_LOW, LEVEL_MEDIUM, LEVEL_HIGH)
    assert engagement_level(50, {"lowMax": 10}) == LEVEL_MEDIUM


# ── is_sensitive_text — the bug we fixed ─────────────────────────────────


def test_is_sensitive_text_word_boundary_match():
    kws = ["fraud", "scam"]
    assert is_sensitive_text("This is a fraud case", kws) is True
    assert is_sensitive_text("Got scammed yesterday", kws) is False  # "scam" boundary doesn't match "scammed"
    assert is_sensitive_text("FRAUD warning", kws) is True  # case-insensitive


def test_is_sensitive_text_no_false_substring():
    """The fix: 'defraud' must NOT match keyword 'fraud'.

    Before the fix, this returned True because we did `kw in text` substring match.
    """
    kws = ["fraud"]
    assert is_sensitive_text("defraud is bad", kws) is False
    assert is_sensitive_text("antifraud measures", kws) is False


def test_is_sensitive_text_empty_inputs():
    assert is_sensitive_text("", ["fraud"]) is False
    assert is_sensitive_text(None, ["fraud"]) is False
    assert is_sensitive_text("anything", []) is False
    assert is_sensitive_text("anything", None) is False


def test_is_sensitive_text_multiword_keyword():
    """Regex escapes special characters — 'BSP' as a word should still match."""
    assert is_sensitive_text("regulator BSP order", ["BSP"]) is True
    assert is_sensitive_text("BSPish thing", ["BSP"]) is False


# ── should_escalate ──────────────────────────────────────────────────────


def test_should_escalate_high_level():
    assert should_escalate(level=LEVEL_HIGH, category_escalation_flag=False, sensitive_text_hit=False) is True


def test_should_escalate_category_flag():
    assert should_escalate(level=LEVEL_LOW, category_escalation_flag=True, sensitive_text_hit=False) is True


def test_should_escalate_sensitive_hit():
    assert should_escalate(level=LEVEL_LOW, category_escalation_flag=False, sensitive_text_hit=True) is True


def test_should_escalate_none_of_the_above():
    assert should_escalate(level=LEVEL_MEDIUM, category_escalation_flag=False, sensitive_text_hit=False) is False


# ── routing_for ──────────────────────────────────────────────────────────


def test_routing_for_sensitive_category_ladder():
    """Sensitive cats (Collections/Fraud): Review → Priority Review → Priority Escalation."""
    r = routing_for(owner="Collection", level=LEVEL_LOW, category_escalation_flag=True)
    assert r["action_type"] == "Review"
    assert r["action_label"] == "Collection Review"

    r = routing_for(owner="Collection", level=LEVEL_MEDIUM, category_escalation_flag=True)
    assert r["action_type"] == "Priority Review"

    r = routing_for(owner="Collection", level=LEVEL_HIGH, category_escalation_flag=True)
    assert r["action_type"] == "Priority Escalation"


def test_routing_for_normal_category_ladder():
    """Non-sensitive cats: Monitor → {Owner} Review → {Owner} Priority Review."""
    r = routing_for(owner="Product", level=LEVEL_LOW, category_escalation_flag=False)
    assert r["action_label"] == "Monitor"

    r = routing_for(owner="Product", level=LEVEL_MEDIUM, category_escalation_flag=False)
    assert r["action_label"] == "Product Review"

    r = routing_for(owner="Product", level=LEVEL_HIGH, category_escalation_flag=False)
    assert r["action_label"] == "Product Priority Review"


# ── legacy_severity (backward compat with old severity-based endpoints) ──


def test_legacy_severity_maps_levels():
    assert legacy_severity(LEVEL_LOW, escalate=False) == "low"
    assert legacy_severity(LEVEL_MEDIUM, escalate=False) == "medium"
    assert legacy_severity(LEVEL_HIGH, escalate=False) == "high"


def test_legacy_severity_escalation_bumps():
    # Escalation bumps low→high and high→critical
    assert legacy_severity(LEVEL_LOW, escalate=True) == "high"
    assert legacy_severity(LEVEL_HIGH, escalate=True) == "critical"
