"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Info, Phone, Video } from "lucide-react";
import { UserAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { conversationAvatar, conversationTitle, otherMember } from "@/lib/conversation-utils";
import { formatLastSeen } from "@/lib/time";
import { usePresenceStore } from "@/lib/store/presence";
import { useAuthStore } from "@/lib/store/auth";
import { toast } from "sonner";
import type { Conversation } from "@/lib/types";

export function Header({
  conversation,
  onOpenInfo,
}: {
  conversation: Conversation;
  onOpenInfo: () => void;
}) {
  const selfId = useAuthStore((s) => s.user?.id ?? -1);
  const title = conversationTitle(conversation, selfId);
  const avatar = conversationAvatar(conversation, selfId);
  const other = otherMember(conversation, selfId);
  const online = usePresenceStore((s) => (other ? s.isOnline(other.user_id) : false));
  const lastSeen = usePresenceStore((s) => (other ? s.lastSeen(other.user_id) : null));

  const subtitle =
    conversation.type === "group"
      ? `${conversation.members?.length ?? 0} members`
      : online
        ? "online"
        : formatLastSeen(lastSeen ?? other?.user?.last_seen_at ?? null);

  function comingSoon(label: string) {
    toast.info(`${label} coming soon`);
  }

  return (
    <div className="flex items-center gap-2 border-b border-border bg-bg-panel px-3 py-2.5">
      <Link href="/" className="rounded-full p-1.5 hover:bg-bg-hover md:hidden">
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <button onClick={onOpenInfo} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-1 py-1 hover:bg-bg-hover">
        <UserAvatar id={avatar.id} name={title} src={avatar.url} className="h-10 w-10" />
        <div className="min-w-0 text-left">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
        </div>
      </button>
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="icon" onClick={() => comingSoon("Voice calls")}>
          <Phone className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => comingSoon("Video calls")}>
          <Video className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onOpenInfo} title="Conversation info">
          <Info className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
