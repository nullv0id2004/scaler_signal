"use client";

import { create } from "zustand";
import type {
  Message,
  MessageAckPayload,
  MessageNewPayload,
  ReactionUpdatePayload,
  ReceiptUpdatePayload,
} from "@/lib/types";

interface ReceiptPointer {
  last_read_message_id: number | null;
  last_delivered_message_id: number | null;
}

interface MessagesState {
  byConversation: Record<number, Message[]>;
  hasMoreOlder: Record<number, boolean>;
  /** other-members' receipt pointers, keyed by conversation -> userId */
  receipts: Record<number, Record<number, ReceiptPointer>>;

  setInitialPages: (conversationId: number, pagesOldestFirst: Message[]) => void;
  appendOlderPage: (conversationId: number, page: Message[]) => void;
  setHasMoreOlder: (conversationId: number, hasMore: boolean) => void;

  addOptimistic: (conversationId: number, message: Message) => void;
  ackMessage: (payload: MessageAckPayload) => void;
  markFailed: (conversationId: number, tempId: string) => void;
  receiveNew: (payload: MessageNewPayload) => void;
  updateReactions: (payload: ReactionUpdatePayload) => void;
  applyReceipt: (payload: ReceiptUpdatePayload) => void;
  removeMessage: (conversationId: number, messageId: number) => void;
  markDeleted: (conversationId: number, messageId: number) => void;
}

function sortByCreatedThenId(a: Message, b: Message) {
  const t = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  if (t !== 0) return t;
  return (a.id ?? 0) - (b.id ?? 0);
}

/** Remove duplicate messages by real id, keeping the first occurrence.
 * Optimistic messages (which carry a temp_id and a negative placeholder id)
 * are never deduped against each other. */
function dedupeById(list: Message[]): Message[] {
  const seen = new Set<number>();
  return list.filter((m) => {
    if (m.temp_id) return true;
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });
}

export const useMessagesStore = create<MessagesState>((set) => ({
  byConversation: {},
  hasMoreOlder: {},
  receipts: {},

  setInitialPages: (conversationId, pagesOldestFirst) => {
    set((s) => {
      const incoming = dedupeById(pagesOldestFirst);
      const existing = s.byConversation[conversationId] ?? [];
      // Preserve locally-held messages the server snapshot doesn't include yet:
      // still-optimistic sends (temp_id) and messages acked after this snapshot
      // was fetched. Otherwise re-seeding on remount would drop just-sent messages
      // until a full refresh.
      const incomingIds = new Set(incoming.filter((m) => !m.temp_id).map((m) => m.id));
      const extras = existing.filter((m) => m.temp_id || !incomingIds.has(m.id));
      const merged = [...incoming, ...extras].sort(sortByCreatedThenId);
      return { byConversation: { ...s.byConversation, [conversationId]: merged } };
    });
  },

  appendOlderPage: (conversationId, page) => {
    set((s) => {
      const existing = s.byConversation[conversationId] ?? [];
      const merged = [...page, ...existing];
      const seen = new Set<number>();
      const deduped = merged.filter((m) => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
      return { byConversation: { ...s.byConversation, [conversationId]: deduped } };
    });
  },

  setHasMoreOlder: (conversationId, hasMore) => {
    set((s) => ({ hasMoreOlder: { ...s.hasMoreOlder, [conversationId]: hasMore } }));
  },

  addOptimistic: (conversationId, message) => {
    set((s) => {
      const list = s.byConversation[conversationId] ?? [];
      return { byConversation: { ...s.byConversation, [conversationId]: [...list, message] } };
    });
  },

  ackMessage: (payload) => {
    set((s) => {
      const list = s.byConversation[payload.conversation_id] ?? [];
      const idx = list.findIndex((m) => m.temp_id === payload.temp_id);
      if (idx === -1) return {};
      const updated = [...list];
      updated[idx] = {
        ...updated[idx],
        id: payload.message_id,
        status: payload.status,
        created_at: payload.created_at ?? updated[idx].created_at,
        temp_id: undefined,
      };
      // Drop any pre-existing entry with the now-real id (e.g. already pulled
      // in via a history page) so the acked message isn't duplicated.
      const deduped = updated.filter((m, i) => i === idx || m.id !== payload.message_id);
      return { byConversation: { ...s.byConversation, [payload.conversation_id]: deduped } };
    });
  },

  markFailed: (conversationId, tempId) => {
    set((s) => {
      const list = s.byConversation[conversationId] ?? [];
      const updated = list.map((m) => (m.temp_id === tempId ? { ...m, status: "failed" as const } : m));
      return { byConversation: { ...s.byConversation, [conversationId]: updated } };
    });
  },

  receiveNew: (payload) => {
    set((s) => {
      const list = s.byConversation[payload.conversation_id] ?? [];
      // If this is the echo of our own optimistic send, reconcile by temp_id.
      if (payload.temp_id) {
        const idx = list.findIndex((m) => m.temp_id === payload.temp_id);
        if (idx !== -1) {
          const updated = [...list];
          updated[idx] = { ...payload, temp_id: undefined, status: "sent" };
          return { byConversation: { ...s.byConversation, [payload.conversation_id]: updated } };
        }
      }
      if (list.some((m) => m.id === payload.id)) return {};
      const next = [...list, { ...payload, status: "sent" as const }].sort(sortByCreatedThenId);
      return { byConversation: { ...s.byConversation, [payload.conversation_id]: next } };
    });
  },

  updateReactions: (payload) => {
    set((s) => {
      const next: Record<number, Message[]> = { ...s.byConversation };
      for (const convId of Object.keys(next)) {
        const list = next[Number(convId)];
        const idx = list.findIndex((m) => m.id === payload.message_id);
        if (idx !== -1) {
          const updated = [...list];
          updated[idx] = { ...updated[idx], reactions: payload.reactions };
          next[Number(convId)] = updated;
          break;
        }
      }
      return { byConversation: next };
    });
  },

  applyReceipt: (payload) => {
    set((s) => {
      const convReceipts = { ...(s.receipts[payload.conversation_id] ?? {}) };
      const prev = convReceipts[payload.user_id] ?? {
        last_read_message_id: null,
        last_delivered_message_id: null,
      };
      convReceipts[payload.user_id] = {
        last_read_message_id:
          payload.last_read_id == null
            ? prev.last_read_message_id
            : Math.max(prev.last_read_message_id ?? 0, payload.last_read_id),
        last_delivered_message_id:
          payload.last_delivered_id == null
            ? prev.last_delivered_message_id
            : Math.max(prev.last_delivered_message_id ?? 0, payload.last_delivered_id),
      };
      return { receipts: { ...s.receipts, [payload.conversation_id]: convReceipts } };
    });
  },

  removeMessage: (conversationId, messageId) => {
    set((s) => {
      const list = s.byConversation[conversationId] ?? [];
      return {
        byConversation: {
          ...s.byConversation,
          [conversationId]: list.filter((m) => m.id !== messageId),
        },
      };
    });
  },

  markDeleted: (conversationId, messageId) => {
    set((s) => {
      const list = s.byConversation[conversationId] ?? [];
      const idx = list.findIndex((m) => m.id === messageId);
      if (idx === -1) return {};
      const updated = [...list];
      updated[idx] = {
        ...updated[idx],
        deleted_at: new Date().toISOString(),
        content: null,
        attachment: null,
      };
      return { byConversation: { ...s.byConversation, [conversationId]: updated } };
    });
  },
}));

/** Derive a sent message's check-mark status against the other members' pointers. */
export function deriveStatus(
  conversationId: number,
  messageId: number,
  senderId: number,
  otherMemberIds: number[]
): "sent" | "delivered" | "read" {
  const receipts = useMessagesStore.getState().receipts[conversationId] ?? {};
  const others = otherMemberIds.filter((id) => id !== senderId);
  if (others.length === 0) return "sent";
  const allRead = others.every((uid) => (receipts[uid]?.last_read_message_id ?? 0) >= messageId);
  if (allRead) return "read";
  const allDelivered = others.every((uid) => (receipts[uid]?.last_delivered_message_id ?? 0) >= messageId);
  if (allDelivered) return "delivered";
  return "sent";
}
