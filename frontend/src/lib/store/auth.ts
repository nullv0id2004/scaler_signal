"use client";

import { create } from "zustand";
import type { User } from "@/lib/types";

const TOKEN_KEY = "signal_clone_token";
const USER_KEY = "signal_clone_user";

interface AuthState {
  token: string | null;
  user: User | null;
  hydrated: boolean;
  /** Load token/user from localStorage. Call once on app boot. */
  rehydrate: () => void;
  setSession: (token: string, user: User) => void;
  setUser: (user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  hydrated: false,

  rehydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const token = window.localStorage.getItem(TOKEN_KEY);
      const rawUser = window.localStorage.getItem(USER_KEY);
      const user = rawUser ? (JSON.parse(rawUser) as User) : null;
      set({ token, user, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  setSession: (token, user) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    set({ token, user, hydrated: true });
  },

  setUser: (user) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
    set({ user });
  },

  logout: () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    }
    set({ token: null, user: null });
  },
}));
