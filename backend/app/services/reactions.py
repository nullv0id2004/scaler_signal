from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Message, MessageReaction
from app.schemas.message import ReactionOut


async def toggle(session: AsyncSession, user, message_id: int, emoji: str) -> list[ReactionOut]:
    """Toggle user's reaction on a message: add if absent, remove if present
    (UNIQUE-guarded by message_id+user_id+emoji). Returns the full reaction
    list for the message after the toggle."""
    from app.services.conversations import get_member

    msg_result = await session.execute(select(Message).where(Message.id == message_id))
    message = msg_result.scalar_one_or_none()
    if message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    member = await get_member(session, message.conversation_id, user.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this conversation"
        )

    existing_result = await session.execute(
        select(MessageReaction).where(
            MessageReaction.message_id == message_id,
            MessageReaction.user_id == user.id,
            MessageReaction.emoji == emoji,
        )
    )
    existing = existing_result.scalar_one_or_none()
    if existing is not None:
        await session.delete(existing)
    else:
        session.add(MessageReaction(message_id=message_id, user_id=user.id, emoji=emoji))

    await session.commit()

    result = await session.execute(
        select(MessageReaction).where(MessageReaction.message_id == message_id)
    )
    return [ReactionOut.model_validate(r) for r in result.scalars().all()]
