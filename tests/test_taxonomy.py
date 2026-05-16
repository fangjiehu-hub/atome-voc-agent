"""Tests for taxonomy API."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_and_list_categories(client: AsyncClient):
    resp = await client.post(
        "/api/taxonomy/categories",
        json={"key": "test_cat", "label": "Test Category", "color": "#FF0000"},
    )
    assert resp.status_code == 200
    assert resp.json()["key"] == "test_cat"

    resp = await client.get("/api/taxonomy/categories")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_create_sub_issue(client: AsyncClient):
    resp = await client.post(
        "/api/taxonomy/sub-issues",
        json={"key": "test_issue", "label": "Test Issue", "category_key": "test_cat"},
    )
    assert resp.status_code == 200
    assert resp.json()["key"] == "test_issue"
