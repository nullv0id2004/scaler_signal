"use client";

import * as React from "react";
import { Paperclip, SendHorizontal, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ReplyQuote } from "@/components/chat/ReplyPreview";
import { useAuthStore } from "@/lib/store/auth";
import { useMessagesStore } from "@/lib/store/messages";
import { sendMessage, sendTypingStart, sendTypingStop, makeTempId } from "@/lib/ws";
import { uploadAttachment, ApiError } from "@/lib/api";
import type { Message } from "@/lib/types";

const TYPING_IDLE_MS = 2000;

export function Composer({
  conversationId,
  replyTo,
  onClearReply,
  resolveSenderName,
}: {
  conversationId: number;
  replyTo: Message | null;
  onClearReply: () => void;
  resolveSenderName: (userId: number) => string;
}) {
  const selfId = useAuthStore((s) => s.user?.id ?? -1);
  const addOptimistic = useMessagesStore((s) => s.addOptimistic);
  const [content, setContent] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const isTypingRef = React.useRef(false);
  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);

  function stopTyping() {
    if (isTypingRef.current) {
      sendTypingStop({ conversation_id: conversationId });
      isTypingRef.current = false;
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    if (e.target.value.trim().length === 0) {
      stopTyping();
      return;
    }
    if (!isTypingRef.current) {
      sendTypingStart({ conversation_id: conversationId });
      isTypingRef.current = true;
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
  }

  React.useEffect(() => {
    return () => stopTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  function send() {
    const text = content.trim();
    if (!text) return;
    stopTyping();

    const temp_id = makeTempId();
    const now = new Date().toISOString();
    addOptimistic(conversationId, {
      id: -Date.now(),
      conversation_id: conversationId,
      sender_id: selfId,
      type: "text",
      content: text,
      reply_to_message_id: replyTo?.id ?? null,
      reply_to: replyTo
        ? {
            id: replyTo.id,
            sender_id: replyTo.sender_id,
            sender_name: resolveSenderName(replyTo.sender_id),
            content: replyTo.content,
            type: replyTo.type,
          }
        : null,
      attachment: null,
      reactions: [],
      created_at: now,
      edited_at: null,
      deleted_at: null,
      temp_id,
      status: "sending",
    });

    sendMessage({
      conversation_id: conversationId,
      content: text,
      reply_to_id: replyTo?.id ?? null,
      temp_id,
    });

    setContent("");
    onClearReply();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function handleFile(file: File, kind: "image" | "file") {
    setUploading(true);
    try {
      const uploaded = await uploadAttachment(file);
      const temp_id = makeTempId();
      const now = new Date().toISOString();
      addOptimistic(conversationId, {
        id: -Date.now(),
        conversation_id: conversationId,
        sender_id: selfId,
        type: kind,
        content: null,
        reply_to_message_id: null,
        reply_to: null,
        attachment: {
          id: -1,
          message_id: -1,
          url: uploaded.url,
          filename: file.name,
          mime_type: uploaded.mime,
          size_bytes: uploaded.size,
          width: uploaded.w,
          height: uploaded.h,
        },
        reactions: [],
        created_at: now,
        edited_at: null,
        deleted_at: null,
        temp_id,
        status: "sending",
      });
      sendMessage({
        conversation_id: conversationId,
        content: "",
        temp_id,
        type: kind,
        attachment: {
          url: uploaded.url,
          filename: file.name,
          mime_type: uploaded.mime,
          size_bytes: uploaded.size,
          width: uploaded.w,
          height: uploaded.h,
        },
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border-t border-border bg-bg-panel px-4 py-3">
      {replyTo ? (
        <div className="mb-2 flex items-start gap-2">
          <ReplyQuote
            preview={replyTo}
            senderName={resolveSenderName(replyTo.sender_id)}
            onClear={onClearReply}
            className="flex-1"
          />
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file, "file");
            e.target.value = "";
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file, "image");
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Attach file"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-5 w-5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Attach image"
          disabled={uploading}
          onClick={() => imageInputRef.current?.click()}
        >
          <ImageIcon className="h-5 w-5" />
        </Button>
        <Textarea
          value={content}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder={uploading ? "Uploading…" : "Message"}
          rows={1}
          className="max-h-32 min-h-[2.75rem] flex-1"
        />
        <Button type="button" size="icon" disabled={!content.trim()} onClick={send} title="Send">
          <SendHorizontal className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
