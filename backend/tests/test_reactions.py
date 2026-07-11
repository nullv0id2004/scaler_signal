import pytest
from fastapi import HTTPException

from app.services.conversations import create_conversation
from app.services.messages import create as create_message
from app.services.reactions import toggle


@pytest.mark.asyncio
async def test_toggle_add_then_remove(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    msg = await create_message(session, alice, conv.id, content="hi")

    reactions = await toggle(session, bob, msg.id, "👍")
    assert len(reactions) == 1
    assert reactions[0].emoji == "👍"
    assert reactions[0].user_id == bob.id
    assert reactions[0].message_id == msg.id

    reactions = await toggle(session, bob, msg.id, "👍")
    assert reactions == []


@pytest.mark.asyncio
async def test_toggle_multiple_users_and_emojis(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    msg = await create_message(session, alice, conv.id, content="hi")

    await toggle(session, alice, msg.id, "👍")
    reactions = await toggle(session, bob, msg.id, "❤️")
    assert len(reactions) == 2
    emojis = {r.emoji for r in reactions}
    assert emojis == {"👍", "❤️"}


@pytest.mark.asyncio
async def test_toggle_non_member_forbidden(session, alice, bob):
    from app.services import users as user_service

    carol = await user_service.create(session, username="carol", display_name="Carol")
    await session.commit()

    conv = await create_conversation(session, alice, "direct", [bob.id])
    msg = await create_message(session, alice, conv.id, content="hi")

    with pytest.raises(HTTPException) as exc:
        await toggle(session, carol, msg.id, "👍")
    assert exc.value.status_code == 403
