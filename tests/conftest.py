"""Shared test fixtures.

Note: API tests require PostgreSQL (due to ARRAY columns).
Run pure unit tests (test_dedup.py, test_severity.py) separately with:
  python -m pytest tests/test_dedup.py tests/test_severity.py

Run API tests with a running PostgreSQL:
  DATABASE_URL=postgresql+asyncpg://... python -m pytest tests/test_monitor.py
"""

import os

# Override DB URL before any backend imports - use PostgreSQL for tests
# Set this to your test DB. API tests won't run without PostgreSQL.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://atome:atome_secret@localhost:5432/atome_voc_test",
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
