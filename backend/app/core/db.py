from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event

from .config import settings


class Base(DeclarativeBase):
    pass


engine = create_async_engine(settings.database_url, echo=False)


@event.listens_for(engine.sync_engine, "connect")
def _wal(dbapi_conn, _):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_session():
    async with async_session() as s:
        yield s


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Dependency that hands back the session *factory* itself (not an
    opened session). Used by the WebSocket route, which needs to own a
    session's full open/close lifecycle manually — including timeout-guarding
    the close — rather than delegating it to FastAPI's automatic
    generator-dependency teardown (see app/ws/routes.py for why). Tests
    override this the same way they override `get_session`, pointing it at
    their isolated test engine's sessionmaker.
    """
    return async_session
