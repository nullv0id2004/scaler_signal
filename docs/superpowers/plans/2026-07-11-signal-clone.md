# Signal Clone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a functional Signal messenger clone — real-time 1-on-1 + group chat, mocked OTP auth, receipts, typing, reactions, replies, attachments — with a FastAPI + SQLite backend and a Next.js frontend.

**Architecture:** FastAPI async backend, layered api/ws → services → SQLAlchemy 2.0 models on SQLite (WAL). Real-time over native FastAPI WebSockets with an in-process connection manager. Next.js App Router frontend, Zustand for live state, TanStack Query for REST, Tailwind + shadcn/ui styling. JWT auth carried on both REST (bearer) and WS (query param).

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy 2.0 (async, aiosqlite), Alembic, Pydantic v2, python-jose, pytest + pytest-asyncio + httpx. Next.js 15 (App Router) + TypeScript, Tailwind, shadcn/ui, Zustand, TanStack Query, Vitest + Playwright.

## Global Constraints

- Database: **SQLite only**, WAL mode enabled at startup (`PRAGMA journal_mode=WAL`). Models stay dialect-agnostic.
- Auth: mocked OTP, fixed code **`123456`**, stateless JWT (HS256).
- Seed source of truth: `docs/SEED_USERS.md` — 7 users, exact usernames `alice bob carol david emma frank grace`.
- Conversation model: single `conversations` table with `type ∈ {direct, group}` + `conversation_members` join. No separate direct/group tables.
- Receipts: per-member pointers (`last_read_message_id`, `last_delivered_message_id`). No per-message receipt rows.
- Message send path is WebSocket-primary; `POST /messages` is a REST fallback. Both call the same `services.messages.create`.
- Every backend task is TDD: failing test → run-fail → implement → run-pass → commit.
- Dark mode is the default theme.

---

## File Structure

**Backend (`backend/`)**
```
app/
  main.py                 app factory, CORS, lifespan (WAL pragma), router + WS mount
  core/
    config.py             Settings (env): DB URL, JWT secret, CORS origins, fixed OTP
    db.py                 async engine, session factory, Base, get_session dep
    security.py           JWT encode/decode, get_current_user deps (REST + WS)
  models/
    user.py conversation.py member.py message.py reaction.py attachment.py
  schemas/
    auth.py user.py conversation.py message.py ws.py
  services/
    auth.py users.py conversations.py messages.py membership.py receipts.py
  api/
    auth.py users.py conversations.py messages.py uploads.py
  ws/
    manager.py            ConnectionManager
    handlers.py           event dispatch
    routes.py             /ws endpoint
  seed.py
alembic/ ...
tests/
  conftest.py             async client + fresh in-memory/file DB per test
  test_auth.py test_conversations.py test_messages.py test_receipts.py
  test_membership.py test_ws.py
```

**Frontend (`frontend/`)**
```
app/
  layout.tsx              theme provider (dark default), query provider
  (auth)/login/page.tsx  (auth)/verify/page.tsx  (auth)/setup/page.tsx
  (app)/layout.tsx        two-pane shell + ws bootstrap
  (app)/page.tsx          empty state
  (app)/c/[id]/page.tsx   chat pane
lib/
  api.ts                  REST client + TanStack hooks
  ws.ts                   WebSocket client + reconnect + dispatch to store
  auth.ts                 token storage + rehydrate
  types.ts                shared TS types (mirror backend schemas)
  store/
    auth.ts messages.ts conversations.ts presence.ts
components/
  conversation/  ConvList ConvItem SearchBar NewChatModal NewGroupModal
  chat/          Header MessageList MessageBubble Composer TypingIndicator Receipt ReactionBar ReplyPreview
  settings/      SettingsModal (placeholders)
  ui/            shadcn primitives
```

---

## PHASE 0 — Backend Scaffold

### Task 0.1: Project scaffold + config + DB engine

**Files:**
- Create: `backend/pyproject.toml`, `backend/app/__init__.py`, `backend/app/core/config.py`, `backend/app/core/db.py`, `backend/app/main.py`, `backend/tests/conftest.py`, `backend/tests/test_health.py`

**Interfaces:**
- Produces: `Settings` (config.py) with `database_url: str`, `jwt_secret: str`, `jwt_algorithm='HS256'`, `access_token_expire_minutes: int`, `fixed_otp='123456'`, `cors_origins: list[str]`. `Base` (declarative), `async_session` factory, `get_session()` dependency (db.py). `create_app() -> FastAPI` (main.py) mounting a `GET /api/health → {"status":"ok"}`.

- [ ] **Step 1: Write the failing test**
```python
# backend/tests/test_health.py
import pytest

@pytest.mark.asyncio
async def test_health(client):
    r = await client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd backend && pytest tests/test_health.py -v`
Expected: FAIL (no app / fixture).

- [ ] **Step 3: Implement scaffold**

`pyproject.toml` deps: `fastapi`, `uvicorn[standard]`, `sqlalchemy>=2`, `aiosqlite`, `alembic`, `pydantic-settings`, `python-jose[cryptography]`, `python-multipart`, `passlib`; dev: `pytest`, `pytest-asyncio`, `httpx`, `anyio`.

`config.py`:
```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite+aiosqlite:///./signal.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    fixed_otp: str = "123456"
    cors_origins: list[str] = ["http://localhost:3000"]

settings = Settings()
```

`db.py`:
```python
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import event
from .config import settings

class Base(DeclarativeBase): pass

engine = create_async_engine(settings.database_url, echo=False)

@event.listens_for(engine.sync_engine, "connect")
def _wal(dbapi_conn, _):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

async def get_session():
    async with async_session() as s:
        yield s
```

`main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .core.config import settings

def create_app() -> FastAPI:
    app = FastAPI(title="Signal Clone API")
    app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                       allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
    @app.get("/api/health")
    async def health(): return {"status": "ok"}
    return app

app = create_app()
```

`conftest.py`: fresh file DB per test session, create_all/drop_all, httpx ASGITransport client fixture. Use a temp sqlite file, override `get_session`.
```python
import pytest, pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import create_app
from app.core.db import Base, engine

@pytest_asyncio.fixture(autouse=True)
async def _schema():
    async with engine.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as c:
        await c.run_sync(Base.metadata.drop_all)

@pytest_asyncio.fixture
async def client():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c
```
Set `pytest.ini` / pyproject `[tool.pytest.ini_options] asyncio_mode = "auto"`.

- [ ] **Step 4: Run to verify it passes**
Run: `cd backend && pytest tests/test_health.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add backend/pyproject.toml backend/app backend/tests
git commit -m "feat(backend): scaffold FastAPI app, config, async SQLite engine (WAL)"
```

---

## PHASE 1 — Models & Migrations

### Task 1.1: SQLAlchemy models (all entities)

**Files:**
- Create: `backend/app/models/__init__.py`, `user.py`, `conversation.py`, `member.py`, `message.py`, `reaction.py`, `attachment.py`, `backend/tests/test_models.py`

**Interfaces:**
- Produces: `User, Conversation, ConversationMember, Message, MessageReaction, Attachment` ORM classes matching `docs/DESIGN.md §1`. Enums: `ConversationType('direct','group')`, `MemberRole('admin','member')`, `MessageType('text','image','file','system')`. `__init__.py` re-exports all + imports so `Base.metadata` sees them.

- [ ] **Step 1: Write the failing test**
```python
# backend/tests/test_models.py
from app.models import User, Conversation, ConversationMember, Message
from app.core.db import async_session

async def test_create_message_chain():
    async with async_session() as s:
        u = User(username="alice", display_name="Alice")
        s.add(u); await s.flush()
        c = Conversation(type="direct", created_by=u.id)
        s.add(c); await s.flush()
        s.add(ConversationMember(conversation_id=c.id, user_id=u.id, role="admin"))
        m = Message(conversation_id=c.id, sender_id=u.id, type="text", content="hi")
        s.add(m); await s.commit()
        assert m.id and m.created_at is not None
```

- [ ] **Step 2: Run to verify it fails**
Run: `cd backend && pytest tests/test_models.py -v` → FAIL (no models).

- [ ] **Step 3: Implement models**

Each model uses `Mapped`/`mapped_column`, `id` int PK, timezone-aware `created_at` default `func.now()`. Key columns per `docs/DESIGN.md §1`. Example `message.py`:
```python
from datetime import datetime
from sqlalchemy import ForeignKey, Text, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.db import Base

class Message(Base):
    __tablename__ = "messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"))
    sender_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    type: Mapped[str] = mapped_column(String, default="text")
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    reply_to_message_id: Mapped[int | None] = mapped_column(ForeignKey("messages.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    edited_at: Mapped[datetime | None] = mapped_column(nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(nullable=True)
```
Implement the other five analogously (columns per DESIGN §1). `ConversationMember` has `UNIQUE(conversation_id, user_id)`, `last_read_message_id`, `last_delivered_message_id`, `role`, `muted` (default False). `MessageReaction` `UNIQUE(message_id, user_id, emoji)`. `Attachment` FK message_id + url/filename/mime_type/size_bytes/width/height.

- [ ] **Step 4: Run to verify it passes** → PASS.
- [ ] **Step 5: Commit**
```bash
git add backend/app/models backend/tests/test_models.py
git commit -m "feat(backend): SQLAlchemy models for users, conversations, members, messages, reactions, attachments"
```

### Task 1.2: Alembic init + first migration

**Files:** Create `backend/alembic.ini`, `backend/alembic/env.py` (async), `backend/alembic/versions/0001_init.py`.

- [ ] **Step 1:** Configure async `env.py` targeting `Base.metadata`.
- [ ] **Step 2:** `alembic revision --autogenerate -m "init"` → produces `0001_init.py` with all tables.
- [ ] **Step 3:** `alembic upgrade head` on a scratch DB; verify tables exist (`sqlite3 signal.db ".tables"`).
- [ ] **Step 4: Commit**
```bash
git add backend/alembic backend/alembic.ini
git commit -m "chore(backend): alembic async migrations + initial schema"
```

---

## PHASE 2 — Auth

### Task 2.1: JWT security helpers

**Files:** Create `backend/app/core/security.py`, `backend/tests/test_security.py`.

**Interfaces:**
- Produces: `create_access_token(user_id: int) -> str`, `decode_token(token: str) -> int` (returns user_id, raises on invalid), `get_current_user(session, token) -> User` REST dependency, `get_user_from_token(session, token) -> User | None` for WS.

- [ ] **Step 1: failing test** — encode then decode returns same user_id; tampered token raises.
```python
from app.core.security import create_access_token, decode_token
def test_roundtrip():
    t = create_access_token(42)
    assert decode_token(t) == 42
```
- [ ] **Step 2:** run-fail.
- [ ] **Step 3:** implement with `python-jose`, `sub=str(user_id)`, `exp` from settings. `get_current_user` uses `OAuth2PasswordBearer`/`Authorization: Bearer`, loads User or raises 401.
- [ ] **Step 4:** run-pass.
- [ ] **Step 5: commit** `feat(backend): JWT create/decode + current-user deps`.

### Task 2.2: Auth service + schemas

**Files:** Create `backend/app/schemas/auth.py`, `backend/app/schemas/user.py`, `backend/app/services/auth.py`, `backend/app/services/users.py`.

**Interfaces:**
- Produces: `services.auth.verify_otp(session, handle, otp) -> tuple[User, bool]` (creates user if new when handle unknown? — NO: user must exist from seed or be created via request-otp; see below). `services.users.get_by_handle`, `services.users.create`, `services.users.update_profile`. Schemas: `RequestOtpIn{handle}`, `VerifyOtpIn{handle, otp}`, `TokenOut{token, user, is_new}`, `UserOut`, `CompleteProfileIn{display_name, avatar_url?}`.
- **Rule:** `verify_otp` rejects any otp != `settings.fixed_otp` (401). If handle has no user, create a minimal user (username=handle) and mark `is_new=True` so the client routes to profile setup.

- [ ] **Step 1: failing test** (in test_auth via service call) — wrong otp raises, right otp returns user.
- [ ] **Step 2:** run-fail. **Step 3:** implement. **Step 4:** run-pass. **Step 5: commit** `feat(backend): auth + user services, otp verification`.

### Task 2.3: Auth API router

**Files:** Create `backend/app/api/auth.py`; Modify `backend/app/main.py` (include router). Test `backend/tests/test_auth.py`.

**Interfaces:**
- Produces endpoints per `docs/DESIGN.md §3 Auth`: `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`, `POST /api/auth/complete-profile`, `GET /api/auth/me`, `POST /api/auth/logout`.

- [ ] **Step 1: failing test**
```python
async def test_login_flow(client):
    await client.post("/api/auth/request-otp", json={"handle": "newuser"})
    r = await client.post("/api/auth/verify-otp", json={"handle": "newuser", "otp": "123456"})
    assert r.status_code == 200
    body = r.json(); assert body["is_new"] is True and body["token"]
    me = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.json()["username"] == "newuser"

async def test_bad_otp(client):
    r = await client.post("/api/auth/verify-otp", json={"handle": "x", "otp": "000000"})
    assert r.status_code == 401
```
- [ ] **Step 2:** run-fail. **Step 3:** implement router, mount in main. **Step 4:** run-pass. **Step 5: commit** `feat(backend): auth API (request/verify otp, me, profile, logout)`.

---

## PHASE 3 — Conversations, Messages, Receipts (REST)

### Task 3.1: Conversation service + direct dedup

**Files:** Create `backend/app/schemas/conversation.py`, `backend/app/services/conversations.py`. Test `backend/tests/test_conversations.py`.

**Interfaces:**
- Produces: `create_conversation(session, creator, type, member_ids, name?, avatar?) -> Conversation` (direct dedups: if type=direct and a direct conv already exists with exactly {creator, other}, return it). `list_for_user(session, user) -> list[ConvSummary]` (includes last_message, unread_count derived from member.last_read_message_id). `get_with_members(session, conv_id, user)` (403 if not member). Schemas `ConversationOut`, `ConversationSummaryOut`, `CreateConversationIn`.

- [ ] **Step 1: failing test** — creating direct twice returns same id; unread_count counts messages after read pointer.
```python
async def test_direct_dedup(session, alice, bob):
    c1 = await create_conversation(session, alice, "direct", [bob.id])
    c2 = await create_conversation(session, alice, "direct", [bob.id])
    assert c1.id == c2.id
```
(Add `alice`/`bob`/`session` fixtures to conftest — seed two users.)
- [ ] **Step 2:** run-fail. **Step 3:** implement dedup query (find direct conv whose member set == the pair). **Step 4:** run-pass. **Step 5: commit** `feat(backend): conversation service with direct dedup + unread counts`.

### Task 3.2: Message service (create, history, soft-delete)

**Files:** Create `backend/app/schemas/message.py`, `backend/app/services/messages.py`. Test `backend/tests/test_messages.py`.

**Interfaces:**
- Produces: `create(session, sender, conversation_id, content, reply_to_id=None, type="text", attachment=None) -> Message` (asserts sender is a member; bumps conv activity). `history(session, user, conversation_id, before=None, limit=30) -> list[Message]` (cursor on id desc, excludes hard-nothing; returns soft-deleted as tombstones). `serialize(message) -> MessageOut` including reactions + attachment + reply preview. This is the shared send path used by REST and WS.

- [ ] **Step 1: failing test** — create message, history returns it; non-member create raises 403; `before` cursor paginates.
- [ ] **Step 2:** run-fail. **Step 3:** implement. **Step 4:** run-pass. **Step 5: commit** `feat(backend): message service (create, cursor history, serialize)`.

### Task 3.3: Receipts service (delivered/read pointers)

**Files:** Create `backend/app/services/receipts.py`. Test `backend/tests/test_receipts.py`.

**Interfaces:**
- Produces: `mark_read(session, user, conversation_id, message_id) -> ConversationMember` (advances `last_read_message_id` monotonically — never moves backward). `mark_delivered(session, user, conversation_id, message_id)`. `status_for(message, members) -> 'sent'|'delivered'|'read'` (min pointer across other members). Never moves a pointer backwards.

- [ ] **Step 1: failing test** — mark_read advances; a lower id does not regress it; status derivation returns 'read' when all others' read pointer ≥ id.
- [ ] **Step 2:** run-fail. **Step 3:** implement. **Step 4:** run-pass. **Step 5: commit** `feat(backend): receipt pointers + status derivation`.

### Task 3.4: Conversations + messages REST routers

**Files:** Create `backend/app/api/conversations.py`, `backend/app/api/messages.py`; Modify `main.py`. Extend `test_conversations.py`, `test_messages.py` with HTTP-level tests.

**Interfaces:**
- Produces endpoints per `docs/DESIGN.md §3` Conversations + Messages (`GET/POST /conversations`, `GET /conversations/{id}`, `GET /conversations/{id}/messages`, `PATCH /conversations/{id}`, `POST /messages`).

- [ ] **Step 1: failing test** — authed user creates conversation over HTTP, posts a message via `POST /messages`, fetches history; non-member gets 403.
- [ ] **Step 2:** run-fail. **Step 3:** implement thin routers delegating to services. **Step 4:** run-pass. **Step 5: commit** `feat(backend): conversations + messages REST API`.

### Task 3.5: Membership service + admin routes

**Files:** Create `backend/app/services/membership.py`, `backend/app/api` additions in `conversations.py`. Test `backend/tests/test_membership.py`.

**Interfaces:**
- Produces: `add_members`, `remove_member`, `set_role`, `leave` — each emits a `type='system'` message ("X added Y", "X left"). Admin-only guarded (raise 403 if caller role != admin for add/remove/set_role). Endpoints per `docs/DESIGN.md §3` group membership block.

- [ ] **Step 1: failing test** — admin adds member (member count +1, system message present); non-admin add → 403; remove emits system message.
- [ ] **Step 2:** run-fail. **Step 3:** implement. **Step 4:** run-pass. **Step 5: commit** `feat(backend): group membership admin controls + system messages`.

### Task 3.6: Reactions + uploads

**Files:** Create `backend/app/services/reactions.py`, `backend/app/api/uploads.py`; add reaction endpoints (or handle purely via WS — see Phase 4). Test additions.

**Interfaces:**
- Produces: `reactions.toggle(session, user, message_id, emoji) -> list[reaction]` (add if absent, remove if present, UNIQUE-guarded). `POST /api/uploads` (multipart) saves to local `./uploads` (dev) / Azure Blob (prod flag) → returns `{url, mime, size, width, height}`. Static serve `/uploads/*` in dev.

- [ ] **Step 1: failing test** — toggle adds then removes; upload returns a url; image dimensions parsed (use Pillow, add dep).
- [ ] **Step 2:** run-fail. **Step 3:** implement. **Step 4:** run-pass. **Step 5: commit** `feat(backend): reactions toggle + attachment uploads`.

---

## PHASE 4 — WebSockets

### Task 4.1: ConnectionManager

**Files:** Create `backend/app/ws/manager.py`. Test `backend/tests/test_ws_manager.py`.

**Interfaces:**
- Produces: `ConnectionManager` with `connect(user_id, ws)`, `disconnect(user_id, ws)`, `send_to_user(user_id, data)`, `broadcast(user_ids, data)`, `online_users() -> set[int]`, `is_online(user_id) -> bool`. Holds `dict[int, set[WebSocket]]`. Singleton `manager`.

- [ ] **Step 1: failing test** — connect registers, is_online true; disconnect removes; broadcast fans to fakes (use a stub object recording `send_json`).
- [ ] **Step 2:** run-fail. **Step 3:** implement. **Step 4:** run-pass. **Step 5: commit** `feat(backend): websocket connection manager`.

### Task 4.2: WS route + auth + handlers

**Files:** Create `backend/app/ws/routes.py`, `backend/app/ws/handlers.py`, `backend/app/schemas/ws.py`; Modify `main.py` (mount ws). Test `backend/tests/test_ws.py` (use `httpx`/`websockets` or Starlette `TestClient.websocket_connect`).

**Interfaces:**
- Produces: `GET /ws?token=<JWT>` endpoint. On connect: auth via `get_user_from_token`, register in manager, broadcast `presence online`. Dispatch incoming per `docs/DESIGN.md §2` Client→Server table to `handlers`:
  - `message.send` → `services.messages.create` → `message.ack` to sender → `message.new` broadcast to members → bump delivered for online members → `receipt.update` to sender.
  - `typing.start/stop` → `typing` broadcast to other members.
  - `message.read` → `receipts.mark_read` → `receipt.update` broadcast.
  - `reaction.add/remove` → `reactions.toggle` → `reaction.update` broadcast.
  On disconnect: unregister, write `users.last_seen_at`, broadcast `presence offline`.

- [ ] **Step 1: failing test**
```python
# using starlette TestClient (sync) against create_app()
def test_ws_message_roundtrip(seeded_app_url, alice_token, bob_token, direct_conv_id):
    # alice connects, bob connects; alice sends message.send; bob receives message.new; alice receives message.ack
    ...
```
(Concrete: connect two websockets, send from one, assert the other receives `message.new` with the content and the sender gets `message.ack` echoing temp_id.)
- [ ] **Step 2:** run-fail. **Step 3:** implement route + handlers. **Step 4:** run-pass. **Step 5: commit** `feat(backend): websocket endpoint, auth, message/typing/read/reaction handlers`.

---

## PHASE 5 — Seed

### Task 5.1: Seed script

**Files:** Create `backend/app/seed.py`. Test `backend/tests/test_seed.py`.

**Interfaces:**
- Produces: `python -m app.seed` — idempotent (wipe+recreate or upsert). Creates the 7 users from `docs/SEED_USERS.md` (exact usernames/display names), 3 directs + 2 groups with the membership from that doc, ~15–30 messages/conversation with staggered timestamps, some replies + reactions, one image attachment in Alice↔Bob, and mixed read pointers so unread badges show.

- [ ] **Step 1: failing test** — after seed, 7 users exist, `alice` is admin of "Weekend Trip", at least one conversation has unread for `grace`.
- [ ] **Step 2:** run-fail. **Step 3:** implement. **Step 4:** run-pass. **Step 5: commit** `feat(backend): seed script matching SEED_USERS.md`.

---

## PHASE 6 — Frontend Scaffold & Auth

### Task 6.1: Next.js scaffold + Tailwind + providers + theme

**Files:** Create `frontend/` (Next 15 App Router, TS), `app/layout.tsx`, `app/globals.css`, `lib/types.ts`, `lib/api.ts` (axios/fetch + base URL), `components/providers.tsx` (TanStack QueryClientProvider), theme with dark default. Configure shadcn/ui.

- [ ] **Step 1:** `npx create-next-app@latest frontend --ts --tailwind --app --eslint`. Add TanStack Query, Zustand, shadcn init.
- [ ] **Step 2:** Signal color tokens in `globals.css` (dark palette default: bg `#1b1b1b`-ish, accent Signal blue `#2c6bed`, sent-bubble blue, received-bubble grey). Provider wraps children.
- [ ] **Step 3:** Verify dev server renders a themed page. `npm run build` passes.
- [ ] **Step 4: commit** `feat(frontend): Next.js scaffold, Tailwind, providers, dark theme tokens`.

### Task 6.2: Auth flow (login → OTP → setup) + token store

**Files:** Create `app/(auth)/login/page.tsx`, `verify/page.tsx`, `setup/page.tsx`, `lib/auth.ts`, `lib/store/auth.ts`. Test `frontend/tests/auth.spec.ts` (Playwright, later) or Vitest for store.

**Interfaces:**
- Consumes: backend `/api/auth/*`. Produces: `useAuth` store `{ user, token, login(handle), verify(handle,otp), completeProfile(...), logout(), rehydrate() }`; token persisted to localStorage.

- [ ] **Step 1:** Build login (handle input), verify (OTP input, hint fixed `123456`), setup (display name + avatar) matching Signal's minimalist onboarding.
- [ ] **Step 2:** Wire to backend; on verify store token + user; `is_new` → route to setup, else → app.
- [ ] **Step 3:** Manual verify against running backend: log in as `alice`/`123456` lands in app.
- [ ] **Step 4: commit** `feat(frontend): mocked OTP auth flow + token persistence`.

---

## PHASE 7 — Frontend Core UI

### Task 7.1: App shell + conversation list

**Files:** Create `app/(app)/layout.tsx` (two-pane), `app/(app)/page.tsx` (empty state), `components/conversation/*`, `lib/store/conversations.ts`, TanStack hooks `useConversations`.

- [ ] **Step 1:** Two-pane Signal layout: left conv list (avatar, name, last-message preview, timestamp, unread badge), right empty state. Search bar filters conversations + contacts.
- [ ] **Step 2:** Fetch `/api/conversations`, sort by recent, render. NewChatModal + NewGroupModal (member multi-select from `/users/search`).
- [ ] **Step 3:** Manual verify: seeded conversations show with unread badges, sorted recent.
- [ ] **Step 4: commit** `feat(frontend): app shell + conversation list + new chat/group modals`.

### Task 7.2: WebSocket client + live store

**Files:** Create `lib/ws.ts`, `lib/store/messages.ts`, `lib/store/presence.ts`.

**Interfaces:**
- Produces: `connectWs(token)` singleton, auto-reconnect, dispatches server events (`message.new`, `message.ack`, `receipt.update`, `typing`, `presence`, `reaction.update`, `member.update`) into stores. `sendWs(type, payload)`. Bootstrapped in `(app)/layout.tsx`.

- [ ] **Step 1:** Implement client + reconnect/backoff, event dispatch mapping to store actions (matches `docs/DESIGN.md §2`).
- [ ] **Step 2:** Optimistic send: append temp message, reconcile on `message.ack`.
- [ ] **Step 3:** Manual verify: two browsers, message from A appears in B in real time.
- [ ] **Step 4: commit** `feat(frontend): websocket client + live message/presence stores`.

### Task 7.3: Chat pane — messages, composer, receipts, typing

**Files:** Create `app/(app)/c/[id]/page.tsx`, `components/chat/*`.

- [ ] **Step 1:** MessageList (grouped by day, sender grouping), MessageBubble (sent blue right / received grey left, timestamp, check states single→double→filled-blue read), Composer (textarea, send on Enter), TypingIndicator, Header (name, avatar, presence/last-seen).
- [ ] **Step 2:** Load history via `/conversations/{id}/messages`, paginate on scroll-up (cursor `before`). Send via `sendWs('message.send')`. Emit `typing.start/stop` (debounced). On open/scroll bottom emit `message.read`.
- [ ] **Step 3:** Manual verify: send/receive live, receipts advance, typing shows, history paginates.
- [ ] **Step 4: commit** `feat(frontend): chat pane with bubbles, composer, receipts, typing`.

### Task 7.4: Reactions + replies + attachments UI

**Files:** Modify `components/chat/MessageBubble.tsx`, add `ReactionBar`, `ReplyPreview`; Composer attachment button + upload to `/api/uploads`.

- [ ] **Step 1:** Long-press/hover reaction picker → `reaction.add/remove`; render reaction pills. Reply: swipe/hover reply → quoted preview in composer + in bubble.
- [ ] **Step 2:** Attachment: pick image/file → `POST /uploads` → send message type image/file with attachment; render image thumbnails + file cards.
- [ ] **Step 3:** Manual verify all three against seed + live.
- [ ] **Step 4: commit** `feat(frontend): reactions, replies, attachments`.

### Task 7.5: Group management + settings placeholders + polish

**Files:** Add group info panel (members list, add/remove for admin, leave), `components/settings/SettingsModal` (privacy/notifications/appearance placeholders), "Coming Soon" stubs (calls, stories, linked devices).

- [ ] **Step 1:** Group info drawer: member list + roles, admin add/remove (calls membership API), leave group. Settings modal with placeholder sections + working dark-mode toggle.
- [ ] **Step 2:** Toasts/notifications for events (new message when not focused, member added). Responsive: mobile collapses to single pane.
- [ ] **Step 3:** Manual verify group admin flow + responsive + stubs render.
- [ ] **Step 4: commit** `feat(frontend): group management, settings placeholders, responsive polish`.

---

## PHASE 8 — Docs & Deploy

### Task 8.1: README + env + deploy config

**Files:** Create `README.md` (root), `backend/.env.example`, `frontend/.env.example`, `backend/Dockerfile`, deploy notes for Azure (Azure Files mount for SQLite, `wss://` + CORS).

- [ ] **Step 1:** README: tech stack, architecture overview, schema (embed `docs/DESIGN.md §1`), API overview (`§3`), setup steps (backend: install, migrate, seed, run; frontend: install, env, run), seed login table + fixed OTP, assumptions (mocked crypto/OTP, in-process WS, SQLite persistence caveat).
- [ ] **Step 2:** Dockerfile for backend; document Vercel (frontend) + Azure App Service (backend + Azure Files mount) deploy.
- [ ] **Step 3:** Verify a clean-clone setup by following the README steps end to end.
- [ ] **Step 4: commit** `docs: README, env examples, Azure deploy config`.

---

## Self-Review Notes
- **Spec coverage:** auth (2.x), contacts/conv-list (3.1, 7.1), 1-on-1 + group messaging (3.2/3.4/3.5, 7.3), receipts/typing/status (3.3, 4.2, 7.3), Signal UX (7.x), reactions/replies/attachments (3.6, 7.4), dark mode/responsive (6.1, 7.5), seed (5.1), placeholders (7.5), README/schema/API (8.1). All DESIGN sections mapped.
- **Send path** shared by REST (3.4) and WS (4.2) via `services.messages.create` — no divergence.
- **Receipt monotonicity** enforced in 3.3, consumed in 4.2/7.3.
- **Seed usernames** fixed to SEED_USERS.md across 5.1 and 6.2 manual checks.
