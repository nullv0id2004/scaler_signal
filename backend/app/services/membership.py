from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ConversationMember
from app.models.enums import MemberRole, MessageType
from app.services import conversations as conversation_service
from app.services import messages as message_service
from app.services import users as user_service


async def _require_admin(
    session: AsyncSession, conversation_id: int, actor
) -> ConversationMember:
    member = await conversation_service.get_member(session, conversation_id, actor.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this conversation"
        )
    if member.role != MemberRole.admin.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return member


async def add_members(
    session: AsyncSession, conversation_id: int, actor, user_ids: list[int]
) -> list[ConversationMember]:
    """Admin-only. Adds each user_id not already a member, emitting a
    'X added Y' system message per user actually added."""
    await _require_admin(session, conversation_id, actor)

    added: list[ConversationMember] = []
    for uid in user_ids:
        existing = await conversation_service.get_member(session, conversation_id, uid)
        if existing is not None:
            continue

        member = ConversationMember(
            conversation_id=conversation_id, user_id=uid, role=MemberRole.member.value
        )
        session.add(member)
        await session.flush()
        added.append(member)

        target = await user_service.get_by_id(session, uid)
        target_name = target.display_name if target else str(uid)
        await message_service.create(
            session,
            actor,
            conversation_id,
            content=f"{actor.display_name} added {target_name}",
            type=MessageType.system.value,
        )

    await session.commit()
    for m in added:
        await session.refresh(m)
    return added


async def remove_member(
    session: AsyncSession, conversation_id: int, actor, user_id: int
) -> None:
    """Admin-only. Removes a member, emitting a 'X removed Y' system message."""
    await _require_admin(session, conversation_id, actor)

    member = await conversation_service.get_member(session, conversation_id, user_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    target = await user_service.get_by_id(session, user_id)
    target_name = target.display_name if target else str(user_id)
    await message_service.create(
        session,
        actor,
        conversation_id,
        content=f"{actor.display_name} removed {target_name}",
        type=MessageType.system.value,
    )

    await session.delete(member)
    await session.commit()


async def set_role(
    session: AsyncSession, conversation_id: int, actor, user_id: int, role: str
) -> ConversationMember:
    """Admin-only. Changes a member's role."""
    await _require_admin(session, conversation_id, actor)

    member = await conversation_service.get_member(session, conversation_id, user_id)
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    member.role = role
    await session.commit()
    await session.refresh(member)
    return member


async def leave(session: AsyncSession, conversation_id: int, actor) -> None:
    """Any member may leave, emitting a 'X left' system message before their
    membership row is removed (so the message send path still sees them as a
    member)."""
    member = await conversation_service.get_member(session, conversation_id, actor.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this conversation"
        )

    await message_service.create(
        session,
        actor,
        conversation_id,
        content=f"{actor.display_name} left",
        type=MessageType.system.value,
    )

    await session.delete(member)
    await session.commit()
