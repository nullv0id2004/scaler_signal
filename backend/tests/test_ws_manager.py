import pytest

from app.ws.manager import ConnectionManager


class StubSocket:
    def __init__(self, broken: bool = False):
        self.sent: list[dict] = []
        self.broken = broken

    async def send_json(self, data):
        if self.broken:
            raise RuntimeError("connection closed")
        self.sent.append(data)


@pytest.mark.asyncio
async def test_connect_registers_and_online():
    mgr = ConnectionManager()
    ws = StubSocket()
    mgr.connect(1, ws)
    assert mgr.is_online(1) is True
    assert mgr.online_users() == {1}


@pytest.mark.asyncio
async def test_disconnect_removes():
    mgr = ConnectionManager()
    ws = StubSocket()
    mgr.connect(1, ws)
    mgr.disconnect(1, ws)
    assert mgr.is_online(1) is False
    assert mgr.online_users() == set()


@pytest.mark.asyncio
async def test_disconnect_unknown_is_noop():
    mgr = ConnectionManager()
    ws = StubSocket()
    mgr.disconnect(1, ws)  # never connected — should not raise
    assert mgr.online_users() == set()


@pytest.mark.asyncio
async def test_multiple_sockets_same_user():
    mgr = ConnectionManager()
    ws1, ws2 = StubSocket(), StubSocket()
    mgr.connect(1, ws1)
    mgr.connect(1, ws2)
    assert mgr.is_online(1) is True

    mgr.disconnect(1, ws1)
    assert mgr.is_online(1) is True  # ws2 still connected

    mgr.disconnect(1, ws2)
    assert mgr.is_online(1) is False


@pytest.mark.asyncio
async def test_send_to_user_fans_to_all_sockets():
    mgr = ConnectionManager()
    ws1, ws2 = StubSocket(), StubSocket()
    mgr.connect(1, ws1)
    mgr.connect(1, ws2)

    await mgr.send_to_user(1, {"type": "hello"})
    assert ws1.sent == [{"type": "hello"}]
    assert ws2.sent == [{"type": "hello"}]


@pytest.mark.asyncio
async def test_broadcast_fans_to_multiple_users():
    mgr = ConnectionManager()
    ws1, ws2, ws3 = StubSocket(), StubSocket(), StubSocket()
    mgr.connect(1, ws1)
    mgr.connect(2, ws2)
    mgr.connect(3, ws3)

    await mgr.broadcast([1, 2], {"type": "presence"})
    assert ws1.sent == [{"type": "presence"}]
    assert ws2.sent == [{"type": "presence"}]
    assert ws3.sent == []


@pytest.mark.asyncio
async def test_send_to_user_prunes_dead_socket_without_raising():
    mgr = ConnectionManager()
    dead, alive = StubSocket(broken=True), StubSocket()
    mgr.connect(1, dead)
    mgr.connect(1, alive)

    await mgr.send_to_user(1, {"type": "hello"})  # must not raise

    assert alive.sent == [{"type": "hello"}]
    assert dead not in mgr._connections.get(1, set())
    assert mgr.is_online(1) is True  # alive socket still registered


@pytest.mark.asyncio
async def test_send_to_user_prunes_last_dead_socket_and_goes_offline():
    mgr = ConnectionManager()
    dead = StubSocket(broken=True)
    mgr.connect(1, dead)

    await mgr.send_to_user(1, {"type": "hello"})  # must not raise

    assert mgr.is_online(1) is False
