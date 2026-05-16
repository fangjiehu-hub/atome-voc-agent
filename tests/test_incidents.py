"""Tests for incidents API."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_incidents_empty(client: AsyncClient):
    resp = await client.get("/api/incidents")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_get_incident_not_found(client: AsyncClient):
    resp = await client.get("/api/incidents/999")
    assert resp.status_code == 404
