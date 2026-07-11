"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UserAvatar } from "@/components/ui/avatar";
import { useConversations, useCreateConversation, useSearchUsers } from "@/lib/api";
import { useAuthStore } from "@/lib/store/auth";
import { conversationTitle } from "@/lib/conversation-utils";
import { ConvItem } from "@/components/conversation/ConvItem";
import { toast } from "sonner";

export function ConvList({ activeId, query }: { activeId: number | null; query: string }) {
  const router = useRouter();
  const selfId = useAuthStore((s) => s.user?.id ?? -1);
  const { data: conversations, isLoading } = useConversations();
  const createConversation = useCreateConversation();

  const q = query.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    if (!conversations) return [];
    if (!q) return conversations;
    return conversations.filter((c) => conversationTitle(c, selfId).toLowerCase().includes(q));
  }, [conversations, q, selfId]);

  const existingContactIds = React.useMemo(() => {
    const ids = new Set<number>();
    conversations
      ?.filter((c) => c.type === "direct")
      .forEach((c) => c.members?.forEach((m) => m.user_id !== selfId && ids.add(m.user_id)));
    return ids;
  }, [conversations, selfId]);

  const { data: userResults } = useSearchUsers(q.length > 0 ? q : "");
  const newContacts = (userResults ?? []).filter(
    (u) => u.id !== selfId && !existingContactIds.has(u.id)
  );

  async function startDirect(userId: number) {
    try {
      const conv = await createConversation.mutateAsync({ type: "direct", member_ids: [userId] });
      router.push(`/c/${conv.id}`);
    } catch {
      toast.error("Couldn't start conversation");
    }
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-0.5 px-2 pb-4">
        {isLoading ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Loading conversations…</div>
        ) : filtered.length === 0 && newContacts.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            {q ? "No matches" : "No conversations yet. Start a new chat!"}
          </div>
        ) : null}

        {filtered.map((conv) => (
          <ConvItem key={conv.id} conv={conv} active={conv.id === activeId} />
        ))}

        {newContacts.length > 0 ? (
          <div className="mt-2">
            <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Contacts
            </div>
            {newContacts.map((u) => (
              <button
                key={u.id}
                onClick={() => startDirect(u.id)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-bg-hover"
              >
                <UserAvatar id={u.id} name={u.display_name} src={u.avatar_url} className="h-12 w-12 text-base" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{u.display_name}</div>
                  <div className="truncate text-xs text-muted-foreground">@{u.username}</div>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </ScrollArea>
  );
}
