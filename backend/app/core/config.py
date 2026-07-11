from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite+aiosqlite:///./signal.db"
    jwt_secret: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    cors_origins: list[str] = ["http://localhost:3000"]

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
