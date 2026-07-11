# User Profiles + Photo Editing — Design

**Date:** 2026-07-11
**Status:** Approved (pending spec review)

## Goal

Let a logged-in user **edit their own profile** (photo, display name, about) after
signup — not just during it — on a dedicated profile page, and let users **view
other people's profiles** (read-only) from chats and group member lists.

Avatar upload already exists in the signup/setup flow; the gap is editing it later
and a place to view profiles.

## Non-goals

- No new avatar storage mechanism — reuse `POST /api/uploads`.
- No follow/block/contact-note changes (contacts already exist separately).
- No changes to auth, OTP, or username immutability (username stays set-once at
  signup; profile edits cover display name, about, avatar only).
- No DB migration — `users` already has `avatar_url` and `about`.

## Backend

Two endpoints added to existing [`app/api/users.py`](../../../backend/app/api/users.py).
Business logic already exists in `user_service.update_profile`.

### `PATCH /api/users/me`
- Auth: required (`get_current_user`).
- Body (`UpdateProfileIn`, already defined): `{ display_name?, avatar_url?, about? }`
  — all optional; only provided fields change.
- Action: `user_service.update_profile(session, current_user, ...)`, commit, refresh.
- Returns: `UserOut` (the updated user).
- Notes: `display_name` if provided must be non-empty (trim, 400 on empty).
  `about` capped at a sane length (e.g. 500 chars) — reject longer with 400.

### `GET /api/users/{id}`
- Auth: required.
- Action: `user_service.get_by_id`.
- Returns: `UserOut` (public fields: id, username, display_name, avatar_url,
  about, last_seen_at).
- Errors: 404 if no such user.

### Tests (`backend/tests/`)
- `PATCH /users/me` updates each field independently; partial update leaves others
  intact; empty `display_name` → 400; over-long `about` → 400; unauth → 401.
- `GET /users/{id}` returns public profile; unknown id → 404; unauth → 401.

## Frontend

### API client ([`lib/api.ts`](../../../frontend/src/lib/api.ts))
- `updateMyProfile(body): Promise<User>` → `PATCH /users/me`.
- `getUser(id): Promise<User>` → `GET /users/{id}`.
- Reuse existing `uploadAttachment` for the photo, then PATCH the returned `url`
  as `avatar_url`.

### Own profile — `/(app)/profile` (new route)
- Shows current avatar (large) with a **Change photo** button → file picker →
  `uploadAttachment` → preview → included on Save.
- Editable **display name** (text input) and **about** (textarea).
- Read-only **@username** and phone (not editable).
- **Save** → `updateMyProfile` → update auth store (`useAuthStore`) so the new
  avatar/name reflect everywhere immediately → success toast. Errors → toast.
- Entry points: sidebar avatar and SettingsModal gain an "Edit profile" link that
  navigates here. SettingsModal keeps theme/notification settings.

### Others' profile — `/(app)/u/[id]` (new route)
- Read-only: avatar, display name, @username, about, last-seen.
- Data via `getUser(id)` (TanStack Query).
- Loading + not-found (404) states.
- Entry points:
  - DM chat header ([`components/chat/Header.tsx`](../../../frontend/src/components/chat/Header.tsx))
    — tapping the other user's name/avatar navigates to `/u/{otherUserId}`.
  - Group member row in [`GroupInfoDrawer`](../../../frontend/src/components/chat/GroupInfoDrawer.tsx)
    — tapping a member navigates to `/u/{memberId}`.
- Viewing your own id via `/u/{me}` → show an "Edit profile" affordance linking to
  `/profile` (or just render read-only; edit lives on `/profile`).

### State / consistency
- On self-edit save, write the updated `User` back into `useAuthStore` so the
  avatar in the sidebar, headers, and message bubbles refresh without reload.
- Other users' profiles are fetched fresh (cached by TanStack Query per id).

## Data flow

```
Change photo:  file → POST /api/uploads → { url } → hold in form state
Save profile:  PATCH /api/users/me { display_name?, about?, avatar_url? }
               → UserOut → update useAuthStore
View someone:  GET /api/users/{id} → UserOut → render read-only
```

## Error handling

- Upload failure → toast, keep old photo.
- Save validation (empty name / long about) → 400 → inline field error + toast.
- `GET /users/{id}` 404 → "User not found" state on the page.
- All authed calls: 401 → existing global handler (redirect to login).

## Out-of-scope / future

- Cropping/resizing the avatar client-side (upload as-is for now).
- Presence/last-seen accuracy (already mocked).
