"use client";

import Link from "next/link";
import { UserAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { conversationAvatar, conversationTitle, messagePreview } from "@/lib/conversation-utils";
import { formatListTimestamp } from "@/lib/time";
import { useAuthStore } from "@/lib/store/auth";
import type { ConversationSummary } from "@/lib/types";

export function ConvItem({ conv, active }: { conv: ConversationSummary; active: boolean }) {
  const selfId = useAuthStore((s) => s.user?.id ?? -1);
  const title = conversationTitle(conv, selfId);
  const avatar = conversationAvatar(conv, selfId);
  const preview = messagePreview(conv.last_message, selfId, conv.members);
  const timestamp = conv.last_message?.created_at ?? conv.created_at;

  return (
    <Link
      href={`/c/${conv.id}`}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-bg-hover",
        active && "bg-bg-active"
      )}
    >
      <UserAvatar id={avatar.id} name={title} src={avatar.url} className="h-12 w-12 text-base" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatListTimestamp(timestamp)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs text-muted-foreground">{preview}</span>
          {conv.unread_count > 0 ? (
            <Badge className="shrink-0">{conv.unread_count > 99 ? "99+" : conv.unread_count}</Badge>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
