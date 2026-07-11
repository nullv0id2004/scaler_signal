import json
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite+aiosqlite:///./signal.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    # NoDecode: don't let pydantic-settings JSON-decode this env var. A plain
    # value like `https://a.com,https://b.com` (or an empty string) would
    # otherwise crash Settings() on boot. The validator below accepts a JSON
    # array, a comma-separated list, or empty.
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v: object) -> list[str]:
        if v is None:
            return ["http://localhost:3000"]
        if isinstance(v, list):
            return v
        if isinstance(v, str):
            s = v.strip()
            if not s:
                return ["http://localhost:3000"]
            if s.startswith("["):
                return json.loads(s)
            return [o.strip() for o in s.split(",") if o.strip()]
        return ["http://localhost:3000"]

    # --- OTP lifecycle ---
    otp_ttl_seconds: int = 300
    otp_max_attempts: int = 5
    otp_resend_seconds: int = 30
    otp_length: int = 6

    # --- SMS sending ---
    # "console" (default, logs/prints the code) | "twilio" (stub, not wired up)
    sms_provider: str = "console"
    # When true (console provider), request-otp responses include the
    # generated code so the demo works without a real SMS provider.
    otp_dev_mode: bool = True
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""


settings = Settings()
