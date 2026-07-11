"""Seed script — populates the demo dataset described in docs/SEED_USERS.md.

Run as a module from backend/:

    python -m app.seed

Idempotent: wipes (drop_all) and recreates (create_all) every table against
the configured database (Settings.database_url / $DATABASE_URL) before
inserting, so re-running is always safe.
"""

from __future__ import annotations

import asyncio
import io
import random
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.db import Base, async_session as default_session_factory, engine as default_engine
from app.models import (
    Attachment,
    Conversation,
    ConversationMember,
    Message,
    MessageReaction,
    User,
)
from app.models.enums import MemberRole, MessageType

# backend/uploads — anchored on this file's location (app/seed.py -> app/ ->
# backend/) so it's correct regardless of the process's cwd, matching
# api/uploads.py's UPLOAD_DIR.
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"

# username, display_name, phone — exact per docs/SEED_USERS.md
USERS: list[tuple[str, str, str]] = [
    ("alice", "Alice Carter", "+1-202-555-0111"),
    ("bob", "Bob Nguyen", "+1-202-555-0112"),
    ("carol", "Carol Diaz", "+1-202-555-0113"),
    ("david", "David Osei", "+1-202-555-0114"),
    ("emma", "Emma Ford", "+1-202-555-0115"),
    ("frank", "Frank Lee", "+1-202-555-0116"),
    ("grace", "Grace Kim", "+1-202-555-0117"),
]

SAMPLE_LINES = [
    "Hey, how's it going?",
    "Are we still on for this weekend?",
    "Just sent over the details.",
    "Sounds good to me!",
    "Can you send me the link?",
    "Running a few minutes late.",
    "Thanks for that!",
    "What time works for everyone?",
    "I'll take care of it.",
    "Let's sync up tomorrow.",
    "Great idea!",
    "No worries at all.",
    "Did you see the update?",
    "I'm in.",
    "Let me check and get back to you.",
    "That works for me.",
    "See you there!",
    "On my way.",
    "Can't wait!",
    "Perfect, thanks.",
    "Haha, classic.",
    "Let's do it.",
    "Appreciate you!",
    "One sec, checking now.",
]

REACTIONS = ["👍", "❤️", "😂", "🎉", "🔥"]

# Deterministic-ish demo data: fixed seed so re-running produces a stable
# (though not identical-to-real-life) dataset rather than something that
# shuffles wildly run to run.
random.seed(20260711)


async def _wipe_and_recreate(engine_: AsyncEngine) -> None:
    async with engine_.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)


async def _create_users(session: AsyncSession) -> dict[str, User]:
    users: dict[str, User] = {}
    for username, display_name, phone in USERS:
        user = User(username=username, display_name=display_name, phone=phone)
        session.add(user)
        users[username] = user
    await session.flush()
    return users


async def _create_conversation(
    session: AsyncSession,
    type_: str,
    creator: User,
    member_users: list[User],
    name: str | None = None,
) -> Conversation:
    """member_users must include the creator; creator gets role=admin."""
    conv = Conversation(type=type_, name=name, created_by=creator.id)
    session.add(conv)
    await session.flush()
    for user in member_users:
        role = MemberRole.admin.value if user.id == creator.id else MemberRole.member.value
        session.add(ConversationMember(conversation_id=conv.id, user_id=user.id, role=role))
    await session.flush()
    return conv


def _placeholder_image_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (640, 480), color=(44, 107, 237)).save(buf, format="PNG")
    return buf.getvalue()


async def _seed_messages(
    session: AsyncSession,
    conv: Conversation,
    senders: list[User],
    count: int,
    start_time: datetime,
    with_image_from: User | None = None,
) -> list[Message]:
    """Insert `count` staggered text messages (some replies, some reactions),
    optionally followed by one image message/attachment. Returns messages in
    chronological (oldest-first) order."""
    messages: list[Message] = []
    t = start_time
    for i in range(count):
        sender = senders[i % len(senders)]
        t = t + timedelta(minutes=random.randint(3, 45))
        reply_to_id = None
        if messages and random.random() < 0.2:
            reply_to_id = random.choice(messages).id

        msg = Message(
            conversation_id=conv.id,
            sender_id=sender.id,
            type=MessageType.text.value,
            content=random.choice(SAMPLE_LINES),
            reply_to_message_id=reply_to_id,
            created_at=t,
        )
        session.add(msg)
        await session.flush()
        messages.append(msg)

        if random.random() < 0.25:
            reactor = random.choice(senders)
            session.add(
                MessageReaction(
                    message_id=msg.id, user_id=reactor.id, emoji=random.choice(REACTIONS)
                )
            )

    if with_image_from is not None:
        t = t + timedelta(minutes=random.randint(3, 20))
        image_bytes = _placeholder_image_bytes()
        stored_name = f"seed-{conv.id}-{uuid.uuid4().hex}.png"
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        (UPLOAD_DIR / stored_name).write_bytes(image_bytes)

        img_msg = Message(
            conversation_id=conv.id,
            sender_id=with_image_from.id,
            type=MessageType.image.value,
            content=None,
            created_at=t,
        )
        session.add(img_msg)
        await session.flush()
        session.add(
            Attachment(
                message_id=img_msg.id,
                url=f"/uploads/{stored_name}",
                filename="trip-photo.png",
                mime_type="image/png",
                size_bytes=len(image_bytes),
                width=640,
                height=480,
            )
        )
        messages.append(img_msg)

    await session.flush()
    return messages


async def _set_read_pointers(
    session: AsyncSession, conv: Conversation, pointers: dict[int, int | None]
) -> None:
    """pointers: user_id -> message_id both read+delivered pointers should
    advance to (None leaves everything in the conversation unread)."""
    result = await session.execute(
        select(ConversationMember).where(ConversationMember.conversation_id == conv.id)
    )
    members_by_user = {m.user_id: m for m in result.scalars().all()}
    for user_id, msg_id in pointers.items():
        member = members_by_user[user_id]
        member.last_read_message_id = msg_id
        member.last_delivered_message_id = msg_id
    await session.flush()


async def seed(
    engine_: AsyncEngine | None = None,
    session_factory: async_sessionmaker[AsyncSession] | None = None,
) -> None:
    """Wipe, recreate, and populate the full demo dataset.

    `engine_`/`session_factory` are overridable so tests can point this at
    an isolated test database instead of the configured production one.
    """
    engine_ = engine_ or default_engine
    session_factory = session_factory or default_session_factory

    await _wipe_and_recreate(engine_)

    async with session_factory() as session:
        users = await _create_users(session)
        alice, bob, carol, david, emma, frank, grace = (
            users["alice"],
            users["bob"],
            users["carol"],
            users["david"],
            users["emma"],
            users["frank"],
            users["grace"],
        )

        now = datetime.now(timezone.utc)
        base = now - timedelta(days=4)

        # --- 3 direct conversations ---
        conv_ab = await _create_conversation(session, "direct", alice, [alice, bob])
        conv_ac = await _create_conversation(session, "direct", alice, [alice, carol])
        conv_be = await _create_conversation(session, "direct", bob, [bob, emma])

        # --- 2 groups (alice admin of Weekend Trip, frank admin of Project X) ---
        weekend = await _create_conversation(
            session, "group", alice, [alice, bob, carol, emma], name="Weekend Trip"
        )
        project_x = await _create_conversation(
            session, "group", frank, [frank, david, grace, alice], name="Project X"
        )

        # --- messages: ~15-30/conversation, staggered timestamps, replies,
        # reactions; one image attachment in Alice<->Bob ---
        msgs_ab = await _seed_messages(
            session, conv_ab, [alice, bob], 22, base, with_image_from=alice
        )
        msgs_ac = await _seed_messages(
            session, conv_ac, [alice, carol], 18, base + timedelta(hours=2)
        )
        msgs_be = await _seed_messages(
            session, conv_be, [bob, emma], 16, base + timedelta(hours=5)
        )
        msgs_weekend = await _seed_messages(
            session, weekend, [alice, bob, carol, emma], 28, base + timedelta(hours=1)
        )
        msgs_projectx = await _seed_messages(
            session, project_x, [frank, david, grace, alice], 24, base + timedelta(hours=3)
        )

        # --- mixed read/delivered pointers so unread badges show immediately ---
        await _set_read_pointers(
            session, conv_ab, {alice.id: msgs_ab[-1].id, bob.id: msgs_ab[-1].id}
        )
        await _set_read_pointers(
            session, conv_ac, {alice.id: msgs_ac[-1].id, carol.id: msgs_ac[-3].id}
        )
        await _set_read_pointers(
            session, conv_be, {bob.id: msgs_be[-1].id, emma.id: msgs_be[-1].id}
        )
        await _set_read_pointers(
            session,
            weekend,
            {
                alice.id: msgs_weekend[-1].id,
                bob.id: msgs_weekend[-1].id,
                carol.id: msgs_weekend[-4].id,
                emma.id: msgs_weekend[-1].id,
            },
        )
        # grace: read pointer parked mid-history -> unread badge shows on load
        await _set_read_pointers(
            session,
            project_x,
            {
                frank.id: msgs_projectx[-1].id,
                david.id: msgs_projectx[-1].id,
                grace.id: msgs_projectx[len(msgs_projectx) // 2].id,
                alice.id: msgs_projectx[-1].id,
            },
        )

        await session.commit()

    print("Seed complete: 7 users, 3 direct conversations, 2 groups.")


if __name__ == "__main__":
    asyncio.run(seed())
