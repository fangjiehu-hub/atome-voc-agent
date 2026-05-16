"""Tests for alerts API."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_alerts_empty(client: AsyncClient):
    resp = await client.get("/api/alerts")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0


@pytest.mark.asyncio
async def test_ack_alert_not_found(client: AsyncClient):
    resp = await client.post("/api/alerts/999/ack")
    assert resp.status_code == 404
