"use client";

import { X, Reply } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message, ReplyPreview as ReplyPreviewT } from "@/lib/types";

function labelFor(preview: ReplyPreviewT | Message): string {
  if (preview.type === "image") return "📷 Photo";
  if (preview.type === "file") return "📎 File";
  return preview.content ?? "";
}

/** Compact quoted block used both above the Composer and inside a MessageBubble. */
export function ReplyQuote({
  preview,
  senderName,
  onClear,
  className,
}: {
  preview: ReplyPreviewT | Message;
  senderName: string;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border-l-2 border-signal-blue bg-black/10 px-2.5 py-1.5 text-xs",
        className
      )}
    >
      <Reply className="h-3.5 w-3.5 shrink-0 text-signal-blue" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-signal-blue">{senderName}</div>
        <div className="truncate opacity-80">{labelFor(preview)}</div>
      </div>
      {onClear ? (
        <button onClick={onClear} className="shrink-0 rounded-full p-0.5 hover:bg-bg-hover">
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
