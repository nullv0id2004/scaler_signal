"""Real OTP lifecycle: request (generate + send + rate-limit) and verify
(check + consume + attempt-limit), backed by the `otp_codes` table.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import OtpCode, User
from app.services import users as user_service
from app.services.phone import normalize_phone
from app.services.sms import get_sms_sender


def _hash_code(code: str) -> str:
    """sha256 of the code, salted with the app's JWT secret so OTP hashes
    aren't just a bare, rainbow-table-able sha256(code)."""
    return hashlib.sha256(f"{settings.jwt_secret}:{code}".encode()).hexdigest()


def _generate_code(length: int) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


async def _latest_unconsumed(session: AsyncSession, phone: str) -> OtpCode | None:
    result = await session.execute(
        select(OtpCode)
        .where(OtpCode.phone == phone, OtpCode.consumed.is_(False))
        .order_by(OtpCode.created_at.desc(), OtpCode.id.desc())
    )
    return result.scalars().first()


async def request_otp(session: AsyncSession, phone: str) -> dict:
    phone = normalize_phone(phone)
    now = datetime.now(timezone.utc)

    last = await _latest_unconsumed(session, phone)
    if last is not None:
        created_at = last.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        elapsed = (now - created_at).total_seconds()
        if elapsed < settings.otp_resend_seconds:
            wait = int(settings.otp_resend_seconds - elapsed) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {wait}s before requesting another code",
            )

    code = _generate_code(settings.otp_length)

    # Invalidate any still-pending codes for this phone before issuing a new one.
    result = await session.execute(
        select(OtpCode).where(OtpCode.phone == phone, OtpCode.consumed.is_(False))
    )
    for stale in result.scalars().all():
        stale.consumed = True

    otp_row = OtpCode(
        phone=phone,
        code_hash=_hash_code(code),
        expires_at=now + timedelta(seconds=settings.otp_ttl_seconds),
        attempts=0,
        consumed=False,
    )
    session.add(otp_row)
    await session.commit()

    sender = get_sms_sender()
    await sender.send(phone, f"Your Signal-clone code is {code}")

    out = {
        "ok": True,
        "expires_in": settings.otp_ttl_seconds,
        "resend_in": settings.otp_resend_seconds,
    }
    if settings.otp_dev_mode and settings.sms_provider == "console":
        out["dev_code"] = code
    return out


async def _unique_username(session: AsyncSession, base: str) -> str:
    candidate = base
    suffix = 0
    while True:
        existing = await session.execute(select(User).where(User.username == candidate))
        if existing.scalar_one_or_none() is None:
            return candidate
        suffix += 1
        candidate = f"{base}{suffix}"


async def verify_otp(session: AsyncSession, phone: str, code: str) -> tuple[User, bool]:
    phone = normalize_phone(phone)
    now = datetime.now(timezone.utc)

    row = await _latest_unconsumed(session, phone)
    if row is not None:
        expires_at = row.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < now:
            row = None

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="code expired or not found"
        )

    if row.attempts >= settings.otp_max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="too many attempts"
        )

    if row.code_hash != _hash_code(code):
        row.attempts += 1
        remaining = max(settings.otp_max_attempts - row.attempts, 0)
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid code ({remaining} attempts remaining)",
        )

    row.consumed = True
    await session.commit()

    user = await user_service.get_by_phone(session, phone)
    is_new = False
    if user is None:
        digits = phone.lstrip("+")
        username = await _unique_username(session, f"user{digits}")
        user = await user_service.create(
            session, username=username, display_name="", phone=phone
        )
        is_new = True
        await session.commit()
        await session.refresh(user)

    return user, is_new
