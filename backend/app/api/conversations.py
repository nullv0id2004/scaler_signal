from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.security import get_current_user
from app.models import User
from app.schemas.conversation import (
    ConversationOut,
    ConversationSummaryOut,
    ConversationWithMembersOut,
    CreateConversationIn,
    UpdateConversationIn,
)
from app.schemas.message import MessageOut
from app.services import conversations as conversation_service
from app.services import messages as message_service

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationSummaryOut])
async def list_conversations(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await conversation_service.list_for_user(session, current_user)


@router.post("", response_model=ConversationOut, status_code=201)
async def create_conversation_endpoint(
    payload: CreateConversationIn,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    conv = await conversation_service.create_conversation(
        session,
        current_user,
        payload.type,
        payload.member_ids,
        name=payload.name,
        avatar_url=payload.avatar_url,
    )
    return ConversationOut.model_validate(conv)


@router.get("/{conversation_id}", response_model=ConversationWithMembersOut)
async def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    return await conversation_service.get_with_members(session, conversation_id, current_user)


@router.get("/{conversation_id}/messages", response_model=list[MessageOut])
async def get_conversation_messages(
    conversation_id: int,
    before: int | None = Query(default=None),
    limit: int = Query(default=30, le=100),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    msgs = await message_service.history(
        session, current_user, conversation_id, before=before, limit=limit
    )
    return [await message_service.serialize(session, m) for m in msgs]


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def patch_conversation(
    conversation_id: int,
    payload: UpdateConversationIn,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    conv = await conversation_service.update_conversation(
        session,
        conversation_id,
        current_user,
        name=payload.name,
        avatar_url=payload.avatar_url,
    )
    return ConversationOut.model_validate(conv)
