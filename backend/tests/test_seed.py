import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

import app.seed as seed_module
from app.models import Conversation, ConversationMember, Message, User
from app.seed import seed


@pytest.fixture(autouse=True)
def _isolate_seed_uploads(tmp_path, monkeypatch):
    """seed()'s image attachment writes to app.seed.UPLOAD_DIR — point that
    at a temp dir during tests so runs don't litter the real backend/uploads/."""
    monkeypatch.setattr(seed_module, "UPLOAD_DIR", tmp_path)


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


@pytest.mark.asyncio
async def test_seed_phones_are_normalized(test_engine):
    """Seed users must be stored with normalized phones (no dashes) since
    otp.verify_otp matches against normalize_phone(input) -- a raw punctuated
    phone in the DB would never match and would spawn a duplicate account."""
    from app.services.phone import normalize_phone

    session_maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    await seed(engine_=test_engine, session_factory=session_maker)

    async with session_maker() as s:
        result = await s.execute(select(User).where(User.username == "alice"))
        alice = result.scalar_one()
        assert alice.phone == normalize_phone(alice.phone) == "+12025550111"


@pytest.mark.asyncio
async def test_seed_user_logs_in_via_punctuated_phone(test_engine):
    """End-to-end regression check: requesting/verifying an OTP for a seed
    user's phone (given in the docs' punctuated form) must resolve to the
    existing seeded user, not create a new one."""
    from app.services import otp as otp_service

    session_maker = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
    await seed(engine_=test_engine, session_factory=session_maker)

    async with session_maker() as s:
        result = await otp_service.request_otp(s, "+1-202-555-0111")
        code = result["dev_code"]
        user, is_new = await otp_service.verify_otp(s, "+1 (202) 555 0111", code)
        assert is_new is False
        assert user.username == "alice"
