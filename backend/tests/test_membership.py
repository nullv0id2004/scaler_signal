import pytest
from fastapi import HTTPException

from app.services.conversations import create_conversation, get_member, get_members
from app.services.membership import add_members, leave, remove_member, set_role
from app.services.messages import history


@pytest.mark.asyncio
async def test_admin_add_member(session, alice, bob):
    from app.services import users as user_service

    carol = await user_service.create(session, username="carol", display_name="Carol")
    await session.commit()

    conv = await create_conversation(session, alice, "group", [bob.id], name="Trip")
    before_count = len(await get_members(session, conv.id))

    added = await add_members(session, conv.id, alice, [carol.id])
    assert len(added) == 1
    assert added[0].user_id == carol.id

    after_count = len(await get_members(session, conv.id))
    assert after_count == before_count + 1

    msgs = await history(session, alice, conv.id)
    assert any(m.type == "system" and "added" in (m.content or "") for m in msgs)


@pytest.mark.asyncio
async def test_non_admin_add_member_forbidden(session, alice, bob):
    from app.services import users as user_service

    carol = await user_service.create(session, username="carol", display_name="Carol")
    await session.commit()

    conv = await create_conversation(session, alice, "group", [bob.id], name="Trip")

    with pytest.raises(HTTPException) as exc:
        await add_members(session, conv.id, bob, [carol.id])
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_remove_member_emits_system_message(session, alice, bob):
    conv = await create_conversation(session, alice, "group", [bob.id], name="Trip")

    await remove_member(session, conv.id, alice, bob.id)

    member = await get_member(session, conv.id, bob.id)
    assert member is None

    msgs = await history(session, alice, conv.id)
    assert any(m.type == "system" and "removed" in (m.content or "") for m in msgs)


@pytest.mark.asyncio
async def test_non_admin_remove_forbidden(session, alice, bob):
    conv = await create_conversation(session, alice, "group", [bob.id], name="Trip")
    with pytest.raises(HTTPException) as exc:
        await remove_member(session, conv.id, bob, alice.id)
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_set_role(session, alice, bob):
    conv = await create_conversation(session, alice, "group", [bob.id], name="Trip")
    member = await set_role(session, conv.id, alice, bob.id, "admin")
    assert member.role == "admin"


@pytest.mark.asyncio
async def test_leave_emits_system_message_and_removes_member(session, alice, bob):
    conv = await create_conversation(session, alice, "group", [bob.id], name="Trip")

    await leave(session, conv.id, bob)

    member = await get_member(session, conv.id, bob.id)
    assert member is None

    msgs = await history(session, alice, conv.id)
    assert any(m.type == "system" and "left" in (m.content or "") for m in msgs)


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
async def test_http_membership_flow(client):
    admin_token, admin_user = await _login(client, "admin_h")
    member_token, member_user = await _login(client, "member_h")
    _, third_user = await _login(client, "third_h")

    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    r = await client.post(
        "/api/conversations",
        json={"type": "group", "member_ids": [member_user["id"]], "name": "Group"},
        headers=admin_headers,
    )
    conv_id = r.json()["id"]

    r = await client.post(
        f"/api/conversations/{conv_id}/members",
        json={"user_ids": [third_user["id"]]},
        headers=admin_headers,
    )
    assert r.status_code == 200
    assert any(m["user_id"] == third_user["id"] for m in r.json())

    member_headers = {"Authorization": f"Bearer {member_token}"}
    r = await client.delete(
        f"/api/conversations/{conv_id}/members/{third_user['id']}", headers=member_headers
    )
    assert r.status_code == 403

    r = await client.delete(
        f"/api/conversations/{conv_id}/members/{third_user['id']}", headers=admin_headers
    )
    assert r.status_code == 200

    r = await client.post(f"/api/conversations/{conv_id}/leave", headers=member_headers)
    assert r.status_code == 200
