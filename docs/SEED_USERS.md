# Seed Users — Test Credentials

> Source of truth for `backend/app/seed.py`. Every seed user below is created on
> `python -m app.seed`. Auth is a **real OTP** flow (random, hashed, expiring),
> delivered via a pluggable SMS sender. In dev mode (no SMS provider configured)
> the code is **logged to the server console AND returned in the request-otp
> response** (`dev_code`) and shown on the verify screen — so no real SMS or
> phone is needed to test. Log in by **phone number**.

## Login users (log in by phone)

| # | Display Name | Phone (enter as E.164) | Role in demo                     |
|---|--------------|------------------------|----------------------------------|
| 1 | Alice Carter | `+12025550111` | **Primary demo login.** Admin of "Weekend Trip" group. |
| 2 | Bob Nguyen   | `+12025550112` | 1-on-1 with Alice; group member. |
| 3 | Carol Diaz   | `+12025550113` | 1-on-1 with Alice; group member. |
| 4 | David Osei   | `+12025550114` | Group member; sends attachment.  |
| 5 | Emma Ford    | `+12025550115` | 1-on-1 with Bob; group member.   |
| 6 | Frank Lee    | `+12025550116` | "Project X" group admin.         |
| 7 | Grace Kim    | `+12025550117` | Group member; has unread msgs.   |

Phone input accepts punctuation — `+1 202 555 0111`, `+1-202-555-0111`, and
`+12025550111` all normalize to the same number.

## How to log in (any seed user)
1. Open the app → login screen. Pick country **US (+1)** and enter the number
   (e.g. `2025550111` for Alice).
2. Tap **Send code**. The dev code appears on the verify screen (and in the
   backend console).
3. Enter the 6-digit code → existing seed users skip profile setup and land in
   the app. A brand-new phone number routes through profile setup instead.

> OTP lifecycle: codes expire after `OTP_TTL_SECONDS` (default 300s), allow
> `OTP_MAX_ATTEMPTS` (default 5) tries, and are rate-limited to one send per
> `OTP_RESEND_SECONDS` (default 30s) per phone. To send real SMS, set
> `SMS_PROVIDER=twilio` + the `TWILIO_*` env vars (adapter stubbed for now).

## Seed conversations (reference)
- **Direct:** Alice↔Bob, Alice↔Carol, Bob↔Emma
- **Group "Weekend Trip":** Alice (admin), Bob, Carol, Emma
- **Group "Project X":** Frank (admin), David, Grace, Alice
- Mixed read/unread + one image attachment in Alice↔Bob so receipts and the
  attachment path are visible on first load.

> Note: exact phone numbers/avatars are finalized in `seed.py`; this table is the
> intended data and stays in sync with it.
