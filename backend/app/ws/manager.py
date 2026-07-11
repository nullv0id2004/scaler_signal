"""In-process WebSocket connection registry.

Keyed by user_id -> set of live sockets (a user may have multiple tabs/
devices connected at once). Pure in-memory; presence and typing state live
here, nowhere else. Singleton `manager` is the one instance the app uses.
"""

import asyncio
from typing import Any, Protocol

# A send that hasn't completed within this window is treated as a dead/wedged
# socket (e.g. a client that stopped reading, or a connection that dropped
# without a clean close handshake) and gets pruned rather than blocking the
# broadcast to every other recipient forever.
SEND_TIMEOUT_SECONDS = 5.0


class SendsJSON(Protocol):
    async def send_json(self, data: Any) -> None: ...


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, set[SendsJSON]] = {}

    def connect(self, user_id: int, ws: SendsJSON) -> None:
        self._connections.setdefault(user_id, set()).add(ws)

    def disconnect(self, user_id: int, ws: SendsJSON) -> None:
        sockets = self._connections.get(user_id)
        if not sockets:
            return
        sockets.discard(ws)
        if not sockets:
            self._connections.pop(user_id, None)

    async def send_to_user(self, user_id: int, data: dict) -> None:
        """Fan out to every socket for this user. A single dead/broken/wedged
        socket must not take the whole broadcast down for every other
        recipient — catch per-socket failures (and time out sends that never
        complete) and prune the offending socket instead."""
        for ws in list(self._connections.get(user_id, ())):
            try:
                await asyncio.wait_for(ws.send_json(data), timeout=SEND_TIMEOUT_SECONDS)
            except Exception:
                self.disconnect(user_id, ws)

    async def broadcast(self, user_ids, data: dict) -> None:
        for user_id in user_ids:
            await self.send_to_user(user_id, data)

    def online_users(self) -> set[int]:
        return set(self._connections.keys())

    def is_online(self, user_id: int) -> bool:
        return bool(self._connections.get(user_id))


manager = ConnectionManager()
