"use client";

import * as React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { TypingIndicator } from "@/components/chat/TypingIndicator";
import { useMessageHistory, HISTORY_PAGE_SIZE } from "@/lib/api";
import { useMessagesStore } from "@/lib/store/messages";
import { useAuthStore } from "@/lib/store/auth";
import { sendMessageRead } from "@/lib/ws";
import { dayKey, formatDayDivider } from "@/lib/time";
import type { Conversation, Message } from "@/lib/types";

export function MessageList({
  conversation,
  onReply,
}: {
  conversation: Conversation;
  onReply: (message: Message) => void;
}) {
  const conversationId = conversation.id;
  const selfId = useAuthStore((s) => s.user?.id ?? -1);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessageHistory(conversationId);

  const setInitialPages = useMessagesStore((s) => s.setInitialPages);
  const appendOlderPage = useMessagesStore((s) => s.appendOlderPage);
  const setHasMoreOlder = useMessagesStore((s) => s.setHasMoreOlder);
  const hasMoreOlder = useMessagesStore((s) => s.hasMoreOlder[conversationId] ?? true);
  const messages = useMessagesStore((s) => s.byConversation[conversationId] ?? []);

  const consumedPages = React.useRef<Record<number, number>>({});
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = React.useRef<number>(0);
  const isPagingRef = React.useRef(false);

  const members = React.useMemo(() => conversation.members ?? [], [conversation.members]);
  const otherMemberIds = React.useMemo(
    () => members.map((m) => m.user_id).filter((id) => id !== selfId),
    [members, selfId]
  );
  const memberById = React.useMemo(() => {
    const map = new Map<number, (typeof members)[number]>();
    members.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [members]);

  // Sync REST history pages into the shared message store.
  React.useEffect(() => {
    if (!data) return;
    const consumed = consumedPages.current[conversationId] ?? 0;
    if (data.pages.length === consumed) return;

    if (consumed === 0) {
      setInitialPages(conversationId, [...(data.pages[0] ?? [])].reverse());
    } else {
      isPagingRef.current = true;
      prevScrollHeightRef.current = viewportRef.current?.scrollHeight ?? 0;
      for (let i = consumed; i < data.pages.length; i++) {
        appendOlderPage(conversationId, [...data.pages[i]].reverse());
      }
    }
    consumedPages.current[conversationId] = data.pages.length;
    const lastPage = data.pages[data.pages.length - 1];
    setHasMoreOlder(conversationId, (lastPage?.length ?? 0) === HISTORY_PAGE_SIZE);
  }, [data, conversationId, setInitialPages, appendOlderPage, setHasMoreOlder]);

  // Preserve scroll position after prepending older messages.
  React.useLayoutEffect(() => {
    if (isPagingRef.current && viewportRef.current) {
      const delta = viewportRef.current.scrollHeight - prevScrollHeightRef.current;
      viewportRef.current.scrollTop = delta;
      isPagingRef.current = false;
    }
  }, [messages]);

  const initialScrollDone = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (messages.length > 0 && initialScrollDone.current !== conversationId && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
      initialScrollDone.current = conversationId;
      markRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length > 0, conversationId]);

  function isNearBottom() {
    const el = viewportRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function markRead() {
    const last = messages[messages.length - 1];
    if (last && last.id > 0) {
      sendMessageRead({ conversation_id: conversationId, message_id: last.id });
    }
  }

  const lastMessageId = messages[messages.length - 1]?.id;
  const wasNearBottomRef = React.useRef(true);
  React.useEffect(() => {
    if (wasNearBottomRef.current && viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
      markRead();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageId]);

  const handleScroll = React.useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    wasNearBottomRef.current = isNearBottom();
    if (el.scrollTop < 120 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
    if (isNearBottom()) markRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNextPage, isFetchingNextPage, messages]);

  React.useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Day + sender grouping
  const rows: React.ReactNode[] = [];
  let lastDay: string | null = null;
  let lastSenderId: number | null = null;

  messages.forEach((message, idx) => {
    const day = dayKey(message.created_at);
    if (day !== lastDay) {
      rows.push(
        <div key={`day-${day}-${idx}`} className="flex justify-center py-3">
          <span className="rounded-full bg-bg-panel px-3 py-1 text-xs font-medium text-muted-foreground">
            {formatDayDivider(message.created_at)}
          </span>
        </div>
      );
      lastDay = day;
      lastSenderId = null;
    }

    const showSender = message.sender_id !== lastSenderId && message.type !== "system";
    const senderMember = memberById.get(message.sender_id);
    const senderName = senderMember?.user?.display_name ?? "Unknown";

    rows.push(
      <MessageBubble
        key={message.temp_id ?? message.id}
        message={message}
        isOwn={message.sender_id === selfId}
        showSender={showSender && conversation.type === "group"}
        senderName={senderName}
        senderAvatar={senderMember?.user?.avatar_url}
        conversationId={conversationId}
        otherMemberIds={otherMemberIds}
        onReply={onReply}
      />
    );
    lastSenderId = message.sender_id;
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1" viewportRef={viewportRef}>
        <div className="flex flex-col py-3">
          {hasMoreOlder && isFetchingNextPage ? (
            <div className="py-2 text-center text-xs text-muted-foreground">Loading older messages…</div>
          ) : null}
          {rows}
        </div>
      </ScrollArea>
      <TypingIndicator
        conversationId={conversationId}
        typingUserNames={(userId) => memberById.get(userId)?.user?.display_name ?? null}
      />
    </div>
  );
}
