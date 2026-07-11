"use client";

import * as React from "react";
import { FileText, Reply as ReplyIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import { UserAvatar } from "@/components/ui/avatar";
import { Receipt } from "@/components/chat/Receipt";
import { ReplyQuote } from "@/components/chat/ReplyPreview";
import { ReactionPicker, ReactionPills, ReactionTrigger } from "@/components/chat/ReactionBar";
import { sendReactionAdd, sendReactionRemove } from "@/lib/ws";
import { useAuthStore } from "@/lib/store/auth";
import { deriveStatus } from "@/lib/store/messages";
import { resolveMediaUrl } from "@/lib/api";
import type { Message } from "@/lib/types";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function MessageBubble({
  message,
  isOwn,
  showSender,
  senderName,
  senderAvatar,
  conversationId,
  otherMemberIds,
  onReply,
  chatColor,
}: {
  message: Message;
  isOwn: boolean;
  showSender: boolean;
  senderName: string;
  senderAvatar?: string | null;
  conversationId: number;
  otherMemberIds: number[];
  onReply: (message: Message) => void;
  chatColor?: string | null;
}) {
  const selfId = useAuthStore((s) => s.user?.id ?? -1);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const longPressTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  if (message.type === "system") {
    return (
      <div className="flex justify-center py-1">
        <span className="rounded-full bg-bg-panel px-3 py-1 text-xs text-muted-foreground">{message.content}</span>
      </div>
    );
  }

  const clientStatus = message.status === "sending" || message.status === "failed" ? message.status : undefined;
  const status = clientStatus ?? deriveStatus(conversationId, message.id, selfId, otherMemberIds);

  function toggleEmoji(emoji: string) {
    const mine = message.reactions.some((r) => r.emoji === emoji && r.user_id === selfId);
    if (mine) sendReactionRemove({ message_id: message.id, emoji });
    else sendReactionAdd({ message_id: message.id, emoji });
  }

  function onTouchStart() {
    longPressTimer.current = setTimeout(() => setPickerOpen(true), 450);
  }
  function onTouchEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }

  return (
    <div className={cn("group flex gap-2 px-4 py-0.5", isOwn ? "justify-end" : "justify-start")}>
      {!isOwn ? (
        <div className="w-8 shrink-0 self-end">
          {showSender ? (
            <UserAvatar id={message.sender_id} name={senderName} src={senderAvatar} className="h-8 w-8 text-xs" />
          ) : null}
        </div>
      ) : null}

      <div className={cn("relative flex max-w-[70%] flex-col", isOwn ? "items-end" : "items-start")}>
        <div className="relative">
          {!isOwn && showSender ? (
            <div className="mb-0.5 px-1 text-xs font-medium text-signal-blue">{senderName}</div>
          ) : null}

          {/* hover/long-press action bar */}
          <div
            className={cn(
              "pointer-events-none absolute -top-9 z-10 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100",
              isOwn ? "right-0" : "left-0"
            )}
          >
            <div className="pointer-events-auto flex gap-1">
              <ReactionTrigger onPress={() => setPickerOpen((o) => !o)} />
              <button
                onClick={() => onReply(message)}
                title="Reply"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-bg-elevated text-muted-foreground shadow hover:text-foreground"
              >
                <ReplyIcon className="h-4 w-4" />
              </button>
            </div>
          </div>

          <ReactionPicker
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            onPick={toggleEmoji}
            align={isOwn ? "right" : "left"}
          />

          <div
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
            style={isOwn && chatColor ? { backgroundColor: chatColor } : undefined}
            className={cn(
              "rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm",
              isOwn
                ? "rounded-br-md bg-bubble-sent text-bubble-sent-fg"
                : "rounded-bl-md bg-bubble-received text-bubble-received-fg",
              message.deleted_at && "italic opacity-60"
            )}
          >
            {message.reply_to ? (
              <ReplyQuote
                preview={message.reply_to}
                senderName={message.reply_to.sender_name ?? "Message"}
                className="mb-1.5 bg-black/15"
              />
            ) : null}

            {message.deleted_at ? (
              <p>This message was deleted</p>
            ) : message.type === "image" && message.attachment ? (
              <div className="flex flex-col gap-1">
                <a href={resolveMediaUrl(message.attachment.url)} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveMediaUrl(message.attachment.url)}
                    alt={message.attachment.filename}
                    className="max-h-72 max-w-full rounded-lg object-cover"
                  />
                </a>
                {message.content ? <p>{message.content}</p> : null}
              </div>
            ) : message.type === "file" && message.attachment ? (
              <a
                href={resolveMediaUrl(message.attachment.url)}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2.5 rounded-lg bg-black/10 px-2.5 py-2 hover:bg-black/20"
              >
                <FileText className="h-6 w-6 shrink-0" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{message.attachment.filename}</div>
                  <div className="text-xs opacity-70">{formatBytes(message.attachment.size_bytes)}</div>
                </div>
              </a>
            ) : (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            )}

            <div
              className={cn(
                "mt-1 flex items-center gap-1 text-[10px]",
                isOwn ? "justify-end text-white/70" : "justify-end text-muted-foreground"
              )}
            >
              <span>{formatTime(message.created_at)}</span>
              {message.edited_at ? <span>(edited)</span> : null}
              {isOwn ? <Receipt status={status} /> : null}
            </div>
          </div>
        </div>

        <ReactionPills reactions={message.reactions} messageId={message.id} align={isOwn ? "end" : "start"} />
      </div>
    </div>
  );
}
