from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import get_current_user
from app.models import User
from app.schemas.message import CreateMessageIn, MessageOut
from app.services import messages as message_service

router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.post("", response_model=MessageOut, status_code=201)
async def post_message(
    payload: CreateMessageIn,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """REST fallback for sending a message. WS is send-primary; both paths
    delegate to services.messages.create so behavior never diverges."""
    message = await message_service.create(
        session,
        current_user,
        payload.conversation_id,
        content=payload.content,
        reply_to_id=payload.reply_to_id,
        type=payload.type,
    )
    return await message_service.serialize(session, message)
