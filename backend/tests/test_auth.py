import pytest
from fastapi import HTTPException

from app.services.otp import request_otp, verify_otp
from app.services import users as user_service


@pytest.mark.asyncio
async def test_verify_otp_wrong_code_raises(session):
    await request_otp(session, "+15550001111")
    with pytest.raises(HTTPException) as exc:
        await verify_otp(session, "+15550001111", "000000")
    assert exc.value.status_code == 400
    assert "invalid code" in exc.value.detail


@pytest.mark.asyncio
async def test_verify_otp_creates_new_user(session):
    result = await request_otp(session, "+15550001112")
    code = result["dev_code"]

    user, is_new = await verify_otp(session, "+15550001112", code)
    assert is_new is True
    assert user.phone == "+15550001112"
    assert user.display_name == ""


@pytest.mark.asyncio
async def test_verify_otp_existing_user_not_new(session):
    await user_service.create(
        session, username="alice", display_name="Alice", phone="+15550001113"
    )
    await session.commit()

    result = await request_otp(session, "+15550001113")
    user, is_new = await verify_otp(session, "+15550001113", result["dev_code"])
    assert is_new is False
    assert user.username == "alice"


@pytest.mark.asyncio
async def test_verify_otp_expired_code(session):
    result = await request_otp(session, "+15550001114")
    code = result["dev_code"]

    # Force the just-created row to be expired.
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from app.models import OtpCode

    row = (
        await session.execute(
            select(OtpCode).where(OtpCode.phone == "+15550001114")
        )
    ).scalars().first()
    row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    await session.commit()

    with pytest.raises(HTTPException) as exc:
        await verify_otp(session, "+15550001114", code)
    assert exc.value.status_code == 400
    assert "expired" in exc.value.detail


@pytest.mark.asyncio
async def test_verify_otp_too_many_attempts(session):
    from app.core.config import settings

    result = await request_otp(session, "+15550001115")

    for _ in range(settings.otp_max_attempts):
        with pytest.raises(HTTPException) as exc:
            await verify_otp(session, "+15550001115", "000000")
        assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc:
        await verify_otp(session, "+15550001115", result["dev_code"])
    assert exc.value.status_code == 429
    assert "too many attempts" in exc.value.detail


@pytest.mark.asyncio
async def test_request_otp_rate_limited(session):
    await request_otp(session, "+15550001116")
    with pytest.raises(HTTPException) as exc:
        await request_otp(session, "+15550001116")
    assert exc.value.status_code == 429


@pytest.mark.asyncio
async def test_phone_normalization_maps_to_same_user(session):
    result = await request_otp(session, "+1-555-000-1117")
    user1, is_new1 = await verify_otp(session, "+1 (555) 000 1117", result["dev_code"])
    assert is_new1 is True

    result2 = await request_otp(session, "+15550001117")
    user2, is_new2 = await verify_otp(session, "+15550001117", result2["dev_code"])
    assert is_new2 is False
    assert user1.id == user2.id


@pytest.mark.asyncio
async def test_login_flow(client):
    r = await client.post("/api/auth/request-otp", json={"phone": "+15550002001"})
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["expires_in"] > 0
    assert body["resend_in"] > 0
    dev_code = body["dev_code"]
    assert dev_code and len(dev_code) == 6

    r = await client.post(
        "/api/auth/verify-otp", json={"phone": "+15550002001", "code": dev_code}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["is_new"] is True and body["token"]
    assert body["user"]["created_at"]
    assert body["user"]["phone"] == "+15550002001"

    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"}
    )
    assert me.status_code == 200
    assert me.json()["phone"] == "+15550002001"
    assert me.json()["created_at"]


@pytest.mark.asyncio
async def test_request_otp_resend_rate_limit_http(client):
    r = await client.post("/api/auth/request-otp", json={"phone": "+15550002002"})
    assert r.status_code == 200
    r = await client.post("/api/auth/request-otp", json={"phone": "+15550002002"})
    assert r.status_code == 429


@pytest.mark.asyncio
async def test_bad_otp(client):
    r = await client.post("/api/auth/request-otp", json={"phone": "+15550002003"})
    assert r.status_code == 200
    r = await client.post(
        "/api/auth/verify-otp", json={"phone": "+15550002003", "code": "000000"}
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_verify_unknown_phone_without_request_fails(client):
    r = await client.post(
        "/api/auth/verify-otp", json={"phone": "+15550002004", "code": "000000"}
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    r = await client.get("/api/auth/me")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_complete_profile_and_logout(client):
    r = await client.post("/api/auth/request-otp", json={"phone": "+15550002005"})
    dev_code = r.json()["dev_code"]
    r = await client.post(
        "/api/auth/verify-otp", json={"phone": "+15550002005", "code": dev_code}
    )
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.post(
        "/api/auth/complete-profile",
        json={"display_name": "Carol S", "avatar_url": "http://x/a.png"},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["user"]["display_name"] == "Carol S"

    r = await client.post("/api/auth/logout", headers=headers)
    assert r.status_code == 200
    assert r.json()["ok"] is True


@pytest.mark.asyncio
async def test_complete_profile_rejects_taken_username(client, session):
    await user_service.create(session, username="taken", display_name="Taken")
    await session.commit()

    r = await client.post("/api/auth/request-otp", json={"phone": "+15550002007"})
    dev_code = r.json()["dev_code"]
    r = await client.post(
        "/api/auth/verify-otp", json={"phone": "+15550002007", "code": dev_code}
    )
    headers = {"Authorization": f"Bearer {r.json()['token']}"}

    r = await client.post(
        "/api/auth/complete-profile",
        json={"display_name": "Someone", "username": "taken"},
        headers=headers,
    )
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_known_seed_style_phone_is_new_false(client, session):
    """A user that already has a display_name (like a seeded user) logging
    in again with the same phone should come back as is_new=False."""
    await user_service.create(
        session, username="alice", display_name="Alice Carter", phone="+12025550111"
    )
    await session.commit()

    r = await client.post("/api/auth/request-otp", json={"phone": "+1-202-555-0111"})
    assert r.status_code == 200
    dev_code = r.json()["dev_code"]

    r = await client.post(
        "/api/auth/verify-otp", json={"phone": "+1 (202) 555 0111", "code": dev_code}
    )
    assert r.status_code == 200
    assert r.json()["is_new"] is False
    assert r.json()["user"]["username"] == "alice"


@pytest.mark.asyncio
async def test_new_user_stays_is_new_until_profile_completed(client, monkeypatch):
    from app.core.config import settings

    r = await client.post("/api/auth/request-otp", json={"phone": "+15550002010"})
    dev_code = r.json()["dev_code"]
    r = await client.post(
        "/api/auth/verify-otp", json={"phone": "+15550002010", "code": dev_code}
    )
    assert r.json()["is_new"] is True
    token = r.json()["token"]

    await client.post(
        "/api/auth/complete-profile",
        json={"display_name": "Someone"},
        headers={"Authorization": f"Bearer {token}"},
    )

    # Bypass the resend rate limit so we can request a fresh code for the
    # same phone within this test.
    monkeypatch.setattr(settings, "otp_resend_seconds", 0)

    r = await client.post("/api/auth/request-otp", json={"phone": "+15550002010"})
    assert r.status_code == 200
    dev_code2 = r.json()["dev_code"]

    r = await client.post(
        "/api/auth/verify-otp", json={"phone": "+15550002010", "code": dev_code2}
    )
    assert r.status_code == 200
    assert r.json()["is_new"] is False
