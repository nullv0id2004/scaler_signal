"""Auth orchestration: thin wrappers around the real OTP lifecycle in
`app.services.otp` (request/verify, persistence, rate limiting, SMS
sending). Kept as a separate module so `app/api/auth.py` has one place to
import from, and so tests can hit either layer directly.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.services import otp as otp_service


async def request_otp(session: AsyncSession, phone: str) -> dict:
    return await otp_service.request_otp(session, phone)


async def verify_otp(session: AsyncSession, phone: str, code: str) -> tuple[User, bool]:
    return await otp_service.verify_otp(session, phone, code)
