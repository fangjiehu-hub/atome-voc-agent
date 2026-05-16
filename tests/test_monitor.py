"""Tests for the monitor API endpoints (save + query)."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_save_posts(client: AsyncClient):
    payload = {
        "posts": [
            {
                "platform": "reddit",
                "brand": "atome_ph",
                "post_id": "abc123",
                "url": "https://reddit.com/r/Philippines/abc123",
                "author_handle": "testuser",
                "content_text": "Atome charged me late fees even though I paid already. This is a scam!",
                "created_at": "2026-04-19T10:00:00Z",
                "engagement_likes": 42,
                "engagement_replies": 15,
                "engagement_reposts": 3,
            },
            {
                "platform": "twitter",
                "brand": "atome_ph",
                "post_id": "tweet456",
                "author_handle": "angryuser",
                "content_text": "Atome app keeps crashing when I try to pay. Fix your app!",
                "created_at": "2026-04-19T12:00:00Z",
                "engagement_likes": 8,
                "engagement_replies": 2,
                "engagement_reposts": 1,
            },
        ]
    }
    resp = await client.post("/api/monitor/save", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["inserted"] == 2
    assert data["total"] == 2


@pytest.mark.asyncio
async def test_save_dedup(client: AsyncClient):
    """Duplicate posts should be ignored (ON CONFLICT DO NOTHING)."""
    post = {
        "posts": [
            {
                "platform": "reddit",
                "brand": "atome_ph",
                "post_id": "dup_test_1",
                "content_text": "Atome test post for dedup",
            }
        ]
    }
    resp1 = await client.post("/api/monitor/save", json=post)
    assert resp1.json()["inserted"] == 1

    resp2 = await client.post("/api/monitor/save", json=post)
    assert resp2.json()["inserted"] == 0


@pytest.mark.asyncio
async def test_query_empty(client: AsyncClient):
    resp = await client.get("/api/monitor/query")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


@pytest.mark.asyncio
async def test_query_with_data(client: AsyncClient):
    # Insert some data first
    await client.post(
        "/api/monitor/save",
        json={
            "posts": [
                {
                    "platform": "reddit",
                    "brand": "atome_ph",
                    "post_id": "query_test_1",
                    "content_text": "Atome is terrible with their late fees",
                },
                {
                    "platform": "twitter",
                    "brand": "atome_ph",
                    "post_id": "query_test_2",
                    "content_text": "Atome app crashed again today",
                },
            ]
        },
    )

    # Query all
    resp = await client.get("/api/monitor/query")
    assert resp.json()["total"] == 2

    # Filter by platform
    resp = await client.get("/api/monitor/query?platform=reddit")
    assert resp.json()["total"] == 1
    assert resp.json()["items"][0]["platform"] == "reddit"


@pytest.mark.asyncio
async def test_query_pagination(client: AsyncClient):
    # Insert 5 posts
    posts = [
        {
            "platform": "reddit",
            "brand": "atome_ph",
            "post_id": f"page_test_{i}",
            "content_text": f"Atome test post {i}",
        }
        for i in range(5)
    ]
    await client.post("/api/monitor/save", json={"posts": posts})

    # Page 1, size 2
    resp = await client.get("/api/monitor/query?page=1&page_size=2")
    data = resp.json()
    assert data["total"] == 5
    assert len(data["items"]) == 2
    assert data["page"] == 1
    assert data["page_size"] == 2
