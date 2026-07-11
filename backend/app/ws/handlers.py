"""Per-event-type dispatch for incoming WS frames.

Each handler is responsible for catching the `HTTPException`s that
`services.*` raise (they're written for the REST layer and won't
auto-respond over a WebSocket) and translating them into an `error` frame
sent back to the caller, instead of letting them bubble and kill the socket.
"""

from types import SimpleNamespace

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Message
from app.schemas.ws import IncomingFrame, frame
from app.services import conversations as conversation_service
from app.services import messages as message_service
from app.services import reactions as reaction_service
from app.services import receipts as receipt_service
from app.ws.manager import manager


async def _send_error(user_id: int, detail: str) -> None:
    await manager.send_to_user(user_id, frame("error", {"detail": detail}))


async def handle_message_send(session: AsyncSession, user, payload: dict) -> None:
    conversation_id = payload.get("conversation_id")
    temp_id = payload.get("temp_id")

    try:
        message = await message_service.create(
            session,
            user,
            conversation_id,
            content=payload.get("content"),
            reply_to_id=payload.get("reply_to_id"),
            type=payload.get("type", "text"),
            attachment=payload.get("attachment"),
        )
    except HTTPException as exc:
        await manager.send_to_user(
            user.id, frame("error", {"detail": exc.detail, "temp_id": temp_id})
        )
        return

    members = await conversation_service.get_members(session, conversation_id)
    out = await message_service.serialize(session, message)
    out.status = receipt_service.status_for(message, members)
    message_data = out.model_dump(mode="json")

    # 1. Ack the sender: sending -> sent. Flat shape per docs/DESIGN.md §2
    #    (temp_id + real message_id + status); the sender already holds the
    #    optimistic body, so the ack only needs to reconcile id/status.
    await manager.send_to_user(
        user.id,
        frame(
            "message.ack",
            {
                "temp_id": temp_id,
                "message_id": message.id,
                "status": message_data["status"],
                "conversation_id": conversation_id,
                "created_at": message_data["created_at"],
            },
        ),
    )

    # 2. Broadcast the new message to every other member.
    other_ids = [m.user_id for m in members if m.user_id != user.id]
    await manager.broadcast(
        other_ids, frame("message.new", {**message_data, "temp_id": temp_id})
    )

    # 3. Bump the delivered pointer for members who are online right now, and
    #    tell the sender so their checkmark can advance single -> double.
    for uid in other_ids:
        if not manager.is_online(uid):
            continue
        member = await receipt_service.mark_delivered(
            session, SimpleNamespace(id=uid), conversation_id, message.id
        )
        await manager.send_to_user(
            user.id,
            frame(
                "receipt.update",
                {
                    "conversation_id": conversation_id,
                    "user_id": uid,
                    "last_read_id": member.last_read_message_id,
                    "last_delivered_id": member.last_delivered_message_id,
                },
            ),
        )


async def handle_typing(session: AsyncSession, user, payload: dict, is_typing: bool) -> None:
    conversation_id = payload.get("conversation_id")
    member = await conversation_service.get_member(session, conversation_id, user.id)
    if member is None:
        await _send_error(user.id, "Not a member of this conversation")
        return

    members = await conversation_service.get_members(session, conversation_id)
    other_ids = [m.user_id for m in members if m.user_id != user.id]
    await manager.broadcast(
        other_ids,
        frame(
            "typing",
            {"conversation_id": conversation_id, "user_id": user.id, "is_typing": is_typing},
        ),
    )


async def handle_message_read(session: AsyncSession, user, payload: dict) -> None:
    conversation_id = payload.get("conversation_id")
    message_id = payload.get("message_id")

    try:
        member = await receipt_service.mark_read(session, user, conversation_id, message_id)
    except HTTPException as exc:
        await _send_error(user.id, exc.detail)
        return

    members = await conversation_service.get_members(session, conversation_id)
    member_ids = [m.user_id for m in members]
    await manager.broadcast(
        member_ids,
        frame(
            "receipt.update",
            {
                "conversation_id": conversation_id,
                "user_id": user.id,
                "last_read_id": member.last_read_message_id,
                "last_delivered_id": member.last_delivered_message_id,
            },
        ),
    )


async def handle_reaction(session: AsyncSession, user, payload: dict) -> None:
    message_id = payload.get("message_id")
    emoji = payload.get("emoji")

    try:
        reactions = await reaction_service.toggle(session, user, message_id, emoji)
    except HTTPException as exc:
        await _send_error(user.id, exc.detail)
        return

    result = await session.execute(select(Message).where(Message.id == message_id))
    message = result.scalar_one_or_none()
    if message is None:
        return

    members = await conversation_service.get_members(session, message.conversation_id)
    member_ids = [m.user_id for m in members]
    await manager.broadcast(
        member_ids,
        frame(
            "reaction.update",
            {
                "message_id": message_id,
                "reactions": [r.model_dump() for r in reactions],
            },
        ),
    )


_HANDLERS = {
    "message.send": handle_message_send,
    "typing.start": lambda s, u, p: handle_typing(s, u, p, True),
    "typing.stop": lambda s, u, p: handle_typing(s, u, p, False),
    "message.read": handle_message_read,
    "reaction.add": handle_reaction,
    "reaction.remove": handle_reaction,
}


async def dispatch(session: AsyncSession, user, raw: dict) -> None:
    """Parse + route one incoming frame. Never lets an exception escape —
    anything unexpected becomes an `error` frame back to the caller so the
    socket stays alive."""
    try:
        incoming = IncomingFrame.model_validate(raw)
    except ValidationError:
        await _send_error(user.id, "Malformed frame")
        return

    handler = _HANDLERS.get(incoming.type)
    if handler is None:
        await _send_error(user.id, f"Unknown event type: {incoming.type}")
        return

    try:
        await handler(session, user, incoming.payload)
    except HTTPException as exc:
        await _send_error(user.id, exc.detail)
