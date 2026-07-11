"""Phone number normalization.

Deliberately lightweight (no external phonenumbers dependency): strips
formatting punctuation/whitespace and collapses to a single leading '+'
followed by digits only, e.g.:

    "+1-202-555-0111"      -> "+12025550111"
    "+1 (202) 555 0111"    -> "+12025550111"
    "12025550111"          -> "+12025550111"

Used on both request-otp and verify-otp (and when matching seed users) so the
same phone written in different formats always resolves to the same user.
"""

_STRIP_CHARS = " -()."


def normalize_phone(raw: str) -> str:
    raw = (raw or "").strip()
    has_plus = raw.startswith("+")
    cleaned = "".join(ch for ch in raw if ch not in _STRIP_CHARS)
    cleaned = cleaned.lstrip("+")
    digits = "".join(ch for ch in cleaned if ch.isdigit())
    return f"+{digits}" if has_plus or digits else digits
