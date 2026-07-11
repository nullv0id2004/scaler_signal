from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.message import MessageOut
from app.schemas.user import UserOut


class ConversationMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    user_id: int
    role: str
    joined_at: datetime
    last_read_message_id: int | None = None
    last_delivered_message_id: int | None = None
    muted: bool
    chat_color: str | None = None
    nickname: str | None = None  # viewer-specific: requester's contact_notes.nickname for this member
    user: UserOut | None = None


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    name: str | None = None
    avatar_url: str | None = None
    created_by: int
    created_at: datetime
    disappearing_seconds: int | None = None


class ConversationWithMembersOut(ConversationOut):
    members: list[ConversationMemberOut] = []


class ConversationSummaryOut(ConversationWithMembersOut):
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


class SetDisappearingIn(BaseModel):
    seconds: int | None = None


class SetChatColorIn(BaseModel):
    color: str | None = None
