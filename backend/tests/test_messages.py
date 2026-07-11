import pytest
from fastapi import HTTPException

from app.services.conversations import create_conversation
from app.services.messages import create, history, serialize


@pytest.mark.asyncio
async def test_create_and_history(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    m1 = await create(session, alice, conv.id, content="hello")
    m2 = await create(session, bob, conv.id, content="hi back")

    msgs = await history(session, alice, conv.id)
    assert [m.id for m in msgs] == [m2.id, m1.id]  # id desc (most recent first)


@pytest.mark.asyncio
async def test_create_non_member_forbidden(session, alice, bob):
    from app.services import users as user_service

    carol = await user_service.create(session, username="carol", display_name="Carol")
    await session.commit()

    conv = await create_conversation(session, alice, "direct", [bob.id])
    with pytest.raises(HTTPException) as exc:
        await create(session, carol, conv.id, content="intrude")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_history_cursor_pagination(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    ids = []
    for i in range(5):
        m = await create(session, alice, conv.id, content=f"msg {i}")
        ids.append(m.id)

    first_page = await history(session, alice, conv.id, limit=2)
    assert [m.id for m in first_page] == list(reversed(ids))[:2]

    second_page = await history(session, alice, conv.id, before=first_page[-1].id, limit=2)
    assert [m.id for m in second_page] == list(reversed(ids))[2:4]


@pytest.mark.asyncio
async def test_reply_to(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    m1 = await create(session, alice, conv.id, content="original")
    m2 = await create(session, bob, conv.id, content="reply", reply_to_id=m1.id)
    assert m2.reply_to_message_id == m1.id


@pytest.mark.asyncio
async def test_serialize_includes_reactions_and_reply_preview(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    m1 = await create(session, alice, conv.id, content="original")
    m2 = await create(session, bob, conv.id, content="reply", reply_to_id=m1.id)

    out = await serialize(session, m2)
    assert out.id == m2.id
    assert out.content == "reply"
    assert out.reply_to is not None
    assert out.reply_to.id == m1.id
    assert out.reply_to.sender_name == alice.display_name
    assert out.reactions == []
    assert out.attachment is None


async def _login(client, handle):
    r = await client.post("/api/auth/verify-otp", json={"handle": handle, "otp": "123456"})
    body = r.json()
    return body["token"], body["user"]


@pytest.mark.asyncio
async def test_http_post_message_and_history(client):
    token1, _ = await _login(client, "sender")
    _, user2 = await _login(client, "receiver")

    headers1 = {"Authorization": f"Bearer {token1}"}
    r = await client.post(
        "/api/conversations",
        json={"type": "direct", "member_ids": [user2["id"]]},
        headers=headers1,
    )
    conv_id = r.json()["id"]

    r = await client.post(
        "/api/messages",
        json={"conversation_id": conv_id, "content": "hello via rest"},
        headers=headers1,
    )
    assert r.status_code == 201
    assert r.json()["content"] == "hello via rest"

    r = await client.get(f"/api/conversations/{conv_id}/messages", headers=headers1)
    assert r.status_code == 200
    msgs = r.json()
    assert any(m["content"] == "hello via rest" for m in msgs)


@pytest.mark.asyncio
async def test_http_post_message_non_member_403(client):
    token1, _ = await _login(client, "a1")
    _, user2 = await _login(client, "a2")
    token3, _ = await _login(client, "a3")

    headers1 = {"Authorization": f"Bearer {token1}"}
    r = await client.post(
        "/api/conversations",
        json={"type": "direct", "member_ids": [user2["id"]]},
        headers=headers1,
    )
    conv_id = r.json()["id"]

    headers3 = {"Authorization": f"Bearer {token3}"}
    r = await client.post(
        "/api/messages",
        json={"conversation_id": conv_id, "content": "intrude"},
        headers=headers3,
    )
    assert r.status_code == 403
