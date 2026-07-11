from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import create_access_token, get_current_user
from app.models import User
from app.schemas.auth import (
    CompleteProfileIn,
    LogoutOut,
    RequestOtpIn,
    RequestOtpOut,
    TokenOut,
    VerifyOtpIn,
)
from app.schemas.user import UserOut
from app.services import auth as auth_service
from app.services import users as user_service

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/request-otp", response_model=RequestOtpOut)
async def request_otp(payload: RequestOtpIn, session: AsyncSession = Depends(get_session)):
    result = await auth_service.request_otp(session, payload.phone)
    return RequestOtpOut(**result)


@router.post("/verify-otp", response_model=TokenOut)
async def verify_otp(payload: VerifyOtpIn, session: AsyncSession = Depends(get_session)):
    user, created = await auth_service.verify_otp(session, payload.phone, payload.code)
    is_new = created or not user.display_name
    token = create_access_token(user.id)
    return TokenOut(token=token, user=UserOut.model_validate(user), is_new=is_new)


@router.post("/complete-profile")
async def complete_profile(
    payload: CompleteProfileIn,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    user = await user_service.update_profile(
        session,
        current_user,
        display_name=payload.display_name,
        avatar_url=payload.avatar_url,
        username=payload.username,
    )
    await session.commit()
    await session.refresh(user)
    return {"user": UserOut.model_validate(user)}


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@router.post("/logout", response_model=LogoutOut)
async def logout(current_user: User = Depends(get_current_user)):
    # Stateless JWT: nothing server-side to invalidate; client drops the token.
    return LogoutOut(ok=True)
