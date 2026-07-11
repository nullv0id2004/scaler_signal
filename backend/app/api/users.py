from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import get_current_user
from app.models import User
from app.schemas.user import UpdateProfileIn, UserOut
from app.services import users as user_service

router = APIRouter(prefix="/api/users", tags=["users"])

ABOUT_MAX_LEN = 500


@router.get("/search", response_model=list[UserOut])
async def search_users(
    q: str = Query(default="", description="Match against username or display name"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    users = await user_service.search(session, q, exclude_user_id=current_user.id)
    return [UserOut.model_validate(u) for u in users]


@router.patch("/me", response_model=UserOut)
async def update_me(
    payload: UpdateProfileIn,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Edit the current user's profile — display name, about, avatar. Only the
    fields present in the body change; username stays immutable (set at signup)."""
    if payload.display_name is not None and not payload.display_name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="display_name cannot be empty"
        )
    if payload.about is not None and len(payload.about) > ABOUT_MAX_LEN:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"about must be at most {ABOUT_MAX_LEN} characters",
        )
    user = await user_service.update_profile(
        session,
        current_user,
        display_name=payload.display_name.strip() if payload.display_name is not None else None,
        avatar_url=payload.avatar_url,
        about=payload.about,
    )
    await session.commit()
    await session.refresh(user)
    return UserOut.model_validate(user)


# Declared last so the static /search and /me routes match first.
@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Public profile of any user, for viewing others from chats / member lists."""
    user = await user_service.get_by_id(session, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="user not found")
    return UserOut.model_validate(user)
