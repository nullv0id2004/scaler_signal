"use client";

import * as React from "react";
import { Paperclip, SendHorizontal, Image as ImageIcon, Smile, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ReplyQuote } from "@/components/chat/ReplyPreview";
import { useAuthStore } from "@/lib/store/auth";
import { useMessagesStore } from "@/lib/store/messages";
import { useSpeechRecognition } from "@/lib/useSpeechRecognition";
import { sendMessage, sendTypingStart, sendTypingStop, makeTempId } from "@/lib/ws";
import { uploadAttachment, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Message } from "@/lib/types";

const TYPING_IDLE_MS = 2000;

// Compact emoji palette for the composer picker.
const EMOJI_PALETTE = [
  "😀", "😁", "😂", "🤣", "😊", "😍", "😘", "😎",
  "🤔", "😴", "😅", "😇", "🙃", "😉", "🥳", "😭",
  "😡", "👍", "👎", "👏", "🙏", "🙌", "💪", "🔥",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "✨", "🎉",
  "😮", "😢", "🤯", "🥺", "😜", "🤗", "👀", "💯",
];

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
  const [showEmoji, setShowEmoji] = React.useState(false);
  const isTypingRef = React.useRef(false);
  const idleTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const imageInputRef = React.useRef<HTMLInputElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const emojiRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!showEmoji) return;
    function onDocClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showEmoji]);

  function insertEmoji(emoji: string) {
    const ta = textareaRef.current;
    const start = ta?.selectionStart ?? content.length;
    const end = ta?.selectionEnd ?? content.length;
    const next = content.slice(0, start) + emoji + content.slice(end);
    setContent(next);
    if (!isTypingRef.current) {
      sendTypingStart({ conversation_id: conversationId });
      isTypingRef.current = true;
    }
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        const pos = start + emoji.length;
        el.setSelectionRange(pos, pos);
      }
    });
  }

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
    interimRef.current = "";
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

  // Live-dictate into the message box: show interim words as you speak, then
  // commit the phrase when the engine finalizes it. `interimRef` holds the
  // uncommitted tail currently shown so the next update can replace it.
  const interimRef = React.useRef("");
  const handleTranscript = React.useCallback(
    (text: string, isFinal: boolean) => {
      const cleaned = text.trim();
      const prevInterim = interimRef.current;
      interimRef.current = isFinal ? "" : cleaned;
      setContent((prev) => {
        let base = prev;
        if (prevInterim && base.endsWith(prevInterim)) {
          base = base.slice(0, base.length - prevInterim.length).replace(/\s*$/, "");
        }
        if (!cleaned) return base;
        return base ? base + " " + cleaned : cleaned;
      });
      if (!isTypingRef.current) {
        sendTypingStart({ conversation_id: conversationId });
        isTypingRef.current = true;
      }
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(stopTyping, TYPING_IDLE_MS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId]
  );

  const speech = useSpeechRecognition({
    onResult: (text, isFinal) => handleTranscript(text, isFinal),
    onError: (code) => {
      if (code === "not-allowed" || code === "service-not-allowed") {
        toast.error("Microphone permission denied");
      } else if (code !== "no-speech" && code !== "aborted") {
        toast.error("Voice input error");
      }
    },
  });

  React.useEffect(() => {
    return () => {
      stopTyping();
      speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  function send() {
    const text = content.trim();
    if (!text) return;
    stopTyping();
    speech.stop();

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

    interimRef.current = "";
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
        <div ref={emojiRef} className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title="Emoji"
            onClick={() => setShowEmoji((v) => !v)}
          >
            <Smile className="h-5 w-5" />
          </Button>
          {showEmoji ? (
            <div className="absolute bottom-12 left-0 z-20 grid w-64 grid-cols-8 gap-0.5 rounded-lg border border-border bg-bg-elevated p-2 shadow-xl">
              {EMOJI_PALETTE.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertEmoji(emoji)}
                  className="rounded p-1 text-lg transition-transform hover:scale-125 hover:bg-bg-hover"
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {speech.supported ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            title={speech.listening ? "Stop dictation" : "Dictate"}
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            className={cn(speech.listening && "animate-pulse text-danger")}
          >
            {speech.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </Button>
        ) : null}
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          placeholder={uploading ? "Uploading…" : speech.listening ? "Listening…" : "Message"}
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
