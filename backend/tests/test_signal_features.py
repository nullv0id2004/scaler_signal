from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.services.conversations import create_conversation, get_member, set_chat_color, set_disappearing
from app.services.messages import create as create_message, history, media

# --- disappearing messages -------------------------------------------------


@pytest.mark.asyncio
async def test_create_sets_expires_at_when_disappearing_enabled(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    await set_disappearing(session, conv.id, alice, 3600)

    msg = await create_message(session, alice, conv.id, content="poof soon")
    assert msg.expires_at is not None
    delta = msg.expires_at - msg.created_at
    assert abs(delta.total_seconds() - 3600) < 2


@pytest.mark.asyncio
async def test_create_leaves_expires_at_null_when_disabled(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    msg = await create_message(session, alice, conv.id, content="sticks around")
    assert msg.expires_at is None


@pytest.mark.asyncio
async def test_history_excludes_past_expiry_messages(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    kept = await create_message(session, alice, conv.id, content="kept")
    expired = await create_message(session, alice, conv.id, content="gone")

    expired.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    await session.commit()

    msgs = await history(session, alice, conv.id)
    ids = {m.id for m in msgs}
    assert kept.id in ids
    assert expired.id not in ids


@pytest.mark.asyncio
async def test_set_disappearing_emits_system_message_and_persists(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    updated_conv, sys_msg = await set_disappearing(session, conv.id, alice, 86400)

    assert updated_conv.disappearing_seconds == 86400
    assert sys_msg.type == "system"
    assert "1 day" in sys_msg.content

    updated_conv2, sys_msg2 = await set_disappearing(session, conv.id, alice, None)
    assert updated_conv2.disappearing_seconds is None
    assert "off" in sys_msg2.content.lower()


@pytest.mark.asyncio
async def test_set_disappearing_non_member_forbidden(session, alice, bob):
    from app.services import users as user_service

    carol = await user_service.create(session, username="carol_dis", display_name="Carol")
    await session.commit()

    conv = await create_conversation(session, alice, "direct", [bob.id])
    with pytest.raises(HTTPException) as exc:
        await set_disappearing(session, conv.id, carol, 60)
    assert exc.value.status_code == 403


# --- media split -------------------------------------------------------


@pytest.mark.asyncio
async def test_media_splits_images_and_files(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    await create_message(session, alice, conv.id, content="just text")
    await create_message(
        session,
        alice,
        conv.id,
        type="image",
        attachment={
            "url": "/uploads/a.png",
            "filename": "a.png",
            "mime_type": "image/png",
            "size_bytes": 100,
            "width": 10,
            "height": 10,
        },
    )
    await create_message(
        session,
        bob,
        conv.id,
        type="file",
        attachment={
            "url": "/uploads/b.pdf",
            "filename": "b.pdf",
            "mime_type": "application/pdf",
            "size_bytes": 500,
        },
    )

    result = await media(session, alice, conv.id)
    assert len(result.images) == 1
    assert result.images[0].attachment.filename == "a.png"
    assert len(result.files) == 1
    assert result.files[0].attachment.filename == "b.pdf"


@pytest.mark.asyncio
async def test_media_non_member_forbidden(session, alice, bob):
    from app.services import users as user_service

    carol = await user_service.create(session, username="carol_media", display_name="Carol")
    await session.commit()

    conv = await create_conversation(session, alice, "direct", [bob.id])
    with pytest.raises(HTTPException) as exc:
        await media(session, carol, conv.id)
    assert exc.value.status_code == 403


# --- chat color -------------------------------------------------------


@pytest.mark.asyncio
async def test_set_chat_color_sets_caller_member_only(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    await set_chat_color(session, conv.id, alice, "#2c6bed")

    alice_member = await get_member(session, conv.id, alice.id)
    bob_member = await get_member(session, conv.id, bob.id)
    assert alice_member.chat_color == "#2c6bed"
    assert bob_member.chat_color is None


@pytest.mark.asyncio
async def test_set_chat_color_non_member_forbidden(session, alice, bob):
    from app.services import users as user_service

    carol = await user_service.create(session, username="carol_color", display_name="Carol")
    await session.commit()

    conv = await create_conversation(session, alice, "direct", [bob.id])
    with pytest.raises(HTTPException) as exc:
        await set_chat_color(session, conv.id, carol, "#ffffff")
    assert exc.value.status_code == 403


# --- contact notes + member nickname -----------------------------------


@pytest.mark.asyncio
async def test_member_out_shows_viewer_nickname(session, alice, bob):
    from app.services.conversations import serialize_members
    from app.services.contacts import upsert as upsert_contact

    conv = await create_conversation(session, alice, "direct", [bob.id])
    await upsert_contact(session, alice.id, bob.id, {"nickname": "Bobby"})

    alice_view = await serialize_members(session, conv.id, viewer_id=alice.id)
    bob_view = await serialize_members(session, conv.id, viewer_id=bob.id)

    by_user_alice_view = {m.user_id: m for m in alice_view}
    by_user_bob_view = {m.user_id: m for m in bob_view}

    assert by_user_alice_view[bob.id].nickname == "Bobby"
    # Viewer-specific: bob has not annotated alice, and bob's own view of
    # himself carries no nickname either (alice's note about bob is hers only).
    assert by_user_bob_view[bob.id].nickname is None
    assert by_user_bob_view[alice.id].nickname is None


# --- HTTP endpoints -----------------------------------------------------


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
async def test_http_disappearing_flow(client):
    token1, user1 = await _login(client, "dis1")
    token2, user2 = await _login(client, "dis2")
    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    r = await client.post(
        "/api/conversations", json={"type": "direct", "member_ids": [user2["id"]]}, headers=headers1
    )
    conv_id = r.json()["id"]

    r = await client.patch(
        f"/api/conversations/{conv_id}/disappearing", json={"seconds": 3600}, headers=headers1
    )
    assert r.status_code == 200
    assert r.json()["disappearing_seconds"] == 3600

    r = await client.post(
        "/api/messages", json={"conversation_id": conv_id, "content": "hi"}, headers=headers1
    )
    assert r.status_code == 201
    assert r.json()["expires_at"] is not None

    # Non-member can't set it.
    token3, _ = await _login(client, "dis3")
    headers3 = {"Authorization": f"Bearer {token3}"}
    r = await client.patch(
        f"/api/conversations/{conv_id}/disappearing", json={"seconds": 60}, headers=headers3
    )
    assert r.status_code == 403

    # A system message documenting the change shows up in history.
    r = await client.get(f"/api/conversations/{conv_id}/messages", headers=headers2)
    assert any(m["type"] == "system" and "1 hour" in (m["content"] or "") for m in r.json())


@pytest.mark.asyncio
async def test_http_media_endpoint(client, session, tmp_path, monkeypatch):
    import io

    from PIL import Image

    from app.api import uploads as uploads_module

    monkeypatch.setattr(uploads_module, "UPLOAD_DIR", tmp_path)

    token1, user1 = await _login(client, "med1")
    _, user2 = await _login(client, "med2")
    headers1 = {"Authorization": f"Bearer {token1}"}

    r = await client.post(
        "/api/conversations", json={"type": "direct", "member_ids": [user2["id"]]}, headers=headers1
    )
    conv_id = r.json()["id"]

    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(1, 2, 3)).save(buf, format="PNG")
    files = {"file": ("photo.png", buf.getvalue(), "image/png")}
    r = await client.post("/api/uploads", headers=headers1, files=files)
    upload = r.json()

    # REST /api/messages has no attachment field (attachments are sent over
    # WS per the existing message.send handler); create the attachment
    # message directly through the shared service instead.
    from app.services.messages import create as create_message
    from app.services import users as user_service

    sender = await user_service.get_by_id(session, user1["id"])
    await create_message(
        session,
        sender,
        conv_id,
        type="image",
        attachment={
            "url": upload["url"],
            "filename": "photo.png",
            "mime_type": upload["mime"],
            "size_bytes": upload["size"],
            "width": upload["w"],
            "height": upload["h"],
        },
    )

    r = await client.get(f"/api/conversations/{conv_id}/media", headers=headers1)
    assert r.status_code == 200
    body = r.json()
    assert len(body["images"]) == 1
    assert body["files"] == []

    token3, _ = await _login(client, "med3")
    headers3 = {"Authorization": f"Bearer {token3}"}
    r = await client.get(f"/api/conversations/{conv_id}/media", headers=headers3)
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_http_chat_color_sets_caller_member(client):
    token1, user1 = await _login(client, "col1")
    token2, user2 = await _login(client, "col2")
    headers1 = {"Authorization": f"Bearer {token1}"}
    headers2 = {"Authorization": f"Bearer {token2}"}

    r = await client.post(
        "/api/conversations", json={"type": "direct", "member_ids": [user2["id"]]}, headers=headers1
    )
    conv_id = r.json()["id"]

    r = await client.patch(
        f"/api/conversations/{conv_id}/chat-color", json={"color": "#ff00aa"}, headers=headers1
    )
    assert r.status_code == 200
    body = r.json()
    assert body["chat_color"] == "#ff00aa"
    assert body["user_id"] == user1["id"]

    r = await client.get(f"/api/conversations/{conv_id}", headers=headers2)
    members = r.json()["members"]
    by_user = {m["user_id"]: m for m in members}
    assert by_user[user1["id"]]["chat_color"] == "#ff00aa"
    assert by_user[user2["id"]]["chat_color"] is None


@pytest.mark.asyncio
async def test_http_contacts_put_then_get(client):
    token1, user1 = await _login(client, "contact1")
    _, user2 = await _login(client, "contact2")
    headers1 = {"Authorization": f"Bearer {token1}"}

    r = await client.put(
        f"/api/contacts/{user2['id']}",
        json={"nickname": "Buddy", "note": "met at work"},
        headers=headers1,
    )
    assert r.status_code == 200
    assert r.json() == {"user_id": user2["id"], "nickname": "Buddy", "note": "met at work"}

    r = await client.get(f"/api/contacts/{user2['id']}", headers=headers1)
    assert r.status_code == 200
    assert r.json() == {"user_id": user2["id"], "nickname": "Buddy", "note": "met at work"}

    # Partial update: omitting `note` leaves it untouched; explicit null clears nickname.
    r = await client.put(
        f"/api/contacts/{user2['id']}", json={"nickname": None}, headers=headers1
    )
    assert r.status_code == 200
    assert r.json() == {"user_id": user2["id"], "nickname": None, "note": "met at work"}


@pytest.mark.asyncio
async def test_http_contacts_get_defaults_when_no_note(client):
    token1, _ = await _login(client, "contact3")
    _, user2 = await _login(client, "contact4")
    headers1 = {"Authorization": f"Bearer {token1}"}

    r = await client.get(f"/api/contacts/{user2['id']}", headers=headers1)
    assert r.status_code == 200
    assert r.json() == {"user_id": user2["id"], "nickname": None, "note": None}
