import pytest, pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.main import create_app
from app.core.db import Base, get_session, get_session_factory
from app.ws.manager import manager as ws_manager

# Import models so every table is registered on Base.metadata before any
# create_all/drop_all call below.
import app.models  # noqa: F401


@pytest.fixture(autouse=True)
def _reset_ws_manager():
    """`app.ws.manager.manager` is a process-wide singleton. Without a reset,
    a socket left registered by one test (e.g. its server-side task never
    reaching a clean disconnect because the test closed the connection
    without draining every broadcast frame) would still be in
    `_connections` for the next test — and since per-test SQLite DBs each
    restart user ids from 1, a later test's same-numbered user would fan a
    broadcast out to that stale, long-dead socket too."""
    ws_manager._connections.clear()
    yield
    ws_manager._connections.clear()


@pytest_asyncio.fixture
async def test_engine(tmp_path):
    """Isolated temp-file SQLite engine, unique per test.

    A temp *file* DB (rather than in-memory) keeps behavior consistent across
    the multiple connections async SQLAlchemy/aiosqlite may open, while still
    being fully isolated from the production ./signal.db and from other test
    runs. Deliberately NOT StaticPool: WS tests hold two sessions open
    concurrently (one per connected user), and StaticPool's single shared
    connection serializes checkouts, deadlocking one session against the
    other for the lifetime of both connections.
    """
    db_path = tmp_path / "test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False)

    @event.listens_for(engine.sync_engine, "connect")
    def _pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        # WAL matches production (app/core/db.py) and, crucially for the WS
        # tests, lets one writer + readers proceed concurrently instead of
        # lock-contending: two simultaneously-open sessions (one per
        # connected user) under the default rollback-journal mode serialize
        # writes and can make a multi-step WS exchange look hung.
        cur.execute("PRAGMA journal_mode=WAL")
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
    app.dependency_overrides[get_session_factory] = lambda: session_maker
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            yield c
    finally:
        app.dependency_overrides.clear()
