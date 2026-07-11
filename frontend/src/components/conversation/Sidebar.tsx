"use client";

import * as React from "react";
import { MessageSquarePlus, Users, Settings, MoreVertical, LogOut } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SearchBar } from "@/components/conversation/SearchBar";
import { ConvList } from "@/components/conversation/ConvList";
import { NewChatModal } from "@/components/conversation/NewChatModal";
import { NewGroupModal } from "@/components/conversation/NewGroupModal";
import { SettingsModal } from "@/components/settings/SettingsModal";
import { useAuthStore } from "@/lib/store/auth";
import { disconnectWs } from "@/lib/ws";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function Sidebar({ activeId, className }: { activeId: number | null; className?: string }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [query, setQuery] = React.useState("");
  const [newChatOpen, setNewChatOpen] = React.useState(false);
  const [newGroupOpen, setNewGroupOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  function handleLogout() {
    disconnectWs();
    logout();
    router.replace("/login");
  }

  return (
    <div className={cn("flex h-full flex-col border-r border-border bg-bg-panel", className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          onClick={() => router.push("/profile")}
          className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-bg-hover"
          title="Edit profile"
        >
          <UserAvatar id={user?.id ?? 0} name={user?.display_name ?? "?"} src={user?.avatar_url} className="h-9 w-9" />
          <span className="max-w-[9rem] truncate text-sm font-medium text-foreground">
            {user?.display_name ?? "You"}
          </span>
        </button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setNewChatOpen(true)} title="New chat">
            <MessageSquarePlus className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setNewGroupOpen(true)} title="New group">
            <Users className="h-5 w-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" title="More">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                <Settings className="h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onClick={handleLogout}>
                <LogOut className="h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <SearchBar value={query} onChange={setQuery} />
      <ConvList activeId={activeId} query={query} />

      <NewChatModal open={newChatOpen} onOpenChange={setNewChatOpen} />
      <NewGroupModal open={newGroupOpen} onOpenChange={setNewGroupOpen} />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
