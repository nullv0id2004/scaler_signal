import pytest
from fastapi import HTTPException

from app.services.auth import verify_otp
from app.services import users as user_service


@pytest.mark.asyncio
async def test_verify_otp_wrong_code_raises(session):
    with pytest.raises(HTTPException) as exc:
        await verify_otp(session, "newhandle", "000000")
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_verify_otp_creates_new_user(session):
    user, is_new = await verify_otp(session, "newhandle", "123456")
    assert is_new is True
    assert user.username == "newhandle"


@pytest.mark.asyncio
async def test_verify_otp_existing_user_not_new(session):
    await user_service.create(session, username="alice", display_name="Alice")
    await session.commit()

    user, is_new = await verify_otp(session, "alice", "123456")
    assert is_new is False
    assert user.username == "alice"


@pytest.mark.asyncio
async def test_login_flow(client):
    await client.post("/api/auth/request-otp", json={"handle": "newuser"})
    r = await client.post("/api/auth/verify-otp", json={"handle": "newuser", "otp": "123456"})
    assert r.status_code == 200
    body = r.json()
    assert body["is_new"] is True and body["token"]
    assert body["user"]["created_at"]

    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"}
    )
    assert me.status_code == 200
    assert me.json()["username"] == "newuser"
    assert me.json()["created_at"]


@pytest.mark.asyncio
async def test_bad_otp(client):
    r = await client.post("/api/auth/verify-otp", json={"handle": "x", "otp": "000000"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_me_requires_auth(client):
    r = await client.get("/api/auth/me")
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_complete_profile_and_logout(client):
    r = await client.post("/api/auth/verify-otp", json={"handle": "carol", "otp": "123456"})
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
