"use client";

import { create } from "zustand";
import type { PresencePayload, TypingEventPayload } from "@/lib/types";

interface PresenceState {
  online: Record<number, { online: boolean; last_seen_at: string | null }>;
  /** conversationId -> userId -> isTyping */
  typing: Record<number, Record<number, boolean>>;

  setPresence: (payload: PresencePayload) => void;
  setTyping: (payload: TypingEventPayload) => void;
  isOnline: (userId: number) => boolean;
  lastSeen: (userId: number) => string | null;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  online: {},
  typing: {},

  setPresence: (payload) => {
    set((s) => ({
      online: {
        ...s.online,
        [payload.user_id]: { online: payload.online, last_seen_at: payload.last_seen_at },
      },
    }));
  },

  setTyping: (payload) => {
    set((s) => {
      const convTyping = { ...(s.typing[payload.conversation_id] ?? {}) };
      if (payload.is_typing) {
        convTyping[payload.user_id] = true;
      } else {
        delete convTyping[payload.user_id];
      }
      return { typing: { ...s.typing, [payload.conversation_id]: convTyping } };
    });
  },

  isOnline: (userId) => get().online[userId]?.online ?? false,
  lastSeen: (userId) => get().online[userId]?.last_seen_at ?? null,
}));
