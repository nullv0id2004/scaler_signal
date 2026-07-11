import pytest


async def _register(client, phone, display="User"):
    """Register a user via the OTP flow, returning (token, user dict)."""
    r = await client.post("/api/auth/request-otp", json={"phone": phone})
    dev_code = r.json()["dev_code"]
    r = await client.post("/api/auth/verify-otp", json={"phone": phone, "code": dev_code})
    body = r.json()
    token = body["token"]
    # give them a display name so they look like a completed profile
    await client.patch(
        "/api/users/me",
        json={"display_name": display},
        headers={"Authorization": f"Bearer {token}"},
    )
    return token, body["user"]


@pytest.mark.asyncio
async def test_patch_me_updates_fields(client):
    token, _ = await _register(client, "+15550002001")
    headers = {"Authorization": f"Bearer {token}"}

    r = await client.patch(
        "/api/users/me",
        json={"display_name": "Alice Cooper", "about": "hello there"},
        headers=headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["display_name"] == "Alice Cooper"
    assert body["about"] == "hello there"

    # /me reflects the change
    r = await client.get("/api/auth/me", headers=headers)
    assert r.json()["display_name"] == "Alice Cooper"


@pytest.mark.asyncio
async def test_patch_me_partial_leaves_others(client):
    token, _ = await _register(client, "+15550002002", display="Original")
    headers = {"Authorization": f"Bearer {token}"}

    await client.patch("/api/users/me", json={"about": "just about"}, headers=headers)
    r = await client.patch(
        "/api/users/me", json={"avatar_url": "/uploads/x.png"}, headers=headers
    )
    body = r.json()
    assert body["display_name"] == "Original"  # untouched
    assert body["about"] == "just about"  # untouched
    assert body["avatar_url"] == "/uploads/x.png"


@pytest.mark.asyncio
async def test_patch_me_empty_display_name_400(client):
    token, _ = await _register(client, "+15550002003")
    r = await client.patch(
        "/api/users/me",
        json={"display_name": "   "},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_patch_me_about_too_long_400(client):
    token, _ = await _register(client, "+15550002004")
    r = await client.patch(
        "/api/users/me",
        json={"about": "x" * 501},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert r.status_code == 400


@pytest.mark.asyncio
async def test_patch_me_unauthorized_401(client):
    r = await client.patch("/api/users/me", json={"display_name": "x"})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_get_user_returns_public_profile(client):
    _, target = await _register(client, "+15550002005", display="Target Person")
    token, _ = await _register(client, "+15550002006")

    r = await client.get(
        f"/api/users/{target['id']}", headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == target["id"]
    assert body["display_name"] == "Target Person"
    assert "username" in body


@pytest.mark.asyncio
async def test_get_user_not_found_404(client):
    token, _ = await _register(client, "+15550002007")
    r = await client.get(
        "/api/users/999999", headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_get_user_unauthorized_401(client):
    r = await client.get("/api/users/1")
    assert r.status_code == 401
