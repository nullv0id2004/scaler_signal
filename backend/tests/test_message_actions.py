import pytest
from fastapi import HTTPException

from app.services import users as user_service
from app.services.conversations import create_conversation
from app.services.messages import create as create_message
from app.services.messages import delete as delete_message
from app.services.messages import forward as forward_message
from app.services.messages import history


@pytest.mark.asyncio
async def test_delete_by_sender_tombstones(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    msg = await create_message(session, alice, conv.id, content="oops")

    deleted = await delete_message(session, alice, msg.id)
    assert deleted.deleted_at is not None

    # history still returns it (as a tombstone)
    rows = await history(session, alice, conv.id)
    assert any(m.id == msg.id and m.deleted_at is not None for m in rows)


@pytest.mark.asyncio
async def test_delete_by_non_sender_forbidden(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    msg = await create_message(session, alice, conv.id, content="mine")

    with pytest.raises(HTTPException) as exc:
        await delete_message(session, bob, msg.id)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_delete_unknown_message_404(session, alice):
    with pytest.raises(HTTPException) as exc:
        await delete_message(session, alice, 999999)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_forward_copies_with_flag(session, alice, bob):
    src = await create_conversation(session, alice, "direct", [bob.id])
    msg = await create_message(session, alice, src.id, content="share me")
    target1 = await create_conversation(session, alice, "group", [bob.id], name="G1")
    target2 = await create_conversation(session, alice, "group", [bob.id], name="G2")

    created = await forward_message(session, alice, msg.id, [target1.id, target2.id])
    assert len(created) == 2
    for m, target in zip(created, [target1, target2]):
        assert m.conversation_id == target.id
        assert m.content == "share me"
        assert m.is_forwarded is True
        assert m.reply_to_message_id is None


@pytest.mark.asyncio
async def test_forward_to_non_member_conversation_forbidden(session, alice, bob):
    src = await create_conversation(session, alice, "direct", [bob.id])
    msg = await create_message(session, alice, src.id, content="hi")
    # a conversation alice is NOT part of (carol + bob)
    carol = await user_service.create(session, username="carol", display_name="Carol")
    await session.commit()
    other = await create_conversation(session, bob, "direct", [carol.id])

    with pytest.raises(HTTPException) as exc:
        await forward_message(session, alice, msg.id, [other.id])
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_forward_message_you_cannot_see_forbidden(session, alice, bob):
    carol = await user_service.create(session, username="carol", display_name="Carol")
    await session.commit()
    # message in a conversation alice is not a member of
    theirs = await create_conversation(session, bob, "direct", [carol.id])
    msg = await create_message(session, bob, theirs.id, content="secret")
    mine = await create_conversation(session, alice, "direct", [bob.id])

    with pytest.raises(HTTPException) as exc:
        await forward_message(session, alice, msg.id, [mine.id])
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_forward_deleted_message_400(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    msg = await create_message(session, alice, conv.id, content="gone")
    await delete_message(session, alice, msg.id)
    target = await create_conversation(session, alice, "group", [bob.id], name="T")

    with pytest.raises(HTTPException) as exc:
        await forward_message(session, alice, msg.id, [target.id])
    assert exc.value.status_code == 400
