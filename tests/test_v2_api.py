"""HTTP-level integration tests for /api/v2/*.

Hits the live uvicorn process inside the docker container instead of using
pytest-asyncio + ASGITransport — that path is broken for this codebase due to
an event-loop / asyncpg-connection contention bug (see conftest.py). Going
through HTTP is simpler and exercises the full stack including rewrites.

Usage:
  # Inside the backend container:
  python -m pytest tests/test_v2_api.py

  # Override the target URL if testing remote:
  V2_BASE=https://atome-voc-v2-backend.fly.dev python -m pytest tests/test_v2_api.py
"""

import os

import httpx
import pytest

BASE = os.environ.get("V2_BASE", "http://localhost:8000")
client = httpx.Client(base_url=BASE, timeout=15.0)


# ── /api/v2/settings ─────────────────────────────────────────────────────


def test_get_settings_returns_design_shape():
    r = client.get("/api/v2/settings")
    assert r.status_code == 200
    j = r.json()
    # camelCase keys, exactly as the design's data.js consumes
    for key in ["engagementThresholds", "sensitiveKeywords", "ownership",
                "defaultMarket", "defaultSource", "defaultTimeWindow"]:
        assert key in j, f"settings response missing {key!r}"
    assert "lowMax" in j["engagementThresholds"]
    assert "mediumMax" in j["engagementThresholds"]
    assert isinstance(j["sensitiveKeywords"], list)
    assert isinstance(j["ownership"], dict)


def test_patch_settings_validates_thresholds():
    """lowMax >= mediumMax must be rejected."""
    r = client.patch("/api/v2/settings", json={"engagementThresholds": {"lowMax": 100, "mediumMax": 50}})
    assert r.status_code == 400


def test_patch_settings_round_trip():
    """Update one field, verify it persisted, then restore."""
    original = client.get("/api/v2/settings").json()
    new_window = "30d" if original["defaultTimeWindow"] != "30d" else "7d"
    r = client.patch("/api/v2/settings", json={"defaultTimeWindow": new_window})
    assert r.status_code == 200
    assert r.json()["defaultTimeWindow"] == new_window
    # Restore
    client.patch("/api/v2/settings", json={"defaultTimeWindow": original["defaultTimeWindow"]})


# ── /api/v2/taxonomy ─────────────────────────────────────────────────────


EXPECTED_CATEGORIES = {
    "collections", "customer_service", "bayad", "transaction", "card_delivery",
    "fees", "payment", "card_application", "limit_increase", "card_binding",
    "otp", "user_review", "fraud",
}


def test_get_taxonomy_has_all_13_categories():
    r = client.get("/api/v2/taxonomy")
    assert r.status_code == 200
    items = r.json()["items"]
    keys = {t["key"] for t in items}
    assert keys == EXPECTED_CATEGORIES, f"taxonomy keys mismatch: {keys ^ EXPECTED_CATEGORIES}"


def test_taxonomy_shape_matches_design():
    items = client.get("/api/v2/taxonomy").json()["items"]
    sample = items[0]
    for key in ["key", "label", "description", "primaryOwner", "signals",
                "defaultAction", "escalationFlag", "escalationNote"]:
        assert key in sample, f"taxonomy item missing {key!r}"
    assert isinstance(sample["signals"], list)
    assert isinstance(sample["escalationFlag"], bool)


def test_taxonomy_collections_and_fraud_are_escalation_flagged():
    """Per design: Collections + Fraud are escalation_flag=True (sensitive cats)."""
    items = client.get("/api/v2/taxonomy").json()["items"]
    by_key = {t["key"]: t for t in items}
    assert by_key["collections"]["escalationFlag"] is True
    assert by_key["fraud"]["escalationFlag"] is True
    # Spot-check a non-sensitive one
    assert by_key["customer_service"]["escalationFlag"] is False


# ── /api/v2/mentions ─────────────────────────────────────────────────────


def test_get_mentions_returns_design_shape():
    r = client.get("/api/v2/mentions?limit=5")
    assert r.status_code == 200
    items = r.json()["items"]
    if not items:
        pytest.skip("no mentions in DB to verify shape")
    m = items[0]
    for key in ["id", "platform", "author", "created", "category",
                "likes", "replies", "reposts", "comments",
                "engagement", "level", "owner", "action", "actionType",
                "escalation", "text", "status", "market"]:
        assert key in m, f"mention missing {key!r}"
    assert m["level"] in ("Low", "Medium", "High")
    assert isinstance(m["escalation"], bool)


def test_mentions_engagement_score_consistent():
    """engagement field should equal likes+replies+reposts+comments."""
    items = client.get("/api/v2/mentions?limit=20").json()["items"]
    for m in items:
        assert m["engagement"] == m["likes"] + m["replies"] + m["reposts"] + m["comments"], (
            f"mention {m['id']} engagement mismatch"
        )


def test_mentions_filter_by_level():
    r = client.get("/api/v2/mentions?level=Low&limit=50")
    assert r.status_code == 200
    for m in r.json()["items"]:
        assert m["level"] == "Low"


def test_mentions_filter_invalid_level_rejected():
    r = client.get("/api/v2/mentions?level=NotALevel")
    assert r.status_code == 422  # FastAPI Query pattern validation


# ── /api/v2/clusters ─────────────────────────────────────────────────────


def test_get_clusters_returns_design_shape():
    items = client.get("/api/v2/clusters").json()["items"]
    if not items:
        pytest.skip("no clusters yet")
    c = items[0]
    for key in ["clusterId", "topic", "category", "mentionCount", "openCount",
                "totalEngagement", "level", "owner", "action", "escalation",
                "platforms", "lastSeen"]:
        assert key in c, f"cluster missing {key!r}"
    assert c["mentionCount"] >= c["openCount"]
    assert c["totalEngagement"] >= 0


def test_clusters_sorted_by_engagement_desc():
    items = client.get("/api/v2/clusters").json()["items"]
    engagements = [c["totalEngagement"] for c in items]
    assert engagements == sorted(engagements, reverse=True)


# ── /api/v2/overview ─────────────────────────────────────────────────────


def test_get_overview_returns_design_shape():
    j = client.get("/api/v2/overview").json()
    for key in ["totals", "topIssue", "topEngagement", "byCategory", "byOwner", "trend"]:
        assert key in j, f"overview missing {key!r}"
    assert "mentions" in j["totals"]
    assert "high" in j["totals"]
    assert "medium" in j["totals"]
    assert "low" in j["totals"]


def test_overview_totals_match_level_breakdown():
    t = client.get("/api/v2/overview").json()["totals"]
    # high + medium + low should account for all annotated mentions
    assert t["high"] + t["medium"] + t["low"] == t["mentions"]


# ── /api/v2/corrections ──────────────────────────────────────────────────


def test_get_corrections_returns_list():
    r = client.get("/api/v2/corrections")
    assert r.status_code == 200
    assert "items" in r.json()
    assert isinstance(r.json()["items"], list)


def test_create_correction_on_missing_mention_404s():
    r = client.post("/api/v2/corrections", json={
        "mentionId": 99999999, "correctionType": "comment", "comment": "x",
    })
    assert r.status_code == 404


def test_create_correction_round_trip():
    """Create a correction on the first available mention, then check it appears in /corrections."""
    mentions = client.get("/api/v2/mentions?limit=1").json()["items"]
    if not mentions:
        pytest.skip("no mentions to correct")
    mid = mentions[0]["id"]
    payload = {
        "mentionId": mid,
        "correctionType": "comment",
        "comment": "test-correction-from-pytest-do-not-delete-investigation",
    }
    r = client.post("/api/v2/corrections", json=payload)
    assert r.status_code == 200
    correction_id = r.json()["id"]
    # Now appears in list
    list_resp = client.get("/api/v2/corrections").json()["items"]
    assert any(c["id"] == correction_id for c in list_resp)


def test_create_correction_invalid_type_rejected():
    r = client.post("/api/v2/corrections", json={
        "mentionId": 1, "correctionType": "fish", "comment": "x",
    })
    assert r.status_code == 422  # Literal type validation
