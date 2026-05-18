"""Shared test fixtures.

⚠️  IMPORTANT — DESTRUCTIVE FIXTURE WARNING
The `db_session` fixture below calls `Base.metadata.drop_all()`. If pytest is
run with DATABASE_URL pointing at a real database (instead of a dedicated test
DB), this WILL drop all your data. We hard-override DATABASE_URL here to a
separate test DB so this can never happen accidentally.

If your test DB doesn't exist, create it once:
    docker compose exec db createdb -U atome atome_voc_test

Run pure unit tests (test_dedup, test_severity, test_engagement_calculator,
test_v2_api) without any DB fixtures:
    python -m pytest tests/test_dedup.py tests/test_severity.py \
        tests/test_engagement_calculator.py tests/test_v2_api.py
"""

import os

# Force-override DATABASE_URL to a separate test database — even if the runtime
# env has DATABASE_URL pointing at the main DB (as it does inside the backend
# container). This protects against destroying production data with drop_all.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://atome:atome_secret@db:5432/atome_voc_test",
)

import asyncio
from typing import AsyncGenerator

import pytest
import pytest_asyncio

# Only import DB and app fixtures for tests that need them
_db_available = False
try:
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
    from backend.database import Base, get_db
    from backend.main import app

    test_engine = create_async_engine(os.environ["DATABASE_URL"], echo=False)
    TestSession = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    _db_available = True
except Exception:
    pass


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


if _db_available:

    @pytest_asyncio.fixture
    async def db_session():
        """Provide a clean DB session for API tests."""
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        yield
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with TestSession() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    @pytest_asyncio.fixture
    async def client(db_session):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as c:
            yield c
