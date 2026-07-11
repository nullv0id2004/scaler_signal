from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    phone: str | None = None
    display_name: str
    avatar_url: str | None = None
    about: str | None = None
    last_seen_at: datetime | None = None
    created_at: datetime


class UpdateProfileIn(BaseModel):
    display_name: str | None = None
    avatar_url: str | None = None
    about: str | None = None
