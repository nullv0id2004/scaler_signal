# Decision Log — Secure Messaging Platform (Signal Clone)

> Living document. Every architectural and stack decision + the reasoning behind it.
> Assignment: Scaler SDE Fullstack — Signal clone. Est. 24h effort.

---

## Legend
- **Status:** `locked` = decided, `pending` = awaiting approval, `open` = to revisit.
- Mandated = fixed by assignment brief, not our choice.

---

## 1. Tech Stack

### 1.1 Frontend framework — Next.js 15 (App Router) + TypeScript
**Status:** locked (mandated)
**Why:** Assignment requires Next.js + TypeScript. App Router is the current default; gives server components, layouts, route handlers.

### 1.2 Backend framework — FastAPI
**Status:** locked
**Why:** Chosen over Django + Channels. FastAPI is async-native with first-class WebSocket support — the natural fit for a real-time chat app. Lightweight, Pydantic validation built in, less boilerplate for the WebSocket path. Django + Channels would need Redis/ASGI channel layers and more scaffolding for the same real-time result. Trade-off accepted: we wire ORM + auth ourselves (Django gives those free), but that control is worth it here.

### 1.3 ORM — SQLAlchemy 2.0 (async, `aiosqlite` driver)
**Status:** locked
**Why:** Chosen over SQLModel and raw SQL. SQLAlchemy 2.0 is the industry standard with maximum control over queries/relationships — and the schema design is explicitly graded, so demonstrating real SQLAlchemy modeling has evaluation value. SQLModel is lighter but hides detail; raw SQL is more hand-work with no upside here. Async driver (`aiosqlite`) matches FastAPI's async endpoints.

### 1.4 Database — SQLite (WAL mode)
**Status:** locked (mandated)
**Why:** Assignment mandates SQLite. WAL (Write-Ahead Logging) mode enabled so reads don't block on writes during WebSocket traffic. SQLAlchemy abstracts the dialect, so a later swap to Postgres is near-zero code change if needed — but we stay on SQLite per the brief.
**Known limit:** Heavy concurrent writes serialize on SQLite. Fine for demo scale; flagged, not solved.

**Postgres vs SQLite — full analysis (for eval interview):**

_Postgres wins on pure engineering:_
- Real-time chat generates many concurrent writes (messages, receipt pointers, typing). SQLite serializes writes — one writer at a time, even in WAL mode. Postgres does true concurrent writes via MVCC.
- Azure deploy: SQLite is a single file on ephemeral App Service disk, needing an Azure Files mount or data is lost on redeploy. Azure Postgres is managed and persistent — no mount hack.
- Scale-out: SQLite can't run multi-instance; Postgres can.

_SQLite wins for this assignment:_
- **Mandated by the brief** — database design is graded, off-spec risks that score. Dominant factor.
- At eval scale (seed data + a few concurrent users) write serialization never triggers — the concurrency limit is theoretical at this load.
- Zero infra: no DB server, no connection secrets, no separate provisioning. Faster to ship in 24h.
- Portable: whole DB is one file — trivial to seed, reset, commit.

_Decision:_ **SQLite**, because it's mandated and the concurrency limits never bite at eval scale.
_De-risk:_ SQLAlchemy 2.0 abstracts the dialect, so models are written dialect-agnostic. Swapping to Postgres later = change connection URL + driver, near-zero model changes. Ship SQLite now, stay Postgres-ready.

### 1.5 Styling — Tailwind CSS + shadcn/ui
**Status:** locked
**Why:** Tailwind builds fast and gets us pixel-close to Signal's look quickly. shadcn/ui supplies accessible modals, forms, dropdowns, dialogs that match Signal's clean aesthetic without hand-rolling each. Chosen over CSS Modules (slower to reach fidelity) and CSS-in-JS (runtime cost, weaker App Router fit).

### 1.6 Frontend state — Zustand + TanStack Query
**Status:** locked
**Why:** Split by data nature. Zustand holds real-time/client state — the live message stream, typing indicators, presence — where a WebSocket pushes updates. TanStack Query handles REST fetching/caching (conversation list, contacts, message history) with built-in cache invalidation. React Context alone gets messy with high-frequency message streams; Redux Toolkit is overkill for 24h scope.

### 1.7 Real-time — FastAPI native WebSockets
**Status:** locked (mechanism choice)
**Why:** Assignment allows any real-time mechanism. FastAPI's built-in WebSocket endpoints + an in-process connection manager (maps user_id/conversation_id to live sockets for broadcast) covers everything: messages, typing, receipts, presence. No extra broker needed at demo scale.
**Known limit:** In-process manager is single-instance. Multi-instance scale-out would need Redis pub/sub. Out of scope; flagged.

### 1.8 Auth — JWT (stateless), mocked fixed OTP
**Status:** locked
**Why:** Chosen over server-side session cookies. JWT is stateless — no session store — and travels cleanly to the WebSocket handshake (token in connect query/subprotocol/header). Session cookies would need a store plus cross-domain cookie/CORS config between Vercel and Azure. OTP is mocked with a fixed code per the brief (no real phone verification). Tokens signed with `python-jose`.
**Security note:** This is a mocked auth flow for a demo. Real E2E crypto is explicitly out of scope per the brief (encryption simulated).

### 1.9 Migrations — Alembic
**Status:** locked
**Why:** Standard SQLAlchemy migration tool. Gives versioned schema so seed + setup is reproducible.

### 1.10 Deployment — Azure (backend) + Vercel/Azure (frontend)
**Status:** locked
**Why:** User deploys on Azure. Frontend on Vercel (native Next.js) or Azure Static Web Apps. Backend on Azure App Service / Container.
**Critical caveat:** Azure App Service local disk is **ephemeral** — wiped on restart/redeploy. SQLite file must live on a mounted **Azure Files** share (or a container persistent volume) or all data is lost on redeploy. WebSocket (`wss://`) + CORS configured across the two domains.

---

## 2. Data Model Decisions

### 2.1 Unified conversations table
**Status:** locked
**Why:** One `conversations` table with a `type` field (`direct`/`group`) + a `conversation_members` join table, instead of separate `direct_chats`/`group_chats` tables. A 1-on-1 is simply a 2-member conversation. Gives one code path for sending/reading messages, cleaner queries, trivial extensibility. This is how Signal itself models it. Separate tables would duplicate all message and membership logic.

### 2.2 Receipts — per-member pointer
**Status:** locked
**Why:** Each `conversation_members` row stores `last_read_message_id` and `last_delivered_message_id`. Any message's read/delivered state is derived by comparing its id to the pointer. Chosen over a per-message-per-user `message_receipts` table, which creates O(recipients) rows per message — heavy write amplification over WebSockets and poor on SQLite. Pointer approach is O(1) update per member. Group "read by all" = min read pointer across members. Matches Signal's model.

### 2.3 Message status flow
**Status:** locked
**Why:** Four states — `sending` (client-only optimistic UI, not persisted), `sent` (row committed to DB), `delivered` (recipient delivered pointer ≥ message id), `read` (recipient read pointer ≥ message id). Drives the single/double-check UX. Derived from pointers (see 2.2), no extra status column needed on messages.

### 2.4 Soft delete + system messages
**Status:** locked
**Why:** Messages use `deleted_at` soft delete (preserves thread integrity for replies). Membership changes (add/remove member, group created) emit `type='system'` messages so the timeline shows "X added Y" like Signal.

### 2.5 Direct conversation dedup
**Status:** locked
**Why:** Before creating a `direct` conversation, app layer checks for an existing direct conversation between the same two users and reuses it. Prevents duplicate 1-on-1 threads.

---

## 3. Feature Scope

### 3.1 Core features — all in (mandated)
Auth/onboarding, contacts + conversation list, 1-on-1 messaging, group messaging, Signal UX. All required.

### 3.2 Bonus features — building all four
**Status:** locked
**Why chosen:**
- **Dark mode + Responsive** — Signal ships dark by default; near-free with Tailwind, high visual payoff.
- **Reply / quoted messages** — `reply_to_message_id` self-FK; high Signal-fidelity, moderate cost.
- **Reactions (emoji)** — `message_reactions` table + real-time broadcast; moderate cost.
- **Attachments (images/files)** — file upload + storage (Azure Blob or local). **Heaviest bonus** — storage, upload endpoint, previews.
**Cut candidate:** Attachments is first to drop if the 24h budget tightens.

### 3.3 Mocked / "Coming Soon" stubs
Voice/video calls, Stories, Linked devices, real E2E encryption. Placeholder screens only, per brief.

---

## 4. Repository Structure
```
/frontend      Next.js app
/backend       FastAPI app
/docs          this decision log + design spec
README.md      setup, architecture, schema, API overview
```

---

## Open / Flagged Items
- SQLite concurrent-write serialization (demo-scale acceptable).
- In-process WebSocket manager = single instance only.
- Azure Files mount required for SQLite persistence.
- Attachments = scope cut candidate.
