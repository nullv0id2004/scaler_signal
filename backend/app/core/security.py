from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.db import get_session
from app.models import User

# tokenUrl points at the OTP-verify endpoint that issues tokens; it doesn't
# need to be a real "password" flow, it just drives the OpenAPI docs UI.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/verify-otp", auto_error=False)


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> int:
    """Decode a JWT and return the user_id encoded in it.

    Raises jose.JWTError (or ValueError) on any invalid/tampered/expired token.
    """
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    sub = payload.get("sub")
    if sub is None:
        raise JWTError("missing sub claim")
    return int(sub)


async def get_user_from_token(session: AsyncSession, token: str) -> User | None:
    """Resolve a User from a bearer token, or None if invalid/unknown.

    Used by the WebSocket auth path (no HTTPException there, just None).
    """
    try:
        user_id = decode_token(token)
    except (JWTError, ValueError):
        return None
    result = await session.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise unauthorized
    user = await get_user_from_token(session, token)
    if user is None:
        raise unauthorized
    return user
