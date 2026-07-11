import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.models import Conversation, ConversationMember, Message, User
from app.seed import seed


@pytest.mark.asyncio
async def test_seed_populates_expected_dataset(test_engine):
    session_maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    await seed(engine_=test_engine, session_factory=session_maker)

    async with session_maker() as s:
        # 7 users, exact usernames
        result = await s.execute(select(User))
        users = list(result.scalars().all())
        assert len(users) == 7
        assert {u.username for u in users} == {
            "alice",
            "bob",
            "carol",
            "david",
            "emma",
            "frank",
            "grace",
        }

        # alice is admin of "Weekend Trip"
        result = await s.execute(select(Conversation).where(Conversation.name == "Weekend Trip"))
        weekend = result.scalar_one()
        alice = next(u for u in users if u.username == "alice")
        result = await s.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == weekend.id,
                ConversationMember.user_id == alice.id,
            )
        )
        alice_membership = result.scalar_one()
        assert alice_membership.role == "admin"

        # frank is admin of "Project X"
        result = await s.execute(select(Conversation).where(Conversation.name == "Project X"))
        project_x = result.scalar_one()
        frank = next(u for u in users if u.username == "frank")
        result = await s.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == project_x.id,
                ConversationMember.user_id == frank.id,
            )
        )
        frank_membership = result.scalar_one()
        assert frank_membership.role == "admin"

        # 3 directs + 2 groups
        result = await s.execute(select(Conversation))
        convs = list(result.scalars().all())
        assert len(convs) == 5
        assert sum(1 for c in convs if c.type == "direct") == 3
        assert sum(1 for c in convs if c.type == "group") == 2

        # grace has at least one conversation with unread messages
        grace = next(u for u in users if u.username == "grace")
        result = await s.execute(
            select(ConversationMember).where(ConversationMember.user_id == grace.id)
        )
        grace_memberships = list(result.scalars().all())
        assert grace_memberships  # grace is in at least one conversation

        found_unread = False
        for member in grace_memberships:
            count_stmt = select(func.count()).select_from(Message).where(
                Message.conversation_id == member.conversation_id
            )
            if member.last_read_message_id is not None:
                count_stmt = count_stmt.where(Message.id > member.last_read_message_id)
            unread_count = (await s.execute(count_stmt)).scalar_one()
            if unread_count > 0:
                found_unread = True
        assert found_unread

        # message volume sanity: ~15-30 per conversation across 5 conversations
        result = await s.execute(select(func.count()).select_from(Message))
        total_messages = result.scalar_one()
        assert total_messages >= 5 * 15


@pytest.mark.asyncio
async def test_seed_is_idempotent(test_engine):
    session_maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)

    await seed(engine_=test_engine, session_factory=session_maker)
    await seed(engine_=test_engine, session_factory=session_maker)

    async with session_maker() as s:
        result = await s.execute(select(User))
        assert len(list(result.scalars().all())) == 7
