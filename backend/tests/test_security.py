import pytest
from jose import jwt

from app.core.config import settings
from app.core.security import create_access_token, decode_token


def test_roundtrip():
    t = create_access_token(42)
    assert decode_token(t) == 42


def test_tampered_token_raises():
    t = create_access_token(1)
    # Flip a character in the payload segment (not the last char of the
    # signature, whose trailing base64 bits can be padding-insensitive).
    header, payload, signature = t.split(".")
    flipped = "a" if payload[-1] != "a" else "b"
    tampered_payload = payload[:-1] + flipped
    tampered = f"{header}.{tampered_payload}.{signature}"
    with pytest.raises(Exception):
        decode_token(tampered)


def test_token_has_expected_claims():
    t = create_access_token(7)
    payload = jwt.decode(t, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    assert payload["sub"] == "7"
    assert "exp" in payload
