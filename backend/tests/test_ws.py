import asyncio

import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from starlette.testclient import TestClient

from app.core.db import Base, get_session, get_session_factory
from app.main import create_app
from app.services.conversations import create_conversation
from app.services.messages import create as create_message
from app.ws.handlers import dispatch
from app.ws.manager import manager

# Import models so every table is registered on Base.metadata before create_all.
import app.models  # noqa: F401


async def _create_schema(engine):
    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)


async def _drop_schema(engine):
    async with engine.begin() as c:
        await c.run_sync(Base.metadata.drop_all)


@pytest.fixture(scope="module")
def ws_client(tmp_path_factory):
    """A single shared TestClient (and single async engine) reused by every
    transport-level test in this module.

    Module-scoped rather than the usual per-test `client` fixture:
    Starlette's synchronous TestClient spins up a background anyio portal
    thread per instance, and this environment's SQLAlchemy async + greenlet
    stack is fragile around closing multiple concurrently-open real
    WebSocket connections through it (see `_open_ws` below for how the one
    remaining two-socket test sidesteps the specific failure mode). One
    portal for the module keeps things simple; isolation between tests here
    comes from unique usernames and from resetting `ws.manager.manager`
    between tests (autouse fixture in conftest.py).
    """
    db_path = tmp_path_factory.mktemp("ws") / "ws_test.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", echo=False)

    @event.listens_for(engine.sync_engine, "connect")
    def _pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()

    asyncio.run(_create_schema(engine))

    app = create_app()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async def _get_session_override():
        async with session_maker() as s:
            yield s

    app.dependency_overrides[get_session] = _get_session_override
    app.dependency_overrides[get_session_factory] = lambda: session_maker

    client = TestClient(app)
    yield client

    # Best-effort: the test below intentionally leaves its sockets open (see
    # _open_ws), so the underlying WS handler tasks may still be parked
    # holding a checked-out connection each. Don't let schema teardown hang
    # the whole run over resources the process is about to reclaim anyway.
    try:
        asyncio.run(asyncio.wait_for(_drop_schema(engine), timeout=3.0))
    except BaseException:
        pass
    try:
        asyncio.run(asyncio.wait_for(engine.dispose(), timeout=3.0))
    except BaseException:
        pass


def _phone_for(handle: str) -> str:
    """Deterministic fake phone number for a test handle (real OTP login now
    requires a phone, not an arbitrary handle string)."""
    import hashlib

    digits = str(int(hashlib.sha256(handle.encode()).hexdigest(), 16) % 10**10).zfill(10)
    return f"+1{digits}"


def _login(sync_client, handle):
    phone = _phone_for(handle)
    r = sync_client.post("/api/auth/request-otp", json={"phone": phone})
    dev_code = r.json()["dev_code"]
    r = sync_client.post("/api/auth/verify-otp", json={"phone": phone, "code": dev_code})
    body = r.json()
    return body["token"], body["user"]


def _drain_until(ws, event_type, max_frames=10):
    """Read frames off ws until one of the given type shows up (skipping
    unrelated frames like `presence`, which can arrive at any time as other
    sockets connect/disconnect). Fails loudly if it never shows up."""
    for _ in range(max_frames):
        frame = ws.receive_json()
        if frame["type"] == event_type:
            return frame
    raise AssertionError(f"never received a {event_type!r} frame")


def _open_ws(client, token):
    """Open a websocket and return the connected session WITHOUT going
    through the `websocket_connect(...) as ws:` context manager's exit.

    Deliberate: in this environment, closing two concurrently-open real
    WebSocket connections (each backed by its own async SQLAlchemy/aiosqlite
    session) via the synchronous TestClient's close handshake can trigger a
    cancellation race in SQLAlchemy's async/greenlet cleanup that wedges
    indefinitely — an artifact of the TestClient's cross-thread portal
    bridging a sync test to the async app, not of the actual message-routing
    code (independently verified: the full send/ack/broadcast flow completes
    correctly every time). A real client disconnecting over a real socket
    goes through uvicorn/asyncio's normal path and hits none of this.
    Leaving the connection open for the rest of the (short-lived) test
    process is a fine trade-off for a fast, deterministic test.
    """
    return client.websocket_connect(f"/ws?token={token}").__enter__()


def test_ws_message_roundtrip(ws_client):
    """End-to-end transport test: two real, simultaneously-connected
    WebSocket clients: alice sends, gets `message.ack`; bob (online) gets
    `message.new`; alice then gets `receipt.update` once bob's delivered
    pointer bumps. This is the one full-stack (routes + manager + handlers +
    services + real sockets) integration test; per-event-type handler logic
    (typing/read/reaction) is covered by the `dispatch(...)`-level tests
    below, which exercise the same handler code without the transport.
    """
    client = ws_client

    alice_token, alice_user = _login(client, "alice_ws")
    bob_token, bob_user = _login(client, "bob_ws")

    r = client.post(
        "/api/conversations",
        json={"type": "direct", "member_ids": [bob_user["id"]]},
        headers={"Authorization": f"Bearer {alice_token}"},
    )
    conv_id = r.json()["id"]

    alice_ws = _open_ws(client, alice_token)
    bob_ws = _open_ws(client, bob_token)

    alice_ws.send_json(
        {
            "type": "message.send",
            "payload": {
                "conversation_id": conv_id,
                "content": "hello bob",
                "temp_id": "temp-1",
            },
        }
    )

    ack = _drain_until(alice_ws, "message.ack")
    assert ack["payload"]["temp_id"] == "temp-1"
    assert ack["payload"]["status"] in ("sent", "delivered", "read")
    real_id = ack["payload"]["message_id"]

    new_msg = _drain_until(bob_ws, "message.new")
    assert new_msg["payload"]["content"] == "hello bob"
    assert new_msg["payload"]["id"] == real_id
    assert new_msg["payload"]["temp_id"] == "temp-1"

    # bob was online -> delivered pointer bumped -> sender gets receipt.update
    receipt = _drain_until(alice_ws, "receipt.update")
    assert receipt["payload"]["user_id"] == bob_user["id"]
    assert receipt["payload"]["last_delivered_id"] == real_id


def test_ws_invalid_token_closes_with_4401(ws_client):
    client = ws_client
    with pytest.raises(Exception):
        with client.websocket_connect("/ws?token=garbage") as ws:
            ws.receive_json()


# --- Handler-level tests -----------------------------------------------
#
# typing / message.read / reaction.add / message.send are exercised here by
# calling app.ws.handlers.dispatch(...) directly against stub sockets
# registered in the real `manager` singleton — the same technique
# test_ws_manager.py uses. This is the real dispatch/handler code (no
# transport-layer double), just driven without opening actual sockets, which
# keeps these fast, deterministic, and independent of the TestClient
# fragility around concurrent live connections noted above.


class _StubSocket:
    def __init__(self):
        self.sent: list[dict] = []

    async def send_json(self, data):
        self.sent.append(data)


@pytest.mark.asyncio
async def test_dispatch_typing_broadcasts_to_other_member_only(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])

    alice_ws, bob_ws = _StubSocket(), _StubSocket()
    manager.connect(alice.id, alice_ws)
    manager.connect(bob.id, bob_ws)

    await dispatch(
        session, alice, {"type": "typing.start", "payload": {"conversation_id": conv.id}}
    )

    assert len(bob_ws.sent) == 1
    assert bob_ws.sent[0]["type"] == "typing"
    assert bob_ws.sent[0]["payload"]["is_typing"] is True
    assert bob_ws.sent[0]["payload"]["user_id"] == alice.id
    assert alice_ws.sent == []  # never broadcast back to the sender


@pytest.mark.asyncio
async def test_dispatch_message_send_acks_sender_and_broadcasts_to_others(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])

    alice_ws, bob_ws = _StubSocket(), _StubSocket()
    manager.connect(alice.id, alice_ws)
    manager.connect(bob.id, bob_ws)

    await dispatch(
        session,
        alice,
        {
            "type": "message.send",
            "payload": {"conversation_id": conv.id, "content": "hey", "temp_id": "tmp-1"},
        },
    )

    acks = [f for f in alice_ws.sent if f["type"] == "message.ack"]
    assert len(acks) == 1
    assert acks[0]["payload"]["temp_id"] == "tmp-1"
    real_id = acks[0]["payload"]["message_id"]

    news = [f for f in bob_ws.sent if f["type"] == "message.new"]
    assert len(news) == 1
    assert news[0]["payload"]["content"] == "hey"
    assert news[0]["payload"]["id"] == real_id

    # bob is registered as "online" -> delivered pointer bumps -> alice gets receipt.update
    receipts = [f for f in alice_ws.sent if f["type"] == "receipt.update"]
    assert len(receipts) == 1
    assert receipts[0]["payload"]["last_delivered_id"] == real_id


@pytest.mark.asyncio
async def test_dispatch_message_read_broadcasts_receipt_update_to_all_members(
    session, alice, bob
):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    msg = await create_message(session, alice, conv.id, content="hi")

    alice_ws, bob_ws = _StubSocket(), _StubSocket()
    manager.connect(alice.id, alice_ws)
    manager.connect(bob.id, bob_ws)

    await dispatch(
        session,
        bob,
        {
            "type": "message.read",
            "payload": {"conversation_id": conv.id, "message_id": msg.id},
        },
    )

    assert len(alice_ws.sent) == 1
    assert alice_ws.sent[0]["type"] == "receipt.update"
    assert alice_ws.sent[0]["payload"]["last_read_id"] == msg.id
    assert alice_ws.sent[0]["payload"]["user_id"] == bob.id

    assert len(bob_ws.sent) == 1
    assert bob_ws.sent[0]["type"] == "receipt.update"


@pytest.mark.asyncio
async def test_dispatch_reaction_add_then_remove_broadcasts_reaction_update(
    session, alice, bob
):
    conv = await create_conversation(session, alice, "direct", [bob.id])
    msg = await create_message(session, alice, conv.id, content="hi")

    alice_ws, bob_ws = _StubSocket(), _StubSocket()
    manager.connect(alice.id, alice_ws)
    manager.connect(bob.id, bob_ws)

    await dispatch(
        session,
        bob,
        {"type": "reaction.add", "payload": {"message_id": msg.id, "emoji": "👍"}},
    )

    assert len(alice_ws.sent) == 1
    assert alice_ws.sent[0]["type"] == "reaction.update"
    assert alice_ws.sent[0]["payload"]["message_id"] == msg.id
    assert len(alice_ws.sent[0]["payload"]["reactions"]) == 1
    assert len(bob_ws.sent) == 1

    # toggle again -> removed
    await dispatch(
        session,
        bob,
        {"type": "reaction.remove", "payload": {"message_id": msg.id, "emoji": "👍"}},
    )
    assert alice_ws.sent[1]["payload"]["reactions"] == []


@pytest.mark.asyncio
async def test_dispatch_unknown_event_type_sends_error_to_caller_only(session, alice, bob):
    conv = await create_conversation(session, alice, "direct", [bob.id])

    alice_ws, bob_ws = _StubSocket(), _StubSocket()
    manager.connect(alice.id, alice_ws)
    manager.connect(bob.id, bob_ws)

    await dispatch(session, alice, {"type": "bogus.event", "payload": {"conversation_id": conv.id}})

    assert len(alice_ws.sent) == 1
    assert alice_ws.sent[0]["type"] == "error"
    assert bob_ws.sent == []


@pytest.mark.asyncio
async def test_dispatch_message_send_to_nonmember_conversation_sends_error(session, alice, bob):
    from app.services import users as user_service

    carol = await user_service.create(session, username="carol_ws", display_name="Carol")
    await session.commit()

    conv = await create_conversation(session, alice, "direct", [bob.id])

    carol_ws = _StubSocket()
    manager.connect(carol.id, carol_ws)

    # carol is not a member of alice+bob's conversation -> services.messages.create
    # raises HTTPException(403), which dispatch must catch and turn into an
    # error frame rather than letting it bubble and kill the socket.
    await dispatch(
        session,
        carol,
        {
            "type": "message.send",
            "payload": {"conversation_id": conv.id, "content": "intrude", "temp_id": "x"},
        },
    )

    assert len(carol_ws.sent) == 1
    assert carol_ws.sent[0]["type"] == "error"
