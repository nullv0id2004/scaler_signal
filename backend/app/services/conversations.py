from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Conversation, ConversationMember, Message, User
from app.models.enums import ConversationType, MemberRole
from app.schemas.conversation import (
    ConversationMemberOut,
    ConversationSummaryOut,
    ConversationWithMembersOut,
)
from app.schemas.user import UserOut


async def get_members(session: AsyncSession, conversation_id: int) -> list[ConversationMember]:
    result = await session.execute(
        select(ConversationMember).where(ConversationMember.conversation_id == conversation_id)
    )
    return list(result.scalars().all())


async def get_member(
    session: AsyncSession, conversation_id: int, user_id: int
) -> ConversationMember | None:
    result = await session.execute(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )
    return result.scalar_one_or_none()


async def serialize_members(
    session: AsyncSession, conversation_id: int
) -> list[ConversationMemberOut]:
    """Load members of a conversation with their User embedded, matching the
    frontend's ConversationMember shape (members[].user)."""
    members = await get_members(session, conversation_id)
    if not members:
        return []

    user_ids = {m.user_id for m in members}
    users_result = await session.execute(select(User).where(User.id.in_(user_ids)))
    users_by_id = {u.id: u for u in users_result.scalars().all()}

    return [
        ConversationMemberOut(
            id=m.id,
            conversation_id=m.conversation_id,
            user_id=m.user_id,
            role=m.role,
            joined_at=m.joined_at,
            last_read_message_id=m.last_read_message_id,
            last_delivered_message_id=m.last_delivered_message_id,
            muted=m.muted,
            user=UserOut.model_validate(users_by_id[m.user_id])
            if m.user_id in users_by_id
            else None,
        )
        for m in members
    ]


async def _find_existing_direct(
    session: AsyncSession, user_a_id: int, user_b_id: int
) -> Conversation | None:
    """Find a direct conversation whose member set is exactly {a, b}."""
    result = await session.execute(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(
            Conversation.type == ConversationType.direct.value,
            ConversationMember.user_id == user_a_id,
        )
    )
    candidates = list(result.scalars().all())
    for conv in candidates:
        members = await get_members(session, conv.id)
        member_ids = {m.user_id for m in members}
        if member_ids == {user_a_id, user_b_id}:
            return conv
    return None


async def create_conversation(
    session: AsyncSession,
    creator,
    type: str,
    member_ids: list[int],
    name: str | None = None,
    avatar_url: str | None = None,
) -> Conversation:
    if type == ConversationType.direct.value:
        if len(member_ids) != 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Direct conversations need exactly one other member",
            )
        other_id = member_ids[0]
        existing = await _find_existing_direct(session, creator.id, other_id)
        if existing is not None:
            return existing

    conv = Conversation(type=type, name=name, avatar_url=avatar_url, created_by=creator.id)
    session.add(conv)
    await session.flush()

    all_member_ids = {creator.id, *member_ids}
    for uid in all_member_ids:
        role = MemberRole.admin.value if uid == creator.id else MemberRole.member.value
        session.add(ConversationMember(conversation_id=conv.id, user_id=uid, role=role))

    await session.commit()
    await session.refresh(conv)
    return conv


async def list_for_user(session: AsyncSession, user) -> list[ConversationSummaryOut]:
    from app.services.messages import serialize  # local import: avoid module cycle

    result = await session.execute(
        select(Conversation)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .where(ConversationMember.user_id == user.id)
    )
    convs = list(result.scalars().all())

    summaries: list[ConversationSummaryOut] = []
    for conv in convs:
        member = await get_member(session, conv.id, user.id)

        last_msg_result = await session.execute(
            select(Message)
            .where(Message.conversation_id == conv.id)
            .order_by(Message.id.desc())
            .limit(1)
        )
        last_message = last_msg_result.scalar_one_or_none()

        read_ptr = member.last_read_message_id if member else None
        count_stmt = select(Message).where(Message.conversation_id == conv.id)
        if read_ptr is not None:
            count_stmt = count_stmt.where(Message.id > read_ptr)
        count_result = await session.execute(count_stmt)
        unread_count = len(list(count_result.scalars().all()))

        last_message_out = await serialize(session, last_message) if last_message else None
        members_out = await serialize_members(session, conv.id)

        summaries.append(
            ConversationSummaryOut(
                id=conv.id,
                type=conv.type,
                name=conv.name,
                avatar_url=conv.avatar_url,
                created_by=conv.created_by,
                created_at=conv.created_at,
                members=members_out,
                last_message=last_message_out,
                unread_count=unread_count,
            )
        )

    summaries.sort(
        key=lambda s: s.last_message.created_at if s.last_message else s.created_at,
        reverse=True,
    )
    return summaries


async def get_with_members(
    session: AsyncSession, conversation_id: int, user
) -> ConversationWithMembersOut:
    conv_result = await session.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    member = await get_member(session, conversation_id, user.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this conversation"
        )

    members_out = await serialize_members(session, conversation_id)
    return ConversationWithMembersOut(
        id=conv.id,
        type=conv.type,
        name=conv.name,
        avatar_url=conv.avatar_url,
        created_by=conv.created_by,
        created_at=conv.created_at,
        members=members_out,
    )


async def update_conversation(
    session: AsyncSession,
    conversation_id: int,
    user,
    name: str | None = None,
    avatar_url: str | None = None,
) -> Conversation:
    conv_result = await session.execute(
        select(Conversation).where(Conversation.id == conversation_id)
    )
    conv = conv_result.scalar_one_or_none()
    if conv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")

    member = await get_member(session, conversation_id, user.id)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this conversation"
        )
    if member.role != MemberRole.admin.value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    if name is not None:
        conv.name = name
    if avatar_url is not None:
        conv.avatar_url = avatar_url

    await session.commit()
    await session.refresh(conv)
    return conv
