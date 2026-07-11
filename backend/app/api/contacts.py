from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import get_current_user
from app.models import User
from app.schemas.contact import ContactNoteIn, ContactNoteOut
from app.services import contacts as contact_service

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


@router.get("/{user_id}", response_model=ContactNoteOut)
async def get_contact_note(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await contact_service.get(session, current_user.id, user_id)


@router.put("/{user_id}", response_model=ContactNoteOut)
async def put_contact_note(
    user_id: int,
    payload: ContactNoteIn,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    fields = payload.model_dump(exclude_unset=True)
    return await contact_service.upsert(session, current_user.id, user_id, fields)
