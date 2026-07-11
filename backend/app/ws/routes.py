import asyncio
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.db import get_session_factory
from app.core.security import get_user_from_token
from app.schemas.ws import frame
from app.ws.handlers import dispatch
from app.ws.manager import manager

router = APIRouter()

# Bound how long we'll wait for the session to close on disconnect. In this
# environment, closing an async SQLAlchemy/aiosqlite session that raced a
# cancelled operation can wedge indefinitely inside SQLAlchemy's pool/greenlet
# cleanup — well outside code we control. A connection close must never be
# allowed to hang the server (or, in tests, the whole suite), so it's
# timeout-guarded rather than delegated to FastAPI's automatic
# generator-dependency teardown.
SESSION_CLOSE_TIMEOUT_SECONDS = 2.0


@router.websocket("/ws")
async def ws_endpoint(
    websocket: WebSocket,
    session_factory: async_sessionmaker = Depends(get_session_factory),
):
    """Single connection per (user, tab): wss://api/ws?token=<JWT>.

    Auth on connect, register in the manager, broadcast presence, then loop
    frames through ws.handlers.dispatch until disconnect.

    The session is opened and closed manually (rather than via
    `Depends(get_session)`) so its close can be timeout-guarded; see
    SESSION_CLOSE_TIMEOUT_SECONDS.
    """
    session = session_factory()
    try:
        token = websocket.query_params.get("token")
        user = await get_user_from_token(session, token) if token else None
        if user is None:
            await websocket.close(code=4401)
            return

        await websocket.accept()
        manager.connect(user.id, websocket)
        await _broadcast_presence(user.id, online=True, last_seen_at=None)

        try:
            while True:
                try:
                    raw = await websocket.receive_json()
                except WebSocketDisconnect:
                    break
                except Exception:
                    await manager.send_to_user(
                        user.id, frame("error", {"detail": "Malformed frame"})
                    )
                    continue

                try:
                    await dispatch(session, user, raw)
                except Exception:
                    await manager.send_to_user(
                        user.id, frame("error", {"detail": "Internal error processing frame"})
                    )
        finally:
            # manager.disconnect is sync and unconditional: even if
            # everything below is interrupted, this user must never appear
            # online forever.
            manager.disconnect(user.id, websocket)
            last_seen_iso: str | None = None
            try:
                last_seen = datetime.now(timezone.utc)
                user.last_seen_at = last_seen
                await session.commit()
                last_seen_iso = last_seen.isoformat()
            except BaseException:
                # Best-effort: a broken write here must not block cleanup.
                pass
            try:
                await _broadcast_presence(user.id, online=False, last_seen_at=last_seen_iso)
            except BaseException:
                pass
    finally:
        try:
            await asyncio.wait_for(session.close(), timeout=SESSION_CLOSE_TIMEOUT_SECONDS)
        except BaseException:
            pass


async def _broadcast_presence(user_id: int, online: bool, last_seen_at: str | None) -> None:
    others = [uid for uid in manager.online_users() if uid != user_id]
    await manager.broadcast(
        others,
        frame("presence", {"user_id": user_id, "online": online, "last_seen_at": last_seen_at}),
    )
