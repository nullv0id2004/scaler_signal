"use client";

import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { useUiStore } from "@/lib/store/ui";
import { useAuthStore } from "@/lib/store/auth";

export function Providers({ children }: { children: React.ReactNode }) {
  const initTheme = useUiStore((s) => s.initTheme);
  const initNotifications = useUiStore((s) => s.initNotifications);
  const rehydrate = useAuthStore((s) => s.rehydrate);

  React.useEffect(() => {
    initTheme();
    initNotifications();
    rehydrate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster
          position="top-right"
          theme="dark"
          toastOptions={{
            style: {
              background: "var(--bg-elevated)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
