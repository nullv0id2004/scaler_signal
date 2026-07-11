# Seed Users — Test Credentials

> Source of truth for `backend/app/seed.py`. Every seed user below is created on
> `python -m app.seed`. Auth is a **mocked OTP** flow — there are no passwords.
> Log in with the username (or phone) + the fixed OTP.

## Fixed OTP (all users)
```
123456
```
Any user's `request-otp` "sends" this code; `verify-otp` accepts only `123456`.

## Login users

| # | Display Name | Username    | Phone          | Role in demo                     |
|---|--------------|-------------|----------------|----------------------------------|
| 1 | Alice Carter | `alice`     | +1-202-555-0111 | **Primary demo login.** Admin of "Weekend Trip" group. |
| 2 | Bob Nguyen   | `bob`       | +1-202-555-0112 | 1-on-1 with Alice; group member. |
| 3 | Carol Diaz   | `carol`     | +1-202-555-0113 | 1-on-1 with Alice; group member. |
| 4 | David Osei   | `david`     | +1-202-555-0114 | Group member; sends attachment.  |
| 5 | Emma Ford    | `emma`      | +1-202-555-0115 | 1-on-1 with Bob; group member.   |
| 6 | Frank Lee    | `frank`     | +1-202-555-0116 | "Project X" group admin.         |
| 7 | Grace Kim    | `grace`     | +1-202-555-0117 | Group member; has unread msgs.   |

## How to log in (any user)
1. Open the app → login screen.
2. Enter the **username** (e.g. `alice`) or the phone number.
3. Enter OTP **`123456`**.
4. Existing seed users skip profile setup and land in the app.

## Seed conversations (reference)
- **Direct:** Alice↔Bob, Alice↔Carol, Bob↔Emma
- **Group "Weekend Trip":** Alice (admin), Bob, Carol, Emma
- **Group "Project X":** Frank (admin), David, Grace, Alice
- Mixed read/unread + one image attachment in Alice↔Bob so receipts and the
  attachment path are visible on first load.

> Note: exact phone numbers/avatars are finalized in `seed.py`; this table is the
> intended data and stays in sync with it.
