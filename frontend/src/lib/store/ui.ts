"use client";

import { create } from "zustand";

export type Theme = "dark" | "light" | "system";

const THEME_KEY = "signal_clone_theme";
const NOTIFICATIONS_KEY = "signal_clone_notifications";

interface UiState {
  theme: Theme;
  settingsOpen: boolean;
  notificationsEnabled: boolean;
  setSettingsOpen: (open: boolean) => void;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  initTheme: () => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  initNotifications: () => void;
}

function resolveDomTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    if (typeof window === "undefined" || !window.matchMedia) return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return theme;
}

function applyThemeToDom(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveDomTheme(theme));
}

let systemThemeListenerAttached = false;

export const useUiStore = create<UiState>((set, get) => ({
  theme: "dark",
  settingsOpen: false,
  notificationsEnabled: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  initTheme: () => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
    const theme: Theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "dark";
    applyThemeToDom(theme);
    set({ theme });

    if (!systemThemeListenerAttached && window.matchMedia) {
      systemThemeListenerAttached = true;
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      const listener = () => {
        if (get().theme === "system") applyThemeToDom("system");
      };
      if (mql.addEventListener) mql.addEventListener("change", listener);
      else mql.addListener(listener);
    }
  },

  toggleTheme: () => {
    const current = get().theme;
    const next: Theme = resolveDomTheme(current) === "dark" ? "light" : "dark";
    applyThemeToDom(next);
    if (typeof window !== "undefined") window.localStorage.setItem(THEME_KEY, next);
    set({ theme: next });
  },

  setTheme: (theme) => {
    applyThemeToDom(theme);
    if (typeof window !== "undefined") window.localStorage.setItem(THEME_KEY, theme);
    set({ theme });
  },

  setNotificationsEnabled: (enabled) => {
    if (enabled && typeof Notification !== "undefined") {
      Notification.requestPermission();
    }
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NOTIFICATIONS_KEY, enabled ? "1" : "0");
    }
    set({ notificationsEnabled: enabled });
  },

  initNotifications: () => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(NOTIFICATIONS_KEY);
    set({ notificationsEnabled: stored === "1" });
  },
}));
