from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import get_current_user
from app.models import User
from app.schemas.message import CreateMessageIn, ForwardMessageIn, MessageOut
from app.services import messages as message_service
from app.ws.broadcast import broadcast_message_deleted, broadcast_message_new

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


@router.post("/forward", response_model=list[MessageOut])
async def forward_message(
    payload: ForwardMessageIn,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Copy a message into one or more conversations (tagged forwarded).
    Broadcasts each new message so live clients in the target conversations
    see it arrive."""
    created = await message_service.forward(
        session, current_user, payload.message_id, payload.conversation_ids
    )
    out = []
    for message in created:
        await broadcast_message_new(session, message)
        out.append(await message_service.serialize(session, message))
    return out


@router.delete("/{message_id}", response_model=MessageOut)
async def delete_message(
    message_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Delete-for-everyone (sender only). Returns the tombstoned message and
    broadcasts message.deleted so every member's client updates."""
    message = await message_service.delete(session, current_user, message_id)
    await broadcast_message_deleted(session, message.conversation_id, message.id)
    return await message_service.serialize(session, message)
