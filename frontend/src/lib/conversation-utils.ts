import type { Conversation, ConversationMember, Message, User } from "@/lib/types";

export function otherMember(conv: Conversation, selfId: number): ConversationMember | undefined {
  return conv.members?.find((m) => m.user_id !== selfId);
}

/**
 * Resolve the name to render for a user, preferring the viewer's nickname
 * for that member (if set) over the user's own display_name.
 */
export function displayNameFor(member?: ConversationMember | null, user?: User | null): string {
  const u = user ?? member?.user;
  return member?.nickname ?? u?.display_name ?? "Unknown";
}

export function conversationTitle(conv: Conversation, selfId: number): string {
  if (conv.type === "group") return conv.name || "Unnamed group";
  const other = otherMember(conv, selfId);
  if (!other) return "Direct message";
  return displayNameFor(other);
}

export function conversationAvatar(conv: Conversation, selfId: number): { url: string | null; id: number | string } {
  if (conv.type === "group") {
    return { url: conv.avatar_url, id: `group-${conv.id}` };
  }
  const other = otherMember(conv, selfId);
  return { url: other?.user?.avatar_url ?? null, id: other?.user_id ?? conv.id };
}

export function messagePreview(message: Message | null, selfId: number, members?: ConversationMember[]): string {
  if (!message) return "No messages yet";
  if (message.deleted_at) return "This message was deleted";
  const prefix =
    message.sender_id === selfId
      ? "You: "
      : members && members.length > 2
        ? `${displayNameFor(members.find((m) => m.user_id === message.sender_id)).split(" ")[0]}: `
        : "";
  switch (message.type) {
    case "image":
      return `${prefix}📷 Photo`;
    case "file":
      return `${prefix}📎 ${message.attachment?.filename ?? "File"}`;
    case "system":
      return message.content ?? "";
    default:
      return `${prefix}${message.content ?? ""}`;
  }
}

export function userDisplayName(user: User | undefined | null): string {
  return user?.display_name ?? "Unknown";
}
