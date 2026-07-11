"""Shared broadcast helpers so the REST and WebSocket layers push identical
real-time frames to a conversation's members. Kept separate from ws.handlers
(which owns the socket receive loop) so REST endpoints can broadcast without
importing handler internals."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Message
from app.schemas.ws import frame
from app.services import conversations as conversation_service
from app.services import messages as message_service
from app.services import receipts as receipt_service
from app.ws.manager import manager


async def _member_ids(session: AsyncSession, conversation_id: int) -> list[int]:
    members = await conversation_service.get_members(session, conversation_id)
    return [m.user_id for m in members]


async def broadcast_message_deleted(
    session: AsyncSession, conversation_id: int, message_id: int
) -> None:
    ids = await _member_ids(session, conversation_id)
    await manager.broadcast(
        ids,
        frame("message.deleted", {"conversation_id": conversation_id, "message_id": message_id}),
    )


async def broadcast_message_new(
    session: AsyncSession, message: Message, exclude_user_id: int | None = None
) -> None:
    members = await conversation_service.get_members(session, message.conversation_id)
    out = await message_service.serialize(session, message)
    out.status = receipt_service.status_for(message, members)
    data = out.model_dump(mode="json")
    ids = [m.user_id for m in members if m.user_id != exclude_user_id]
    await manager.broadcast(ids, frame("message.new", data))
