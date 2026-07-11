from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ConversationMember, Message


async def mark_read(
    session: AsyncSession, user, conversation_id: int, message_id: int
) -> ConversationMember:
    """Advance the caller's read pointer to message_id, monotonically (never
    moves backward). Also bumps the delivered pointer, since a read implies
    delivery."""
    from app.services.conversations import get_member

    member = await get_member(session, conversation_id, user.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this conversation"
        )

    if member.last_read_message_id is None or message_id > member.last_read_message_id:
        member.last_read_message_id = message_id
    if member.last_delivered_message_id is None or message_id > member.last_delivered_message_id:
        member.last_delivered_message_id = message_id

    await session.commit()
    await session.refresh(member)
    return member


async def mark_delivered(
    session: AsyncSession, user, conversation_id: int, message_id: int
) -> ConversationMember:
    """Advance the caller's delivered pointer to message_id, monotonically
    (never moves backward)."""
    from app.services.conversations import get_member

    member = await get_member(session, conversation_id, user.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this conversation"
        )

    if member.last_delivered_message_id is None or message_id > member.last_delivered_message_id:
        member.last_delivered_message_id = message_id

    await session.commit()
    await session.refresh(member)
    return member


def status_for(message: Message, members: list[ConversationMember]) -> str:
    """Derive 'sent'|'delivered'|'read' from the min pointer across every
    OTHER member of the conversation (excludes the sender)."""
    others = [m for m in members if m.user_id != message.sender_id]
    if not others:
        return "sent"

    if all(
        m.last_read_message_id is not None and m.last_read_message_id >= message.id
        for m in others
    ):
        return "read"
    if all(
        m.last_delivered_message_id is not None and m.last_delivered_message_id >= message.id
        for m in others
    ):
        return "delivered"
    return "sent"
