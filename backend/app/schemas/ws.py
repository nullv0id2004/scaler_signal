"""WebSocket wire schemas.

Every frame (both directions) is JSON: {"type": ..., "payload": ...}. Client
payload shapes vary by type; IncomingFrame just validates the envelope and
handlers pull the fields they need out of the raw payload dict (keeps this
file small and avoids a schema-per-event-type maze for a 1-day protocol).
"""

from pydantic import BaseModel


class IncomingFrame(BaseModel):
    type: str
    payload: dict = {}


def frame(type: str, payload: dict) -> dict:
    """Build an outgoing {"type", "payload"} frame dict."""
    return {"type": type, "payload": payload}
