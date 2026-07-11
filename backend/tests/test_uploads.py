import io

import pytest
from PIL import Image


async def _login(client, handle):
    r = await client.post("/api/auth/verify-otp", json={"handle": handle, "otp": "123456"})
    body = r.json()
    return body["token"], body["user"]


def _png_bytes(width=40, height=20) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), color=(10, 20, 30)).save(buf, format="PNG")
    return buf.getvalue()


@pytest.mark.asyncio
async def test_upload_image_returns_url_and_dimensions(client, tmp_path, monkeypatch):
    from app.api import uploads as uploads_module

    monkeypatch.setattr(uploads_module, "UPLOAD_DIR", tmp_path)

    token, _ = await _login(client, "uploader")
    headers = {"Authorization": f"Bearer {token}"}

    files = {"file": ("photo.png", _png_bytes(40, 20), "image/png")}
    r = await client.post("/api/uploads", headers=headers, files=files)

    assert r.status_code == 200
    body = r.json()
    assert body["url"].startswith("/uploads/")
    assert body["mime"] == "image/png"
    assert body["width"] == 40
    assert body["height"] == 20
    assert body["size"] > 0

    saved = list(tmp_path.glob("*.png"))
    assert len(saved) == 1


@pytest.mark.asyncio
async def test_upload_non_image_has_null_dimensions(client, tmp_path, monkeypatch):
    from app.api import uploads as uploads_module

    monkeypatch.setattr(uploads_module, "UPLOAD_DIR", tmp_path)

    token, _ = await _login(client, "uploader2")
    headers = {"Authorization": f"Bearer {token}"}

    files = {"file": ("notes.txt", b"hello world", "text/plain")}
    r = await client.post("/api/uploads", headers=headers, files=files)

    assert r.status_code == 200
    body = r.json()
    assert body["width"] is None
    assert body["height"] is None
