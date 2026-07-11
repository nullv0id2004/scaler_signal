from pydantic import BaseModel

from app.schemas.user import UserOut


class RequestOtpIn(BaseModel):
    handle: str


class RequestOtpOut(BaseModel):
    ok: bool = True


class VerifyOtpIn(BaseModel):
    handle: str
    otp: str


class TokenOut(BaseModel):
    token: str
    user: UserOut
    is_new: bool


class CompleteProfileIn(BaseModel):
    display_name: str
    avatar_url: str | None = None


class LogoutOut(BaseModel):
    ok: bool = True
