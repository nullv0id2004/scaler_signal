import pytest
from fastapi import HTTPException

from app.services.conversations import create_conversation, get_with_members, list_for_user
from app.services.messages import create as create_message


@pytest.mark.asyncio
async def test_direct_dedup(session, alice, bob):
    c1 = await create_conversation(session, alice, "direct", [bob.id])
    c2 = await create_conversation(session, alice, "direct", [bob.id])
    assert c1.id == c2.id


@pytest.mark.asyncio
async def test_direct_dedup_symmetric(session, alice, bob):
    c1 = await create_conversation(session, alice, "direct", [bob.id])
    c2 = await create_conversation(session, bob, "direct", [alice.id])
    assert c1.id == c2.id


@pytest.mark.asyncio
async def test_group_conversation_not_deduped(session, alice, bob):
    c1 = await create_conversation(session, alice, "group", [bob.id], name="Group 1")
    c2 = await create_conversation(session, alice, "group", [bob.id], name="Group 2")
    assert c1.id != c2.id


@pytest.mark.asyncio
async def test_list_for_user_includes_unread_count(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    await create_message(session, bob, conv.id, content="hi alice")
    await create_message(session, bob, conv.id, content="you there?")

    summaries = await list_for_user(session, alice)
    assert len(summaries) == 1
    assert summaries[0].unread_count == 2
    assert summaries[0].last_message is not None
    assert summaries[0].last_message.content == "you there?"


@pytest.mark.asyncio
async def test_get_with_members_forbidden_for_non_member(session, alice, bob):
    from app.services import users as user_service

    carol = await user_service.create(session, username="carol", display_name="Carol")
    await session.commit()

    conv = await create_conversation(session, alice, "direct", [bob.id])

    with pytest.raises(HTTPException) as exc:
        await get_with_members(session, conv.id, carol)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_get_with_members_returns_members(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    result = await get_with_members(session, conv.id, alice)
    assert result.id == conv.id
    assert {m.user_id for m in result.members} == {alice.id, bob.id}

    # Each member has its User embedded (frontend resolves direct-chat name/
    # avatar from members[].user).
    by_user_id = {m.user_id: m for m in result.members}
    assert by_user_id[alice.id].user is not None
    assert by_user_id[alice.id].user.username == alice.username
    assert by_user_id[bob.id].user is not None
    assert by_user_id[bob.id].user.username == bob.username
    assert all(m.conversation_id == conv.id for m in result.members)


@pytest.mark.asyncio
async def test_list_for_user_includes_members_with_embedded_user(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    await create_message(session, bob, conv.id, content="hi alice")

    summaries = await list_for_user(session, alice)
    assert len(summaries) == 1
    members = summaries[0].members
    assert {m.user_id for m in members} == {alice.id, bob.id}
    by_user_id = {m.user_id: m for m in members}
    assert by_user_id[bob.id].user is not None
    assert by_user_id[bob.id].user.display_name == bob.display_name


def _phone_for(handle: str) -> str:
    """Deterministic fake phone number for a test handle (real OTP login now
    requires a phone, not an arbitrary handle string)."""
    import hashlib

    digits = str(int(hashlib.sha256(handle.encode()).hexdigest(), 16) % 10**10).zfill(10)
    return f"+1{digits}"


async def _login(client, handle):
    phone = _phone_for(handle)
    r = await client.post("/api/auth/request-otp", json={"phone": phone})
    dev_code = r.json()["dev_code"]
    r = await client.post("/api/auth/verify-otp", json={"phone": phone, "code": dev_code})
    body = r.json()
    return body["token"], body["user"]


@pytest.mark.asyncio
async def test_http_create_and_list_conversations(client):
    alice_token, alice_user = await _login(client, "alice_h")
    _, bob_user = await _login(client, "bob_h")

    headers = {"Authorization": f"Bearer {alice_token}"}
    r = await client.post(
        "/api/conversations",
        json={"type": "direct", "member_ids": [bob_user["id"]]},
        headers=headers,
    )
    assert r.status_code == 201
    conv_id = r.json()["id"]

    r = await client.get("/api/conversations", headers=headers)
    assert r.status_code == 200
    convs = r.json()
    assert any(c["id"] == conv_id for c in convs)

    summary = next(c for c in convs if c["id"] == conv_id)
    assert "members" in summary
    member_user_ids = {m["user_id"] for m in summary["members"]}
    assert member_user_ids == {alice_user["id"], bob_user["id"]}
    assert all(m.get("user") is not None for m in summary["members"])
    assert all(m["user"]["username"] for m in summary["members"])


@pytest.mark.asyncio
async def test_http_get_conversation_403_for_non_member(client):
    token1, _ = await _login(client, "u1")
    _, user2 = await _login(client, "u2")
    token3, _ = await _login(client, "u3")

    headers1 = {"Authorization": f"Bearer {token1}"}
    r = await client.post(
        "/api/conversations",
        json={"type": "direct", "member_ids": [user2["id"]]},
        headers=headers1,
    )
    conv_id = r.json()["id"]

    headers3 = {"Authorization": f"Bearer {token3}"}
    r = await client.get(f"/api/conversations/{conv_id}", headers=headers3)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_http_patch_group_conversation_name(client):
    token1, _ = await _login(client, "admin1")
    _, user2 = await _login(client, "member1")

    headers1 = {"Authorization": f"Bearer {token1}"}
    r = await client.post(
        "/api/conversations",
        json={"type": "group", "member_ids": [user2["id"]], "name": "Old Name"},
        headers=headers1,
    )
    conv_id = r.json()["id"]

    r = await client.patch(
        f"/api/conversations/{conv_id}", json={"name": "New Name"}, headers=headers1
    )
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"
