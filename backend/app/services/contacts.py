from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ContactNote
from app.schemas.contact import ContactNoteOut
from app.services import users as user_service


async def _get_note(
    session: AsyncSession, owner_id: int, target_user_id: int
) -> ContactNote | None:
    result = await session.execute(
        select(ContactNote).where(
            ContactNote.owner_id == owner_id,
            ContactNote.target_user_id == target_user_id,
        )
    )
    return result.scalar_one_or_none()


async def get(session: AsyncSession, owner_id: int, target_user_id: int) -> ContactNoteOut:
    """The caller's private note about target_user_id. Empty shape (nulls) if
    they've never annotated this contact."""
    note = await _get_note(session, owner_id, target_user_id)
    return ContactNoteOut(
        user_id=target_user_id,
        nickname=note.nickname if note else None,
        note=note.note if note else None,
    )


async def upsert(
    session: AsyncSession, owner_id: int, target_user_id: int, fields: dict
) -> ContactNoteOut:
    """Upsert the caller's contact_notes row for target_user_id. `fields` is
    the set of keys the client actually sent (via model_dump(exclude_unset=
    True)) so an omitted field leaves the existing value untouched, while an
    explicit null clears it."""
    target = await user_service.get_by_id(session, target_user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    note = await _get_note(session, owner_id, target_user_id)
    if note is None:
        note = ContactNote(owner_id=owner_id, target_user_id=target_user_id)
        session.add(note)

    if "nickname" in fields:
        note.nickname = fields["nickname"]
    if "note" in fields:
        note.note = fields["note"]

    await session.commit()
    await session.refresh(note)
    return ContactNoteOut(user_id=target_user_id, nickname=note.nickname, note=note.note)
