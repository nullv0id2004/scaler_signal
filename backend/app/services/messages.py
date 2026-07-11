from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Attachment, Message, MessageReaction, User
from app.models.enums import MessageType
from app.schemas.message import AttachmentOut, MessageOut, ReactionOut, ReplyPreviewOut


async def _assert_member(session: AsyncSession, conversation_id: int, user_id: int) -> None:
    from app.services.conversations import get_member

    member = await get_member(session, conversation_id, user_id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this conversation"
        )


async def create(
    session: AsyncSession,
    sender,
    conversation_id: int,
    content: str | None = None,
    reply_to_id: int | None = None,
    type: str = MessageType.text.value,
    attachment: dict | None = None,
) -> Message:
    """Create a message. Shared send path for both REST and WS.

    Asserts sender is a member of the conversation (403 otherwise).
    """
    await _assert_member(session, conversation_id, sender.id)

    message = Message(
        conversation_id=conversation_id,
        sender_id=sender.id,
        type=type,
        content=content,
        reply_to_message_id=reply_to_id,
    )
    session.add(message)
    await session.flush()

    if attachment:
        session.add(
            Attachment(
                message_id=message.id,
                url=attachment["url"],
                filename=attachment["filename"],
                mime_type=attachment["mime_type"],
                size_bytes=attachment["size_bytes"],
                width=attachment.get("width"),
                height=attachment.get("height"),
            )
        )

    await session.commit()
    await session.refresh(message)
    return message


async def history(
    session: AsyncSession,
    user,
    conversation_id: int,
    before: int | None = None,
    limit: int = 30,
) -> list[Message]:
    """Cursor-paginated history, newest first (id desc), excludes nothing hard
    (soft-deleted messages are returned as tombstones for the client to render)."""
    await _assert_member(session, conversation_id, user.id)

    stmt = select(Message).where(Message.conversation_id == conversation_id)
    if before is not None:
        stmt = stmt.where(Message.id < before)
    stmt = stmt.order_by(Message.id.desc()).limit(limit)

    result = await session.execute(stmt)
    return list(result.scalars().all())


async def serialize(session: AsyncSession, message: Message) -> MessageOut:
    """Serialize a Message ORM row into the wire MessageOut shape, including
    reactions, attachment, and a reply preview. Shared by REST and WS."""
    reactions_result = await session.execute(
        select(MessageReaction).where(MessageReaction.message_id == message.id)
    )
    reactions = [ReactionOut.model_validate(r) for r in reactions_result.scalars().all()]

    attachment_result = await session.execute(
        select(Attachment).where(Attachment.message_id == message.id)
    )
    attachment_row = attachment_result.scalar_one_or_none()
    attachment_out = AttachmentOut.model_validate(attachment_row) if attachment_row else None

    reply_to = None
    if message.reply_to_message_id is not None:
        reply_result = await session.execute(
            select(Message).where(Message.id == message.reply_to_message_id)
        )
        reply_msg = reply_result.scalar_one_or_none()
        if reply_msg is not None:
            sender_result = await session.execute(
                select(User).where(User.id == reply_msg.sender_id)
            )
            reply_sender = sender_result.scalar_one_or_none()
            reply_to = ReplyPreviewOut(
                id=reply_msg.id,
                sender_id=reply_msg.sender_id,
                sender_name=reply_sender.display_name if reply_sender else None,
                content=reply_msg.content,
                type=reply_msg.type,
            )

    return MessageOut(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        type=message.type,
        content=message.content,
        reply_to_message_id=message.reply_to_message_id,
        reply_to=reply_to,
        created_at=message.created_at,
        edited_at=message.edited_at,
        deleted_at=message.deleted_at,
        reactions=reactions,
        attachment=attachment_out,
    )
