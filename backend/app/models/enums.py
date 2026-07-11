"""Plain-string enums documenting the allowed values for model "enum" columns.

These are stored in the database as plain strings (no SQL ENUM type), so the
schema stays dialect-agnostic. The classes exist purely to document and
centralize the allowed values for use across models/schemas/services.
"""

from enum import Enum


class ConversationType(str, Enum):
    direct = "direct"
    group = "group"


class MemberRole(str, Enum):
    admin = "admin"
    member = "member"


class MessageType(str, Enum):
    text = "text"
    image = "image"
    file = "file"
    system = "system"
