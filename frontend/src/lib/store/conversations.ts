"use client";

import { create } from "zustand";

interface ConversationsUiState {
  activeConversationId: number | null;
  setActive: (id: number | null) => void;
  /** Local unread override so the badge clears instantly on open, before the
   * conversations list REST cache is refetched/invalidated. */
  localReadOverride: Record<number, boolean>;
  markLocallyRead: (id: number) => void;
  clearLocalOverride: (id: number) => void;
}

export const useConversationsUiStore = create<ConversationsUiState>((set) => ({
  activeConversationId: null,
  setActive: (id) => set({ activeConversationId: id }),
  localReadOverride: {},
  markLocallyRead: (id) =>
    set((s) => ({ localReadOverride: { ...s.localReadOverride, [id]: true } })),
  clearLocalOverride: (id) =>
    set((s) => {
      const next = { ...s.localReadOverride };
      delete next[id];
      return { localReadOverride: next };
    }),
}));
