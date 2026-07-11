/**
 * Shared TypeScript types mirroring backend Pydantic schemas.
 * Source of truth: docs/DESIGN.md §1 (schema), §2 (WebSocket), §3 (REST).
 */

// ---------- Entities ----------

export type ConversationType = "direct" | "group";
export type MemberRole = "admin" | "member";
export type MessageType = "text" | "image" | "file" | "system";
export type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

export interface User {
  id: number;
  username: string;
  phone: string | null;
  display_name: string;
  avatar_url: string | null;
  about: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface Attachment {
  id: number;
  message_id: number;
  url: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
}

export interface Reaction {
  id: number;
  message_id: number;
  user_id: number;
  emoji: string;
}

export interface ReplyPreview {
  id: number;
  sender_id: number;
  sender_name?: string;
  content: string | null;
  type: MessageType;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  type: MessageType;
  content: string | null;
  reply_to_message_id: number | null;
  reply_to?: ReplyPreview | null;
  attachment?: Attachment | null;
  reactions: Reaction[];
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  /** ISO timestamp when this message will disappear, if the conversation has disappearing messages on. */
  expires_at?: string | null;
  // client-only fields (optimistic send)
  temp_id?: string;
  status?: MessageStatus;
}

export interface ConversationMember {
  id: number;
  conversation_id: number;
  user_id: number;
  role: MemberRole;
  joined_at: string;
  last_read_message_id: number | null;
  last_delivered_message_id: number | null;
  muted: boolean;
  user?: User;
  /** Caller's own bubble color override for this conversation (only meaningful on the viewer's own member row). */
  chat_color?: string | null;
  /** Viewer's nickname for this member's user, if set. */
  nickname?: string | null;
}

export interface Conversation {
  id: number;
  type: ConversationType;
  name: string | null;
  avatar_url: string | null;
  created_by: number;
  created_at: string;
  members?: ConversationMember[];
  /** Disappearing-message timer in seconds, or null/undefined when off. */
  disappearing_seconds?: number | null;
}

export interface ConversationSummary extends Conversation {
  last_message: Message | null;
  unread_count: number;
}

// ---------- Auth REST ----------

export interface RequestOtpIn {
  phone: string;
}

export interface RequestOtpOut {
  ok: boolean;
  expires_in: number;
  resend_in: number;
  /** Only present in dev mode: the OTP itself, shown as an on-screen hint. */
  dev_code?: string;
}

export interface VerifyOtpIn {
  phone: string;
  code: string;
}

export interface TokenOut {
  token: string;
  user: User;
  is_new: boolean;
}

export interface CompleteProfileIn {
  display_name: string;
  username?: string;
  avatar_url?: string | null;
}

// ---------- Conversations / Messages REST ----------

export interface CreateConversationIn {
  type: ConversationType;
  member_ids: number[];
  name?: string | null;
  avatar_url?: string | null;
}

export interface CreateMessageIn {
  conversation_id: number;
  content: string;
  reply_to_id?: number | null;
}

export interface UploadOut {
  url: string;
  mime: string;
  size: number;
  w: number | null;
  h: number | null;
}

// ---------- WebSocket protocol (docs/DESIGN.md §2) ----------

export type WsClientEventType =
  | "message.send"
  | "typing.start"
  | "typing.stop"
  | "message.read"
  | "reaction.add"
  | "reaction.remove";

export type WsServerEventType =
  | "message.new"
  | "message.ack"
  | "receipt.update"
  | "typing"
  | "presence"
  | "reaction.update"
  | "member.update";

export interface WsEnvelope<T = unknown> {
  type: string;
  payload: T;
}

// Client -> Server payloads
export interface MessageSendPayload {
  conversation_id: number;
  content: string;
  reply_to_id?: number | null;
  temp_id: string;
  type?: MessageType;
  attachment?: {
    url: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    width?: number | null;
    height?: number | null;
  } | null;
}

export interface TypingPayload {
  conversation_id: number;
}

export interface MessageReadPayload {
  conversation_id: number;
  message_id: number;
}

export interface ReactionTogglePayload {
  message_id: number;
  emoji: string;
}

// Server -> Client payloads
export interface MessageNewPayload extends Message {
  temp_id?: string;
}

export interface MessageAckPayload {
  temp_id: string;
  message_id: number;
  status: MessageStatus;
  conversation_id: number;
  created_at?: string;
}

export interface ReceiptUpdatePayload {
  conversation_id: number;
  user_id: number;
  last_read_id: number | null;
  last_delivered_id: number | null;
}

export interface TypingEventPayload {
  conversation_id: number;
  user_id: number;
  is_typing: boolean;
}

export interface PresencePayload {
  user_id: number;
  online: boolean;
  last_seen_at: string | null;
}

export interface ReactionUpdatePayload {
  message_id: number;
  reactions: Reaction[];
}

export interface MemberUpdatePayload {
  conversation_id: number;
  event: "added" | "removed" | "role_changed" | "left";
  member: ConversationMember;
}

// ---------- Media / Contacts / Disappearing / Chat color REST ----------

export interface ConversationMediaOut {
  images: Message[];
  files: Message[];
}

export interface ContactInfo {
  user_id: number;
  nickname: string | null;
  note: string | null;
}

export interface UpdateContactIn {
  nickname?: string | null;
  note?: string | null;
}

export interface SetDisappearingIn {
  seconds: number | null;
}

export interface SetChatColorIn {
  color: string | null;
}
