from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    url: str
    filename: str
    mime_type: str
    size_bytes: int
    width: int | None = None
    height: int | None = None


class ReactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    emoji: str


class ReplyPreviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sender_id: int
    content: str | None = None
    type: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    sender_id: int
    type: str
    content: str | None = None
    reply_to_message_id: int | None = None
    reply_to: ReplyPreviewOut | None = None
    created_at: datetime
    edited_at: datetime | None = None
    deleted_at: datetime | None = None
    reactions: list[ReactionOut] = []
    attachment: AttachmentOut | None = None
    status: str | None = None  # populated by caller when member context is available


class CreateMessageIn(BaseModel):
    conversation_id: int
    content: str | None = None
    reply_to_id: int | None = None
    type: str = "text"
