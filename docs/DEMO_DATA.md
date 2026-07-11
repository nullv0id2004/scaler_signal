# Demo Data — Deployed App

Data populated on the live deployment via the public REST API (additive, no wipe).
Lives in `/home/signal.db` — persists across redeploys.

- **Frontend:** https://signal-frontend-d5geb2b4a9frb8ch.centralindia-01.azurewebsites.net
- **Backend API:** https://signal-api-bwh8fse9esf2hjep.centralindia-01.azurewebsites.net

## How to log in

Auth is a mocked OTP flow in **dev mode** — no real SMS. The code is returned in
the `request-otp` response (and the frontend surfaces it).

1. Open the frontend → enter a **phone** from the table below.
2. `POST /api/auth/request-otp` returns a `dev_code`.
3. Enter that code → you're in.

CLI equivalent:
```bash
BASE=https://signal-api-bwh8fse9esf2hjep.centralindia-01.azurewebsites.net
# 1. request code
curl -s -X POST $BASE/api/auth/request-otp -H 'Content-Type: application/json' \
  -d '{"phone":"+12025550111"}'          # -> {"dev_code":"NNNNNN", ...}
# 2. verify (use the dev_code)
curl -s -X POST $BASE/api/auth/verify-otp -H 'Content-Type: application/json' \
  -d '{"phone":"+12025550111","code":"NNNNNN"}'   # -> {"token": "...", "user": {...}}
```

## Users

| Username | Display Name | Phone (login) | User ID |
|----------|--------------|---------------|---------|
| `alice`  | Alice Carter | `+12025550111` | 1 |
| `bob`    | Bob Nguyen   | `+12025550112` | 3 |
| `carol`  | Carol Diaz   | `+12025550113` | 4 |
| `david`  | David Osei   | `+12025550114` | 5 |
| `emma`   | Emma Ford    | `+12025550115` | 6 |
| `frank`  | Frank Lee    | `+12025550116` | 7 |

> OTP is generated per request — there is **no fixed code**. Always read the
> `dev_code` from the `request-otp` response.

## Conversations

### Direct

**Alice ↔ Bob** (conversation id 2)
- alice: Hey Bob, you around this weekend?
- bob: Yeah! What's the plan?
- alice: Thinking a hike Saturday morning.
- bob: I'm in. Trailhead at 8?
- alice: Perfect, see you then.

**Alice ↔ Carol** (id 3)
- carol: Did you get the report I sent?
- alice: Got it, looks great. One note on page 3.
- carol: Sure, tell me.

**Bob ↔ Emma** (id 4)
- emma: Lunch tomorrow?
- bob: Can't, meetings all day 😩
- emma: Thursday then.

### Groups

**Weekend Trip** (id 5) — admin: alice · members: bob, carol, emma
- alice: Made a group for the trip planning 🎒
- bob: Nice. I'll book the cabin.
- carol: I can drive, room for 3.
- emma: I'll handle snacks and playlist 🎶
- alice: Dream team.

**Project X** (id 6) — admin: frank · members: david, alice
- frank: Kicking off Project X today.
- david: Design drafts by Friday.
- alice: I'll take the backend spec.
- frank: Great, standup daily at 10.

## Notes

- **Best demo login:** `alice` — she's in every group and 2 direct chats.
- Data is additive; a pre-existing test direct chat with a `hi` message may also
  appear — harmless leftover from earlier testing.
- To add more data safely, re-run `scratchpad/populate.py` (re-registers the same
  users, appends new conversations). **Do not** run `python -m app.seed` on prod —
  it wipes the database.
