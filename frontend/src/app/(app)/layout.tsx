"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Sidebar } from "@/components/conversation/Sidebar";
import { useAuthStore } from "@/lib/store/auth";
import { connectWs, disconnectWs } from "@/lib/ws";
import { cn } from "@/lib/utils";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, user, hydrated, rehydrate } = useAuthStore();

  React.useEffect(() => {
    if (!hydrated) rehydrate();
  }, [hydrated, rehydrate]);

  React.useEffect(() => {
    if (hydrated && !token) router.replace("/login");
  }, [hydrated, token, router]);

  React.useEffect(() => {
    if (token && user) {
      connectWs(token, user.id);
    }
    return () => {
      // Keep the socket alive across in-app navigation; only torn down on logout.
    };
  }, [token, user]);

  React.useEffect(() => {
    return () => disconnectWs();
  }, []);

  const match = pathname.match(/^\/c\/(\d+)/);
  const activeId = match ? Number(match[1]) : null;
  const isConversationOpen = activeId !== null;

  if (!hydrated || !token || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar
        activeId={activeId}
        className={cn("w-full shrink-0 md:w-[380px]", isConversationOpen && "hidden md:flex")}
      />
      <div className={cn("flex min-w-0 flex-1 flex-col", !isConversationOpen && "hidden md:flex")}>{children}</div>
    </div>
  );
}
