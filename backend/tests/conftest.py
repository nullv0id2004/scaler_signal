import pytest, pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.main import create_app
from app.core.db import Base, get_session

# Import models so every table is registered on Base.metadata before any
# create_all/drop_all call below.
import app.models  # noqa: F401


@pytest_asyncio.fixture
async def test_engine(tmp_path):
    """Isolated temp-file SQLite engine, unique per test.

    A temp *file* DB (rather than in-memory) keeps behavior consistent across
    the multiple connections async SQLAlchemy/aiosqlite may open, while still
    being fully isolated from the production ./signal.db and from other test
    runs.
    """
    db_path = tmp_path / "test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False)

    @event.listens_for(engine.sync_engine, "connect")
    def _pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as c:
        await c.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def session(test_engine):
    """AsyncSession bound to the isolated temp test DB, for model/service tests."""
    session_maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as s:
        yield s


@pytest_asyncio.fixture
async def alice(session):
    """A seeded user for service-level tests."""
    from app.services import users as user_service

    user = await user_service.create(session, username="alice", display_name="Alice")
    await session.commit()
    await session.refresh(user)
    return user


@pytest_asyncio.fixture
async def bob(session):
    """A second seeded user for service-level tests."""
    from app.services import users as user_service

    user = await user_service.create(session, username="bob", display_name="Bob")
    await session.commit()
    await session.refresh(user)
    return user


@pytest_asyncio.fixture
async def client(test_engine):
    """httpx AsyncClient against the app, with get_session overridden to the
    isolated temp test DB so endpoint tests never touch production data."""
    app = create_app()
    session_maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_session_override():
        async with session_maker() as s:
            yield s

    app.dependency_overrides[get_session] = _get_session_override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            yield c
    finally:
        app.dependency_overrides.clear()
