import pytest

from app.services.conversations import create_conversation, get_members
from app.services.messages import create as create_message
from app.services.receipts import mark_delivered, mark_read, status_for


@pytest.mark.asyncio
async def test_mark_read_advances_pointer(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    m1 = await create_message(session, alice, conv.id, content="one")
    m2 = await create_message(session, alice, conv.id, content="two")

    member = await mark_read(session, bob, conv.id, m1.id)
    assert member.last_read_message_id == m1.id

    member = await mark_read(session, bob, conv.id, m2.id)
    assert member.last_read_message_id == m2.id


@pytest.mark.asyncio
async def test_mark_read_never_regresses(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    m1 = await create_message(session, alice, conv.id, content="one")
    m2 = await create_message(session, alice, conv.id, content="two")

    await mark_read(session, bob, conv.id, m2.id)
    member = await mark_read(session, bob, conv.id, m1.id)
    assert member.last_read_message_id == m2.id


@pytest.mark.asyncio
async def test_mark_delivered_never_regresses(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    m1 = await create_message(session, alice, conv.id, content="one")
    m2 = await create_message(session, alice, conv.id, content="two")

    await mark_delivered(session, bob, conv.id, m2.id)
    member = await mark_delivered(session, bob, conv.id, m1.id)
    assert member.last_delivered_message_id == m2.id


@pytest.mark.asyncio
async def test_status_for_derivation(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    m1 = await create_message(session, alice, conv.id, content="one")

    members = await get_members(session, conv.id)
    assert status_for(m1, members) == "sent"

    await mark_delivered(session, bob, conv.id, m1.id)
    members = await get_members(session, conv.id)
    assert status_for(m1, members) == "delivered"

    await mark_read(session, bob, conv.id, m1.id)
    members = await get_members(session, conv.id)
    assert status_for(m1, members) == "read"
