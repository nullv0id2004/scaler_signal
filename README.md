# Signal Clone — Secure Messaging Platform

A functional clone of the Signal messenger: real-time one-on-one and group chat with a privacy-focused, Signal-faithful UI. Register with a username/phone (mocked OTP), manage contacts, create direct and group conversations, and send/receive messages in real time with delivery/read receipts, typing indicators, reactions, replies, and attachments.

Encryption is simulated/mocked per the assignment brief — the focus is recreating Signal's UX and core messaging workflows, not real cryptography.

---

## 🚀 Try It Live

| | |
|---|---|
| **App** | **https://signal-frontend-d5geb2b4a9frb8ch.centralindia-01.azurewebsites.net** |
| **API** | https://signal-api-bwh8fse9esf2hjep.centralindia-01.azurewebsites.net |

**Log in (30 seconds, no real phone):**

1. Open the app and choose to log in by **phone**.
2. Enter one of the phone numbers below (e.g. Alice → country **US +1**, number **`2025550111`**).
3. The OTP is a **mocked dev code** — it's shown on the verify screen (and returned by `request-otp`). Enter it. That's it.

> There is **no fixed OTP** — a fresh code is generated each request. Just read the code the app shows you.

**Demo accounts** (all pre-loaded with conversations):

| Log in as | Phone | Country / number | Best for seeing… |
|---|---|---|---|
| **Alice Carter** | `+12025550111` | US +1 · `2025550111` | **Start here** — in 2 direct chats + both groups |
| Bob Nguyen | `+12025550112` | US +1 · `2025550112` | Direct chat with Alice & Emma |
| Carol Diaz | `+12025550113` | US +1 · `2025550113` | Direct chat with Alice |
| David Osei | `+12025550114` | US +1 · `2025550114` | "Project X" group |
| Emma Ford | `+12025550115` | US +1 · `2025550115` | Direct chat with Bob |
| Frank Lee | `+12025550116` | US +1 · `2025550116` | Admin of "Project X" |

**What's already in there:** 3 one-on-one chats (Alice↔Bob, Alice↔Carol, Bob↔Emma) and 2 groups — **Weekend Trip** (Alice, Bob, Carol, Emma) and **Project X** (Frank, David, Alice) — with real message threads.

**Play through it:** log in as **Alice** in one browser and **Bob** in a second (or an incognito window), open the Alice↔Bob chat in both, and watch messages, typing indicators, and read receipts sync live. Try creating a new group, reacting to a message, replying, or uploading an image.

Full transcript of the seeded data: [`docs/DEMO_DATA.md`](docs/DEMO_DATA.md).

---

## Tech Stack

**Backend**
- **FastAPI** (async) — async-native with first-class WebSocket support, the natural fit for real-time chat.
- **SQLAlchemy 2.0** (async, `aiosqlite`) + **Alembic** migrations — typed models, dialect-agnostic so a Postgres swap is a URL change.
- **SQLite** (WAL mode) — mandated by the brief; single-file, zero-infra, fine at demo scale.
- **JWT** auth (`python-jose`). Real OTP lifecycle (random, hashed, expiring, rate-limited) behind a pluggable `SmsSender` — console/dev sender by default (surfaces the code), Twilio adapter stubbed for production.
- **Native FastAPI WebSockets** + in-process connection manager for live push.
- **pytest** — 63 passing tests.

**Frontend**
- **Next.js** (App Router, TypeScript)
- **Tailwind CSS** + **shadcn/ui** — pixel-close to Signal, accessible primitives.
- **Zustand** — real-time/client state (live messages, typing, presence).
- **TanStack Query** — REST fetching/caching.
- Dark theme by default; responsive (mobile/tablet/desktop).

Rationale for each choice is documented in [`docs/DECISIONS.md`](docs/DECISIONS.md).

---

## Features

**Core**
- Full phone-based onboarding: country-code phone entry → real OTP (6-digit, expiring, rate-limited, resend) → profile setup (display name + avatar upload). Session persistence.
- Conversation list sorted by recent activity, search, unread badges, last-message preview, online/last-seen (mocked).
- One-on-one messaging in real time: timestamps, delivery/read receipts (single → double → filled-blue), typing indicators, message status (sending/sent/delivered/read). All persisted.
- Group messaging: create with name + members, view members, admin add/remove, role changes, leave. System messages ("X added Y"). All persisted.
- Signal-style navigation, message bubbles, modals, search, toasts, settings placeholders.

**Bonus (built)**
- Reply / quoted messages
- Emoji reactions
- Image / file attachments
- Dark mode + responsive design

**Mocked "Coming Soon" placeholders**
- Voice / video calls, Stories, Linked devices, real end-to-end encryption.

---

## Architecture

```
┌─────────────────────────┐         REST  /api/*  (JWT bearer)        ┌──────────────────────────┐
│  Next.js (App Router)   │  ────────────────────────────────────▶   │  FastAPI                 │
│                         │                                           │                          │
│  Zustand  (live state)  │         WebSocket  /ws?token=<JWT>        │  api/  ws/   ← routers   │
│  TanStack Query (REST)  │  ◀───────────────────────────────────▶   │    │      │              │
│  Tailwind + shadcn/ui   │         message.new / receipt.update /    │  services/  ← logic      │
│                         │         typing / presence / reaction      │    │                     │
└─────────────────────────┘                                           │  models/    ← SQLAlchemy │
                                                                      │    │                     │
                                                                      │  SQLite (WAL)            │
                                                                      └──────────────────────────┘
```

- **Layered backend:** `api`/`ws` routers stay thin (parse, authorize, delegate) → `services` own all business logic and DB access → `models`. The message-send path is shared: both the REST fallback and the WebSocket handler call `services.messages.create`, so there's one source of truth.
- **Real-time:** an in-process `ConnectionManager` maps `user_id → sockets` and broadcasts to conversation members. Single-instance by design (see Assumptions).
- **Auth:** stateless JWT, carried on REST as a bearer header and on the WebSocket as a `?token=` query param.
- **Two-pane UI:** conversation list + chat pane, collapsing to a single pane on mobile.

Full design in [`docs/DESIGN.md`](docs/DESIGN.md).

---

## Database Schema

Single **unified `conversations`** table (`type` = `direct` | `group`) with a `conversation_members` join — a 1-on-1 is just a two-member conversation, giving one code path for all messaging. Receipts use **per-member pointers** (`last_read_message_id`, `last_delivered_message_id`) rather than a per-message receipt table, so status is derived by comparison and updates are O(1) per member.

| Table | Key columns |
|---|---|
| `users` | id, username (unique), phone (unique, null), display_name, avatar_url, about, last_seen_at, created_at |
| `conversations` | id, type (direct/group), name (group), avatar_url (group), created_by, created_at |
| `conversation_members` | id, conversation_id, user_id, role (admin/member), joined_at, **last_read_message_id**, **last_delivered_message_id**, muted · UNIQUE(conversation_id, user_id) |
| `messages` | id, conversation_id, sender_id, type (text/image/file/system), content, reply_to_message_id (self-FK), created_at, edited_at, deleted_at (soft delete) |
| `message_reactions` | id, message_id, user_id, emoji · UNIQUE(message_id, user_id, emoji) |
| `attachments` | id, message_id, url, filename, mime_type, size_bytes, width, height |

Detail + rationale: [`docs/DESIGN.md §1`](docs/DESIGN.md) and [`docs/DECISIONS.md §2`](docs/DECISIONS.md).

---

## API Overview

**REST** (base `/api`, JWT bearer except auth):

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/request-otp` | `{ phone }` → generate + "send" OTP; returns `{ ok, expires_in, resend_in, dev_code? }` (dev_code in dev mode); 429 if rate-limited |
| POST | `/auth/verify-otp` | `{ phone, code }` → `{ token, user, is_new }`; 400 wrong/expired, 429 too many attempts; new phone auto-creates a user |
| POST | `/auth/complete-profile` | First-time display name + avatar |
| GET | `/auth/me` | Current user |
| GET | `/users/search?q=` | Search users to add |
| GET / POST | `/contacts` | List / add contacts |
| PATCH | `/users/me` | Update profile |
| GET / POST | `/conversations` | List (with last message + unread) / create (direct dedups) |
| GET | `/conversations/{id}` | Detail + members |
| GET | `/conversations/{id}/messages?before=&limit=` | Cursor-paginated history |
| PATCH | `/conversations/{id}` | Rename / avatar (group) |
| POST / DELETE / PATCH | `/conversations/{id}/members...` | Admin add / remove / role |
| POST | `/conversations/{id}/leave` | Leave group |
| POST | `/messages` | REST fallback send (WS is primary) |
| POST | `/uploads` | Attachment upload |

**WebSocket** (`/ws?token=<JWT>`, JSON `{ type, payload }`):

| Direction | Events |
|---|---|
| Client → Server | `message.send`, `typing.start` / `typing.stop`, `message.read`, `reaction.add` / `reaction.remove` |
| Server → Client | `message.new`, `message.ack`, `receipt.update`, `typing`, `presence`, `reaction.update`, `member.update` |

Protocol + delivery flow: [`docs/DESIGN.md §2–§3`](docs/DESIGN.md).

---

## Local Setup

**Prerequisites:** Python 3.11+ (repo developed on 3.12), Node.js 18+.

### Backend

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -e .
.venv/bin/alembic upgrade head          # create schema
.venv/bin/python -m app.seed            # seed 7 users + demo conversations
.venv/bin/uvicorn app.main:app --port 8000
```

Backend runs at `http://localhost:8000` (REST `/api`, WebSocket `/ws`, uploads `/uploads`). Optional config via `backend/.env` — see [`backend/.env.example`](backend/.env.example).

Run tests: `.venv/bin/pytest` (63 tests).

### Frontend

```bash
cd frontend
npm install
# defaults already point at localhost:8000; override via env if needed:
NEXT_PUBLIC_API_URL=http://localhost:8000 NEXT_PUBLIC_WS_URL=ws://localhost:8000 npm run dev
```

Open `http://localhost:3000`, log in by phone (US +1, `2025550111` for Alice); the dev OTP shows on the verify screen. See [`frontend/.env.example`](frontend/.env.example).

---

## Seed Data & Test Logins

> This section is for **local** development (`python -m app.seed`). To play with
> the **hosted** app instead, use the [🚀 Try It Live](#-try-it-live) accounts above.

`python -m app.seed` creates 7 users, 3 direct + 2 group conversations, ~100 messages with staggered timestamps, replies, reactions, one image attachment, and mixed read state (so unread badges appear). **Log in by phone** (real OTP; dev code shown on the verify screen + server console).

| Username | Display name | Notes |
|---|---|---|
| `alice` | Alice Carter | Primary demo login; admin of "Weekend Trip" |
| `bob` | Bob Nguyen | 1-on-1 with Alice |
| `carol` | Carol Diaz | 1-on-1 with Alice |
| `david` | David Osei | Group member; sends attachment |
| `emma` | Emma Ford | 1-on-1 with Bob |
| `frank` | Frank Lee | Admin of "Project X" |
| `grace` | Grace Kim | Has unread messages |

Full detail: [`docs/SEED_USERS.md`](docs/SEED_USERS.md).

---

## Deployment (Azure)

**Backend — Azure App Service (container) or Container Apps:**
1. Build the image: `docker build -t signal-backend ./backend`.
2. **Persist SQLite:** App Service local disk is *ephemeral* — wiped on restart/redeploy. Mount an **Azure Files** share at `/app/data` (the Dockerfile sets `DATABASE_URL=sqlite+aiosqlite:////app/data/signal.db`). Uploads live in `/app/uploads` — mount a share there too, or switch to Azure Blob.
3. Set env: `JWT_SECRET` (change it), `CORS_ORIGINS=["https://<your-frontend-domain>"]`. First deploy: set `SEED_ON_START=1` once to populate demo data, then unset (the seed resets demo data). Migrations run automatically on start.
4. Enable **WebSockets** on the App Service (Configuration → General settings → Web sockets → On) so `wss://` works.

**Frontend — Vercel or Azure Static Web Apps:**
1. Deploy the `frontend/` directory.
2. Set `NEXT_PUBLIC_API_URL=https://<backend-domain>` and `NEXT_PUBLIC_WS_URL=wss://<backend-domain>`.

The backend serves over `wss://` and REST over `https://`; ensure `CORS_ORIGINS` includes the frontend origin.

---

## Assumptions

- **Real OTP, dev SMS delivery:** OTP is genuinely generated/hashed/expiring/rate-limited, but delivered via a console/dev sender (code shown on-screen + logged) rather than a paid SMS provider — set `SMS_PROVIDER=twilio` + `TWILIO_*` to send real SMS (adapter stubbed). No real end-to-end encryption (simulated per the brief).
- **In-process WebSocket manager:** presence/typing and broadcast are single-instance. Horizontal scale-out would need a Redis pub/sub channel layer.
- **SQLite persistence:** single file; concurrent writes serialize (fine at demo scale). In production on Azure, the file must live on a mounted volume (above).
- **Seeding resets demo data:** `app.seed` wipes and recreates the demo dataset; don't run it against real data.
- **Presence/last-seen** is mocked from live socket connections; `last_seen_at` is written on disconnect.

---

## Repository Layout

```
backend/    FastAPI app (api, ws, services, models), Alembic, tests, seed, Dockerfile
frontend/   Next.js app (App Router, components, lib/store, lib/ws)
docs/       DECISIONS.md · DESIGN.md · SEED_USERS.md · implementation plan
```
