# Delete Messages + Forward Messages — Design

**Date:** 2026-07-11
**Status:** Approved

## Goal

- **Delete for everyone:** a message's sender can delete it for all participants;
  it becomes a tombstone ("This message was deleted"). Reuses the existing
  `deleted_at` column and tombstone rendering.
- **Forward:** any visible message can be copied into one or more other
  conversations, tagged "Forwarded".

## Non-goals

- No "delete for me" (per-user hidden view) — only delete-for-everyone.
- Admins cannot delete others' messages — sender only.
- Forwarding does not copy reply linkage or reactions; attachment is copied.

## Data / migration

- Add `messages.is_forwarded` boolean, NOT NULL, default `false`.
- One Alembic migration (batch mode for SQLite).

## Backend — services/messages.py

- `delete(session, user, message_id) -> Message`
  - 404 if message missing; 403 if `user.id != message.sender_id`.
  - Idempotent: if already deleted, return as-is.
  - Sets `deleted_at = now()`, commits.
- `forward(session, user, message_id, conversation_ids) -> list[Message]`
  - Load source; 404 if missing; assert `user` is a member of the source's
    conversation (403 otherwise) so you can't forward what you can't see.
  - Cannot forward a deleted message (400).
  - For each target id: assert membership (403), create a new message copying
    `content`, `type`, and attachment (new Attachment row, same url/meta), with
    `is_forwarded=True`, `reply_to_message_id=None`.
  - Returns created messages (order matching input).
- `create(...)` gains `is_forwarded: bool = False`, set on the Message.
- `serialize(...)` includes `is_forwarded`.

## Schema

- `MessageOut` gains `is_forwarded: bool = False`.
- `ForwardMessageIn { message_id: int, conversation_ids: list[int] }`.

## API — api/messages.py

- `DELETE /api/messages/{id}` → `delete` → returns serialized (tombstone)
  MessageOut → also broadcast `message.deleted`.
- `POST /api/messages/forward` → `forward` → returns `list[MessageOut]` → also
  broadcast `message.new` per created message.
- Both broadcast through the shared `manager` (same as WS) so REST and WS paths
  keep live clients in sync.

## Real-time — ws/handlers.py

- `message.delete` handler: `{ message_id }` → `delete` → broadcast
  `message.deleted { conversation_id, message_id }` to conversation members.
- `message.forward` handler: `{ message_id, conversation_ids }` → `forward` →
  for each created message broadcast the existing `message.new` to that target
  conversation's members.
- Register both in the dispatch map.
- Factor a small helper to broadcast a frame to a conversation's member ids
  (reused by REST endpoints and handlers).

## Frontend

- **ws.ts:** `deleteMessage(message_id)` and `forwardMessage(message_id,
  conversation_ids)` senders; incoming `message.deleted` marks the message
  `deleted_at` in the conversation store (tombstone). `message.new` already
  handled — forwarded copies just arrive.
- **MessageBubble:** hover actions add **Delete** (only own, non-deleted) and
  **Forward** (any non-deleted). Delete → confirm dialog → `deleteMessage`.
  Forward → open ForwardDialog.
- **ForwardDialog:** multi-select from the user's conversation list → confirm →
  `forwardMessage(id, selectedIds)` → toast.
- **is_forwarded:** render a small "↪ Forwarded" label above the content.
- **types.ts:** `Message.is_forwarded: boolean`.

## Tests (backend)

- delete by non-sender → 403; by sender → tombstone (`deleted_at` set,
  history returns it as deleted).
- forward copies to N conversations, each with `is_forwarded=True`, content
  preserved; forward to a conversation you're not a member of → 403; forward a
  message you can't see → 403; forward a deleted message → 400.

## Error handling

- Delete/forward unauthorized → 403; missing → 404; deleted source → 400.
- Frontend: failures → toast; optimistic tombstone only after server ack /
  broadcast (keep it simple: act on the broadcast).
