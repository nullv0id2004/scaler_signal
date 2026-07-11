"""Pluggable SMS sending abstraction.

`get_sms_sender()` picks an implementation based on `settings.sms_provider`.
Only "console" is actually wired up to send anything (it logs/prints, so the
demo works without a paid provider); "twilio" is a stub for future work.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

from app.core.config import settings

logger = logging.getLogger("app.sms")


class SmsSender(ABC):
    @abstractmethod
    async def send(self, phone: str, message: str) -> None: ...


class ConsoleSmsSender(SmsSender):
    """Dev/demo sender: writes the message to logs (and stdout) instead of
    calling a real SMS provider. Paired with `settings.otp_dev_mode`, which
    also echoes the code back in the API response."""

    async def send(self, phone: str, message: str) -> None:
        line = f"[SMS to {phone}] {message}"
        logger.info(line)
        print(line)


class TwilioSmsSender(SmsSender):
    """Stub for a real Twilio-backed sender. Not wired up yet — construction
    is fine, but sending raises until this is implemented.

    TODO: implement using settings.twilio_account_sid / twilio_auth_token /
    twilio_from_number and the `twilio` SDK's REST client.
    """

    async def send(self, phone: str, message: str) -> None:
        raise NotImplementedError(
            "TwilioSmsSender is a stub; set sms_provider='console' for now."
        )


def get_sms_sender() -> SmsSender:
    if settings.sms_provider == "twilio":
        return TwilioSmsSender()
    return ConsoleSmsSender()
