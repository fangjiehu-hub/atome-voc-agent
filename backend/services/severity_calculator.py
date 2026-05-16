"""Rule-based severity calculator with overrides on top of LLM severity."""

SEVERITY_ORDER = ["none", "low", "medium", "high", "critical"]

# Categories that warrant minimum severity floors
HIGH_RISK_CATEGORIES = {"debt_collection", "fraud", "security"}
MEDIUM_RISK_CATEGORIES = {"interest_rate", "refund"}

# Engagement thresholds — tiered escalation
ENGAGEMENT_CRITICAL_THRESHOLD = 1000  # auto-critical
ENGAGEMENT_HIGH_THRESHOLD = 500       # min high
ENGAGEMENT_MEDIUM_THRESHOLD = 100     # min medium

# Reply/repost velocity: high reply count signals virality risk
REPLY_HIGH_THRESHOLD = 50             # min high — active thread
REPOST_CRITICAL_THRESHOLD = 200       # auto-critical — going viral


def severity_index(sev: str) -> int:
    try:
        return SEVERITY_ORDER.index(sev)
    except ValueError:
        return 0


def apply_severity_overrides(
    llm_severity: str,
    category: str | None,
    engagement_likes: int = 0,
    engagement_replies: int = 0,
    engagement_reposts: int = 0,
    cluster_post_count: int | None = None,
) -> str:
    """
    Apply rule-based overrides to the LLM-assigned severity.

    Rules (applied in order, highest override wins):
    1. Viral reposts (>200 reposts/shares) -> auto-critical
    2. Viral likes (>1K likes) -> auto-critical
    3. High engagement (>500 likes) -> min high
    4. Active thread (>50 replies/comments) -> min high
    5. Growing engagement (>100 likes) -> min medium
    6. High-risk categories (debt_collection, fraud, security) -> min medium
    7. Medium-risk categories (interest_rate, refund) -> min low
    8. Cluster recurrence (>10 posts) -> min high
    9. Large cluster (>25 posts) -> auto-critical
    """
    current = severity_index(llm_severity)

    # Rule 1: Viral reposts -> critical (high spread potential)
    if engagement_reposts >= REPOST_CRITICAL_THRESHOLD:
        return "critical"

    # Rule 2: Viral likes -> critical
    if engagement_likes >= ENGAGEMENT_CRITICAL_THRESHOLD:
        return "critical"

    # Rule 3: High likes -> min high
    if engagement_likes >= ENGAGEMENT_HIGH_THRESHOLD:
        current = max(current, severity_index("high"))

    # Rule 4: Active thread (many replies) -> min high (signals growing issue)
    if engagement_replies >= REPLY_HIGH_THRESHOLD:
        current = max(current, severity_index("high"))

    # Rule 5: Growing engagement -> min medium
    if engagement_likes >= ENGAGEMENT_MEDIUM_THRESHOLD:
        current = max(current, severity_index("medium"))

    # Rule 6: High-risk category floor
    if category in HIGH_RISK_CATEGORIES:
        current = max(current, severity_index("medium"))

    # Rule 7: Medium-risk category floor
    if category in MEDIUM_RISK_CATEGORIES:
        current = max(current, severity_index("low"))

    # Rule 8: Cluster recurrence -> min high
    if cluster_post_count is not None and cluster_post_count > 10:
        current = max(current, severity_index("high"))

    # Rule 9: Large cluster -> critical
    if cluster_post_count is not None and cluster_post_count > 25:
        return "critical"

    return SEVERITY_ORDER[current]
