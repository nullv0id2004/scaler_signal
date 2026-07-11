from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ContactNote(Base):
    """A private, per-owner annotation (nickname/note) about another user.

    Viewer-specific: owner_id is the user who wrote the note, target_user_id
    is who it's about. Never shown to the target user.
    """

    __tablename__ = "contact_notes"
    __table_args__ = (
        UniqueConstraint("owner_id", "target_user_id", name="uq_contact_note_owner_target"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    target_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    nickname: Mapped[str | None] = mapped_column(String, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=func.now(), onupdate=func.now()
    )
