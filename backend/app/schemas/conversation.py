from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.message import MessageOut


class ConversationMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    role: str
    joined_at: datetime
    last_read_message_id: int | None = None
    last_delivered_message_id: int | None = None
    muted: bool


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    name: str | None = None
    avatar_url: str | None = None
    created_by: int
    created_at: datetime


class ConversationWithMembersOut(ConversationOut):
    members: list[ConversationMemberOut] = []


class ConversationSummaryOut(ConversationOut):
    last_message: MessageOut | None = None
    unread_count: int = 0


class CreateConversationIn(BaseModel):
    type: str
    member_ids: list[int]
    name: str | None = None
    avatar_url: str | None = None


class UpdateConversationIn(BaseModel):
    name: str | None = None
    avatar_url: str | None = None


class AddMembersIn(BaseModel):
    user_ids: list[int]


class SetRoleIn(BaseModel):
    role: str
