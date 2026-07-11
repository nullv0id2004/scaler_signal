import pytest

from app.models import User, Conversation, ConversationMember, Message


@pytest.mark.asyncio
async def test_create_message_chain(session):
    u = User(username="alice", display_name="Alice")
    session.add(u)
    await session.flush()

    c = Conversation(type="direct", created_by=u.id)
    session.add(c)
    await session.flush()

    session.add(ConversationMember(conversation_id=c.id, user_id=u.id, role="admin"))

    m = Message(conversation_id=c.id, sender_id=u.id, type="text", content="hi")
    session.add(m)
    await session.commit()

    assert m.id and m.created_at is not None
