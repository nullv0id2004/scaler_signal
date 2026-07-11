from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import User
from app.services import users as user_service


async def verify_otp(session: AsyncSession, handle: str, otp: str) -> tuple[User, bool]:
    """Verify the (mocked) OTP for a handle.

    Rejects any otp != settings.fixed_otp with 401. If the handle has no
    existing user, creates a minimal one (username=handle) and reports
    is_new=True so the client routes to profile setup.
    """
    if otp != settings.fixed_otp:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP")

    user = await user_service.get_by_handle(session, handle)
    is_new = False
    if user is None:
        user = await user_service.create(session, username=handle)
        is_new = True

    await session.commit()
    await session.refresh(user)
    return user, is_new
