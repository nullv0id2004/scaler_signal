"use client";

import { create } from "zustand";

export type Theme = "dark" | "light";

const THEME_KEY = "signal_clone_theme";

interface UiState {
  theme: Theme;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  toggleTheme: () => void;
  initTheme: () => void;
}

function applyThemeToDom(theme: Theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: "dark",
  settingsOpen: false,
  setSettingsOpen: (open) => set({ settingsOpen: open }),

  initTheme: () => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(THEME_KEY) as Theme | null;
    const theme = stored === "light" ? "light" : "dark";
    applyThemeToDom(theme);
    set({ theme });
  },

  toggleTheme: () => {
    const next: Theme = get().theme === "dark" ? "light" : "dark";
    applyThemeToDom(next);
    if (typeof window !== "undefined") window.localStorage.setItem(THEME_KEY, next);
    set({ theme: next });
  },
}));
