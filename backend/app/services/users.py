from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


async def get_by_handle(session: AsyncSession, handle: str) -> User | None:
    """Look up a user by login handle (matches username or phone)."""
    result = await session.execute(
        select(User).where(or_(User.username == handle, User.phone == handle))
    )
    return result.scalar_one_or_none()


async def get_by_phone(session: AsyncSession, phone: str) -> User | None:
    """Look up a user by (already-normalized) phone number."""
    result = await session.execute(select(User).where(User.phone == phone))
    return result.scalar_one_or_none()


async def get_by_id(session: AsyncSession, user_id: int) -> User | None:
    result = await session.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def create(
    session: AsyncSession,
    username: str,
    display_name: str | None = None,
    phone: str | None = None,
) -> User:
    if display_name is None:
        display_name = username
    user = User(username=username, display_name=display_name, phone=phone)
    session.add(user)
    await session.flush()
    return user


async def update_profile(
    session: AsyncSession,
    user: User,
    display_name: str | None = None,
    avatar_url: str | None = None,
    about: str | None = None,
    username: str | None = None,
) -> User:
    if username is not None and username != user.username:
        existing = await session.execute(select(User).where(User.username == username))
        if existing.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="username already taken"
            )
        user.username = username
    if display_name is not None:
        user.display_name = display_name
    if avatar_url is not None:
        user.avatar_url = avatar_url
    if about is not None:
        user.about = about
    await session.flush()
    return user


async def search(
    session: AsyncSession,
    query: str,
    exclude_user_id: int | None = None,
    limit: int = 20,
) -> list[User]:
    stmt = select(User).where(
        or_(User.username.ilike(f"%{query}%"), User.display_name.ilike(f"%{query}%"))
    )
    if exclude_user_id is not None:
        stmt = stmt.where(User.id != exclude_user_id)
    stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    return list(result.scalars().all())
