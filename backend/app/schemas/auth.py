from pydantic import BaseModel

from app.schemas.user import UserOut


class RequestOtpIn(BaseModel):
    phone: str


class RequestOtpOut(BaseModel):
    ok: bool = True
    expires_in: int
    resend_in: int
    dev_code: str | None = None


class VerifyOtpIn(BaseModel):
    phone: str
    code: str


class TokenOut(BaseModel):
    token: str
    user: UserOut
    is_new: bool


class CompleteProfileIn(BaseModel):
    display_name: str
    username: str | None = None
    avatar_url: str | None = None


class LogoutOut(BaseModel):
    ok: bool = True
