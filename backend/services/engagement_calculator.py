"""Engagement-based scoring aligned with Claude Design import.

Replaces the legacy `severity_calculator` rule chain. The design models a single
metric — engagement = likes + replies + reposts + comments — bucketed by
configurable thresholds (Low ≤ lowMax, Medium ≤ mediumMax, High otherwise).

Escalation is a separate boolean flag (no longer baked into severity):
- True if engagement_level == "High"
- True if category's taxonomy.escalation_flag is set (Collections, Fraud)
- True if any sensitive_keyword appears in the mention text
"""
from __future__ import annotations

import re

LEVEL_LOW = "Low"
LEVEL_MEDIUM = "Medium"
LEVEL_HIGH = "High"
LEVEL_ORDER = [LEVEL_LOW, LEVEL_MEDIUM, LEVEL_HIGH]

# Used only as fallback if app_settings hasn't been loaded yet.
DEFAULT_THRESHOLDS = {"lowMax": 20, "mediumMax": 100}
DEFAULT_SENSITIVE_KEYWORDS = ("fraud", "unauthorized", "scam", "phishing", "regulator", "BSP")


def engagement_score(
    likes: int = 0,
    replies: int = 0,
    reposts: int = 0,
    comments: int = 0,
) -> int:
    """engagement = likes + replies + reposts + comments (see design Methodology page)."""
    return (likes or 0) + (replies or 0) + (reposts or 0) + (comments or 0)


def engagement_level(score: int, thresholds: dict | None = None) -> str:
    """Bucket a score into Low/Medium/High using app_settings thresholds."""
    t = thresholds or DEFAULT_THRESHOLDS
    low_max = int(t.get("lowMax", DEFAULT_THRESHOLDS["lowMax"]))
    medium_max = int(t.get("mediumMax", DEFAULT_THRESHOLDS["mediumMax"]))
    if score <= low_max:
        return LEVEL_LOW
    if score <= medium_max:
        return LEVEL_MEDIUM
    return LEVEL_HIGH


def is_sensitive_text(text: str | None, sensitive_keywords: list[str] | tuple[str, ...]) -> bool:
    """True if any keyword (case-insensitive, word-boundary) appears in text.

    Word-boundary matching avoids false positives like "defraud" → "fraud" or
    "phishing" matching "phishingrelated" (made-up but possible).
    """
    if not text or not sensitive_keywords:
        return False
    return any(
        kw and re.search(r"\b" + re.escape(kw) + r"\b", text, re.IGNORECASE)
        for kw in sensitive_keywords
    )


def should_escalate(
    *,
    level: str,
    category_escalation_flag: bool,
    sensitive_text_hit: bool,
) -> bool:
    """The design's escalation rule: high engagement, sensitive category, or sensitive keyword."""
    return level == LEVEL_HIGH or category_escalation_flag or sensitive_text_hit


def routing_for(
    *,
    owner: str,
    level: str,
    category_escalation_flag: bool,
) -> dict:
    """Compute (action_label, action_type) per design's routingFor().

    Sensitive categories (Collections, Fraud) get the Review → Priority Review →
    Priority Escalation ladder. Everything else: Monitor → {Owner} Review →
    {Owner} Priority Review.
    """
    if category_escalation_flag:
        if level == LEVEL_LOW:
            return {"action_type": "Review", "action_label": f"{owner} Review"}
        if level == LEVEL_MEDIUM:
            return {"action_type": "Priority Review", "action_label": f"{owner} Priority Review"}
        return {"action_type": "Priority Escalation", "action_label": f"{owner} Priority Escalation"}

    if level == LEVEL_LOW:
        return {"action_type": "Monitor", "action_label": "Monitor"}
    if level == LEVEL_MEDIUM:
        return {"action_type": "Review", "action_label": f"{owner} Review"}
    return {"action_type": "Priority Review", "action_label": f"{owner} Priority Review"}


# ── Legacy severity mapping (for backward compat with old /api routes) ────────
# Maps the new engagement_level + category back into the old 5-tier severity
# string so existing severity-based code paths keep working during transition.
_LEGACY_SEVERITY_BY_LEVEL = {
    LEVEL_LOW: "low",
    LEVEL_MEDIUM: "medium",
    LEVEL_HIGH: "high",
}


def legacy_severity(level: str, escalate: bool) -> str:
    base = _LEGACY_SEVERITY_BY_LEVEL.get(level, "low")
    if escalate and base != "critical":
        return "high" if base == "low" else "critical" if base == "high" else "high"
    return base
