"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Header } from "@/components/chat/Header";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { GroupInfoDrawer } from "@/components/chat/GroupInfoDrawer";
import { useConversation } from "@/lib/api";
import { useConversationsUiStore } from "@/lib/store/conversations";
import type { Message } from "@/lib/types";

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const conversationId = Number(params.id);
  const { data: conversation, isLoading, isError } = useConversation(conversationId);
  const setActive = useConversationsUiStore((s) => s.setActive);

  const [replyTo, setReplyTo] = React.useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = React.useState(false);

  // Reset per-conversation UI state during render when navigating between chats
  // (React's recommended "adjusting state on prop change" pattern — avoids a
  // setState-in-effect cascade for state that only needs to reset on id change).
  const [renderedForId, setRenderedForId] = React.useState(conversationId);
  if (conversationId !== renderedForId) {
    setRenderedForId(conversationId);
    setReplyTo(null);
    setInfoOpen(false);
  }

  React.useEffect(() => {
    setActive(conversationId);
    return () => setActive(null);
  }, [conversationId, setActive]);

  const resolveSenderName = React.useCallback(
    (userId: number) => conversation?.members?.find((m) => m.user_id === userId)?.user?.display_name ?? "Unknown",
    [conversation]
  );

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  if (isError || !conversation) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Conversation not found
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <Header conversation={conversation} onOpenInfo={() => setInfoOpen(true)} />
      <MessageList conversation={conversation} onReply={setReplyTo} />
      <Composer
        conversationId={conversationId}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        resolveSenderName={resolveSenderName}
      />
      <GroupInfoDrawer conversation={conversation} open={infoOpen} onOpenChange={setInfoOpen} />
    </div>
  );
}
