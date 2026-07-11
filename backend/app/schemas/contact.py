from pydantic import BaseModel


class ContactNoteIn(BaseModel):
    nickname: str | None = None
    note: str | None = None


class ContactNoteOut(BaseModel):
    user_id: int
    nickname: str | None = None
    note: str | None = None
