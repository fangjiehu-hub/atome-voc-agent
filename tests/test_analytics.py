"""Tests for analytics API."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_overview(client: AsyncClient):
    resp = await client.get("/api/analytics/overview?days=7")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_mentions" in data
    assert "negative_complaints" in data


@pytest.mark.asyncio
async def test_trend(client: AsyncClient):
    resp = await client.get("/api/analytics/trend?days=7")
    assert resp.status_code == 200
    assert "points" in resp.json()


@pytest.mark.asyncio
async def test_categories(client: AsyncClient):
    resp = await client.get("/api/analytics/categories?days=7")
    assert resp.status_code == 200
    assert "items" in resp.json()


@pytest.mark.asyncio
async def test_severity_distribution(client: AsyncClient):
    resp = await client.get("/api/analytics/severity-distribution?days=7")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert "total" in data
