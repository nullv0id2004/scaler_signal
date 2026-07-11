from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import get_current_user
from app.models import User
from app.schemas.user import UserOut
from app.services import users as user_service

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/search", response_model=list[UserOut])
async def search_users(
    q: str = Query(default="", description="Match against username or display name"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    users = await user_service.search(session, q, exclude_user_id=current_user.id)
    return [UserOut.model_validate(u) for u in users]
