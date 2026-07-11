# Design Spec — Secure Messaging Platform (Signal Clone)

> Living design doc. Schema, real-time protocol, API surface, architecture.
> Companion to `DECISIONS.md` (which records *why*). This records *what*.

---

## 1. Database Schema

SQLite via SQLAlchemy 2.0 (async). WAL mode. Rationale: `DECISIONS.md` §2.

```
users
  id            PK
  username      unique              # login handle
  phone         unique, null
  display_name
  avatar_url    null
  about         null                # Signal "about" line
  last_seen_at                      # mocked presence
  created_at

conversations
  id            PK
  type          'direct' | 'group'
  name          null                # group only
  avatar_url    null                # group only
  created_by    FK users
  created_at

conversation_members
  id                         PK
  conversation_id            FK conversations
  user_id                    FK users
  role                       'admin' | 'member'
  joined_at
  last_read_message_id       FK messages, null   # read pointer
  last_delivered_message_id  FK messages, null   # delivery pointer
  muted                      bool
  UNIQUE(conversation_id, user_id)

messages
  id                   PK
  conversation_id      FK conversations
  sender_id            FK users
  type                 'text' | 'image' | 'file' | 'system'
  content              text, null
  reply_to_message_id  FK messages (self), null
  created_at
  edited_at            null
  deleted_at           null          # soft delete

message_reactions
  id            PK
  message_id    FK messages
  user_id       FK users
  emoji
  UNIQUE(message_id, user_id, emoji)

attachments
  id            PK
  message_id    FK messages
  url
  filename
  mime_type
  size_bytes
  width         null
  height        null
```

### Rules
- **Direct dedup:** reuse existing `type=direct` conversation between two users before creating.
- **Status derivation:** `sent` = row exists; `delivered` = member delivered pointer ≥ id; `read` = member read pointer ≥ id; `sending` = client-only.
- **Group admin:** `role` field. Add/remove = member row insert/delete + `system` message.
- **No OTP/session table:** fixed mock OTP, stateless JWT.

---

## 2. WebSocket Protocol

Single connection per user: `wss://api/ws?token=<JWT>`. Server authenticates on
connect, registers the socket in an in-process connection manager keyed by
`user_id`. All frames are JSON: `{ "type": ..., "payload": ... }`.

### Client → Server
| type | payload | meaning |
|---|---|---|
| `message.send` | conversation_id, content, reply_to_id?, temp_id | new message (temp_id = optimistic key) |
| `typing.start` / `typing.stop` | conversation_id | typing indicator |
| `message.read` | conversation_id, message_id | advance read pointer |
| `reaction.add` / `reaction.remove` | message_id, emoji | toggle reaction |

### Server → Client
| type | payload | meaning |
|---|---|---|
| `message.new` | full message obj + temp_id echo | broadcast to conversation members |
| `message.ack` | temp_id, real message_id, status | confirm sender's optimistic message → `sent` |
| `receipt.update` | conversation_id, user_id, last_read_id, last_delivered_id | pointer moved (drives checks) |
| `typing` | conversation_id, user_id, is_typing | someone typing |
| `presence` | user_id, online, last_seen_at | online/last-seen change |
| `reaction.update` | message_id, reactions[] | reaction changed |
| `member.update` | conversation_id, event, member | added/removed/role change |

### Delivery flow
sender emits `message.send` → server persists → `message.ack` to sender
(`sending`→`sent`) → `message.new` broadcast to other online members → on receipt
server bumps their delivered pointer → `receipt.update` back to sender (single →
double check). When recipient opens the chat → `message.read` → read pointer bumps
→ `receipt.update` → filled double check.

### Presence / typing
In-memory only (connection manager tracks who is connected). `users.last_seen_at`
written on disconnect.

---

## 3. REST API Surface

Base `/api`. JWT bearer on all routes except auth. REST handles request/response
CRUD + history; WebSocket handles live push. Sending is WebSocket-primary;
`POST /messages` exists as a REST fallback so the API is testable without a socket.

### Auth (mocked OTP)
```
POST /auth/request-otp      { phone|username }        → { ok }            # always "sends" fixed OTP
POST /auth/verify-otp       { handle, otp }           → { token, user, is_new }
POST /auth/complete-profile { display_name, avatar }  → { user }          # first-time setup
GET  /auth/me                                          → { user }
POST /auth/logout                                      → { ok }
```

### Users / Contacts
```
GET   /users/search?q=          → [users]             # add-contact search
GET   /contacts                 → [contacts]
POST  /contacts   { user_id }   → { contact }
PATCH /users/me   { display_name, about, avatar }     → { user }
```

### Conversations
```
GET   /conversations                        → [conv + last_message + unread_count]   # sorted recent
POST  /conversations  { type, member_ids, name?, avatar? }  → { conv }   # direct dedups
GET   /conversations/{id}                   → { conv + members }
GET   /conversations/{id}/messages?before=&limit=  → [messages]          # cursor-paginated history
PATCH /conversations/{id}  { name, avatar } → { conv }                    # group admin
```

### Group membership (admin)
```
POST   /conversations/{id}/members  { user_ids }       → { members }
DELETE /conversations/{id}/members/{user_id}           → { ok }
PATCH  /conversations/{id}/members/{user_id}  { role } → { member }
POST   /conversations/{id}/leave                       → { ok }
```

### Messages / attachments
```
POST /messages   { conversation_id, content, reply_to_id? }  → { message }   # REST fallback
POST /uploads    (multipart)   → { url, mime, size, w, h }   # attachment → Azure Blob/local
```

### Notes
- Unread count = messages after member's `last_read_message_id`.
- Pagination = cursor on message id (`before=`), not offset — stable under concurrent inserts.
- Direct conversation creation dedups against an existing direct thread between the two users.

---

## 4. Architecture & Data Flow

### Backend layering (FastAPI)
```
app/
  main.py            app factory, CORS, router mount, WS route
  core/              config, security (JWT), db session
  models/            SQLAlchemy models (one file per entity)
  schemas/           Pydantic request/response
  api/               REST routers (auth, users, conversations, messages, uploads)
  ws/
    manager.py       ConnectionManager: user_id → sockets, broadcast helpers
    handlers.py      per-event-type dispatch (message.send, typing, ...)
  services/          business logic (conversation dedup, receipt bump, membership)
  seed.py            seed script
  alembic/           migrations
```
Layer direction: **api/ws → services → models**. Routers stay thin (parse,
authorize, delegate). Services own all logic and are the only layer touching the
DB session, so the WebSocket and REST paths share one code path (both call
`services.messages.create`).

### Frontend layering (Next.js App Router)
```
app/
  (auth)/            login, otp, profile setup
  (app)/             main shell — conversation list + chat pane
  layout.tsx         theme provider (dark default)
lib/
  api.ts             REST client (TanStack Query hooks)
  ws.ts              single WebSocket client + reconnect
  store/             Zustand slices (messages, typing, presence, auth)
components/
  chat/              MessageBubble, MessageList, Composer, TypingIndicator, Receipt
  conversation/      ConvList, ConvItem, SearchBar, NewChatModal, NewGroupModal
  ui/                shadcn primitives
```

### Data flow — send message
1. User types → Composer → optimistic append to Zustand (status `sending`, temp_id).
2. `ws.send(message.send)` → server persists via `services.messages.create`.
3. `message.ack` → Zustand swaps temp_id for real id, status `sent`.
4. `message.new` broadcast → other members' MessageList updates; TanStack Query
   conversation-list cache invalidated (reorder + unread badge).
5. Recipient delivered/read → `receipt.update` → sender's bubble check advances.

### Auth / session persistence
JWT in localStorage, rehydrated on load, attached to REST (bearer) and WS (query
param). Logout clears storage and closes the socket.

---

## 5. Seed Data Plan

Concrete seed users + credentials live in `SEED_USERS.md`. Shape:

- 7 users with realistic names + avatars; user #1 is the primary demo login.
- Fixed mock OTP for every user: **`123456`** (documented in README + `SEED_USERS.md`).
- 3 direct conversations + 2 groups (demo user is admin in one group).
- ~15–30 messages per conversation, varied timestamps, some replies, some reactions.
- Mixed read/unread so unread badges + receipt states show immediately on load.
- 1 conversation carrying an image attachment to exercise that path.
