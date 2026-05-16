"""Tests for feedback API."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_and_list_feedback(client: AsyncClient):
    # Create feedback
    resp = await client.post(
        "/api/feedback",
        json={
            "object_type": "post",
            "object_id": 1,
            "field_name": "category",
            "original_value": "app_bug",
            "corrected_value": "transaction",
            "reason": "This is about a payment failure, not an app bug",
        },
    )
    assert resp.status_code == 200
    fb = resp.json()
    assert fb["field_name"] == "category"
    assert fb["corrected_value"] == "transaction"

    # List feedback
    resp = await client.get("/api/feedback")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
